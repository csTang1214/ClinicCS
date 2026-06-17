import { Tool } from '@langchain/core/tools';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { classifyIntent } from './utils/intent_classification.js';
import { handleRAGIntent } from './utils/intent_actions.js';
import { Pool } from 'pg';
import Groq from 'groq-sdk';
import redis from './redis_client.js';

interface ChatResult {
  messages: BaseMessage[];
  action?: string;
  actionData?: Record<string, any>;
}

interface AgentWrapper {
  invoke: (input: { input: string; userId?: string | number | null; sessionId?: string }) => Promise<ChatResult>;
}

interface AppointmentInfo {
  id: number;
  date: string;
  doctorName: string;
  service: string;
  status: string;
}

interface SessionState {
  activeIntent: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  collectedFields: Record<string, string | null>;
  phase: 'collecting' | 'date_selection' | 'service_selection' | 'slot_selection' | 'awaiting_confirmation' | 'complete';
  ragContextCache: string;
  pendingActionData?: Record<string, any>;
  pendingAppointment?: AppointmentInfo;
}

const SESSION_TTL_SECONDS = 7200;
const sessionKey = (id: string) => `session:${id}`;

// In-memory fallback used when Redis is unreachable
const memoryStore = new Map<string, SessionState>();

async function getSession(sessionId: string): Promise<SessionState | null> {
  try {
    const raw = await redis.get(sessionKey(sessionId));
    if (raw) return JSON.parse(raw) as SessionState;
  } catch {
    const mem = memoryStore.get(sessionId);
    if (mem) return mem;
  }
  return null;
}

async function setSession(sessionId: string, state: SessionState): Promise<void> {
  try {
    await redis.set(sessionKey(sessionId), JSON.stringify(state), 'EX', SESSION_TTL_SECONDS);
    memoryStore.delete(sessionId); // clean up fallback entry once Redis is back
  } catch {
    memoryStore.set(sessionId, state);
  }
}

async function deleteSession(sessionId: string): Promise<void> {
  memoryStore.delete(sessionId);
  try { await redis.del(sessionKey(sessionId)); } catch { /* non-fatal */ }
}

const SLOT_DURATION_MINUTES = 60;

// Weekday/Saturday fallback slots when RAG parsing fails
const FALLBACK_SLOTS: Record<string, string[]> = {
  weekday:  ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
  saturday: ['10:00', '11:00', '12:00', '13:00'],
  sunday:   [],
};

// ── Field schemas (BOOKING uses UI, no LLM extraction) ────────────────────────
const FIELD_SHAPES: Record<string, Record<string, null>> = {
  RESCHEDULE:   { appointment_id: null },
  CANCELLATION: { appointment_id: null },
};

const FIELD_RULES: Record<string, Record<string, string>> = {
  RESCHEDULE: {
    appointment_id: '"appointment_id": numeric appointment ID the patient stated (e.g. "42", "ID 45", "number 7"). Return as string. null if not stated.',
  },
  CANCELLATION: {
    appointment_id: '"appointment_id": numeric appointment ID the patient stated (e.g. "42", "appointment 7"). Return as string. null if not stated.',
  },
};

// ── Field extraction (RESCHEDULE / CANCELLATION only) ────────────────────────

async function extractFields(
  groq: Groq,
  intent: string,
  history: Array<{ role: string; content: string }>,
  currentMessage: string,
): Promise<Record<string, string | null>> {
  const shape = FIELD_SHAPES[intent];
  if (!shape) return {};

  const conversation = [...history.slice(-4), { role: 'user', content: currentMessage }]
    .map(h => `${h.role.toUpperCase()}: ${h.content}`)
    .join('\n');

  const rules = Object.keys(shape)
    .map(key => FIELD_RULES[intent]?.[key] ?? `"${key}": the patient's ${key}. null if not stated.`)
    .join('\n');

  const prompt = `Read the conversation and extract ONLY what the PATIENT has explicitly stated.
Return ONLY valid JSON with these exact keys. Use null for anything not clearly stated.

${JSON.stringify(shape)}

Field rules:
${rules}

IMPORTANT: Do not infer or guess. If the patient did not say it, return null.

Conversation:
${conversation}

JSON:`;

  try {
    const resp = await groq.chat.completions.create({
      model: process.env.GROQ_CLASSIFIER_MODEL || 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 80,
    });
    const raw = resp.choices[0].message.content ?? '';
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) { console.warn('[Extract] No JSON:', raw.slice(0, 80)); return {}; }
    const parsed = JSON.parse(match[0]);
    console.log(`[Extract] ${intent}:`, parsed);
    return parsed;
  } catch (err) {
    console.warn('[Extract] Failed:', err instanceof Error ? err.message : err);
    return {};
  }
}

// ── System prompts ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  intent: string,
  ragContext: string,
  collectedFields?: Record<string, string | null>,
): string {
  const ctx = ragContext ? `\n\nClinic info:\n${ragContext}` : '';
  const fieldLines = collectedFields
    ? Object.entries(collectedFields).filter(([, v]) => v).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    : '';
  const fieldCtx = fieldLines ? `\n\nDetails collected so far:\n${fieldLines}` : '';

  switch (intent) {
    case 'RESCHEDULE':
      return `You are a clinic scheduling assistant helping reschedule an appointment.

To get started, ask the patient for their appointment ID.

Rules:
- Ask for the appointment ID if not yet provided.
- If the patient doesn't know their ID, suggest checking their account page.
- Keep replies short and friendly.${fieldCtx}${ctx}`;

    case 'CANCELLATION':
      return `You are a clinic assistant helping cancel an appointment.

To get started, ask the patient for their appointment ID.

Rules:
- Ask for the appointment ID if not yet provided.
- If the patient doesn't know their ID, suggest checking their account page.
- Be empathetic.${fieldCtx}${ctx}`;

    default:
      return ragContext
        ? `You are a clinic customer service assistant. Answer the patient's question using ONLY the clinic information provided below. Be concise and direct. Do not say you are "checking", "looking up", or "searching" — all information you need is already in the context below. If the context doesn't cover the question, say so briefly.

${ragContext}`
        : `You are a clinic customer service assistant. Answer the patient's question briefly and directly. If you don't have specific information, suggest the patient call or visit the clinic.`;
  }
}

const TRIGGER_RE = /^(i\s+)?(would\s+like|want|need|am\s+looking)\s+(to\s+)?(book|make|schedule)|^(please\s+)?(book|schedule|make)\s+an?\s+appointment/i;

function processResponse(text: string, fields?: Record<string, string | null>): string {
  let result = text.replace(/<\|im_start\|>[\s\S]*/g, '').replace(/<\|im_end\|>/g, '');
  if (fields) {
    const subs: Record<string, string> = {
      appointment_id: fields.appointment_id || '',
      time: fields.time || '',
    };
    result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => subs[key] ?? '');
  }
  return result.replace(/\{\{[^}]*\}\}/g, '').replace(/  +/g, ' ').trim();
}

// ── Month map ─────────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseDateTime(dateStr: string, timeStr: string): Date | null {
  const clean = dateStr
    .replace(/(\d+)\s*(st|nd|rd|th)/gi, '$1')
    .replace(/\s+of\s+/gi, ' ')
    .trim().toLowerCase();

  const tm = timeStr.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
  let h = 0, min = 0;
  if (tm) {
    h = parseInt(tm[1]); min = tm[2] ? parseInt(tm[2]) : 0;
    const p = tm[3].toLowerCase();
    if (p === 'pm' && h !== 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
  } else {
    const hm = timeStr.match(/(\d+):(\d+)/);
    if (hm) { h = parseInt(hm[1]); min = parseInt(hm[2]); }
  }

  // Always build in UTC so stored times and slot strings always agree.
  const currentYear = new Date().getUTCFullYear();

  const dm = clean.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
  if (dm) {
    const month = MONTH_MAP[dm[2]];
    if (month) return new Date(Date.UTC(dm[3] ? parseInt(dm[3]) : currentYear, month - 1, parseInt(dm[1]), h, min));
  }

  const md = clean.match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  if (md) {
    const month = MONTH_MAP[md[1]];
    if (month) return new Date(Date.UTC(md[3] ? parseInt(md[3]) : currentYear, month - 1, parseInt(md[2]), h, min));
  }

  // ISO 2026-06-19 — from the date picker
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Date.UTC(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]), h, min));

  console.warn(`[DateTime] Could not parse: "${dateStr}"`);
  return null;
}

// Returns "Monday, June 20, 2026" from an ISO string
function formatDateForDisplay(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// ── Regex fallback for appointment IDs ────────────────────────────────────────

function regexExtractAppointmentId(text: string): string | null {
  const m = text.match(/(?:appointment\s+(?:id\s+|#\s*)?|id\s+#?\s*|#\s*|number\s+)(\d+)/i)
           ?? text.match(/\b(\d{1,6})\b/);
  return m ? m[1] : null;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function findDoctorByService(pool: Pool, service: string): Promise<{ id: number; name: string } | null> {
  const terms = [service, ...service.split(/\s+/).filter(w => w.length >= 3)];
  try {
    for (const term of terms) {
      const res = await pool.query(
        `SELECT id, first_name || ' ' || last_name AS name FROM doctors
         WHERE is_active = true AND LOWER(specialty) LIKE $1 LIMIT 1`,
        [`%${term.toLowerCase()}%`],
      );
      if (res.rows.length > 0) return res.rows[0];
    }
    const fallback = await pool.query(
      `SELECT id, first_name || ' ' || last_name AS name FROM doctors WHERE is_active = true LIMIT 1`,
    );
    return fallback.rows[0] ?? null;
  } catch (err) {
    console.error('[DB] Doctor lookup error:', err);
    return null;
  }
}

const FALLBACK_SERVICES = ['General Practitioner', 'Dental', 'Physiotherapy', 'Dermatology', 'Cardiology'];

async function getAvailableServices(pool: Pool): Promise<string[]> {
  try {
    const res = await pool.query(
      `SELECT DISTINCT specialty FROM doctors
       WHERE is_active = true AND specialty IS NOT NULL
       ORDER BY specialty`,
    );
    const services = res.rows.map((r: any) => r.specialty as string);
    if (services.length === 0) {
      console.warn('[DB] getAvailableServices: no active doctors with specialties — using fallback list');
      return FALLBACK_SERVICES;
    }
    return services;
  } catch (err) {
    console.error('[DB] getAvailableServices error:', err);
    return FALLBACK_SERVICES;
  }
}

async function getClinicHoursRAG(
  pool: Pool,
  userId: string | number | null,
  sessionId: string,
): Promise<string> {
  try {
    const rag = await handleRAGIntent('CLINIC_INFO', {
      pool,
      message: 'clinic opening hours schedule policy',
      userId,
      sessionId,
    });
    return rag.success ? (rag.message || '') : '';
  } catch {
    return '';
  }
}

async function getClinicSlotsForDay(
  groq: Groq,
  ragContext: string,
  date: Date,
): Promise<string[]> {
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = DAY_NAMES[date.getUTCDay()];

  if (dayName === 'Sunday') return [];

  if (!ragContext) {
    return dayName === 'Saturday' ? FALLBACK_SLOTS.saturday : FALLBACK_SLOTS.weekday;
  }

  const prompt = `Based on the clinic policy below, list every 1-hour appointment slot available on ${dayName}.
Return ONLY a JSON array of 24-hour time strings. Example: ["10:00","11:00","12:00"]
If the clinic is closed on ${dayName}, return [].

Clinic policy:
${ragContext}

JSON array for ${dayName}:`;

  try {
    const resp = await groq.chat.completions.create({
      model: process.env.GROQ_CLASSIFIER_MODEL || 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 100,
    });
    const raw = resp.choices[0].message.content ?? '';
    const match = raw.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed: unknown = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        const valid = (parsed as unknown[])
          .filter((s): s is string => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s))
          .filter(s => { const h = parseInt(s.split(':')[0]); return h >= 8 && h <= 20; });
        if (valid.length > 0) {
          console.log(`[Slots] RAG slots for ${dayName}:`, valid);
          return valid;
        }
      }
    }
  } catch (err) {
    console.warn('[Slots] RAG parse failed:', err instanceof Error ? err.message : err);
  }

  console.log(`[Slots] Using fallback for ${dayName}`);
  return dayName === 'Saturday' ? FALLBACK_SLOTS.saturday : FALLBACK_SLOTS.weekday;
}

async function queryAvailability(
  pool: Pool,
  dateISO: string,
  clinicSlots: string[],
): Promise<{ available: string[]; occupied: string[]; date: string }> {
  try {
    const res = await pool.query(
      `SELECT to_char(appointment_date AT TIME ZONE 'UTC', 'HH24:MI') AS slot_time
       FROM appointments
       WHERE appointment_date >= ($1::date)
         AND appointment_date <  ($1::date + INTERVAL '1 day')
         AND status IN ('scheduled', 'rescheduled')`,
      [dateISO],
    );
    const taken = new Set(res.rows.map((r: any) => r.slot_time as string));
    const occupied = clinicSlots.filter(s => taken.has(s));
    const available = clinicSlots.filter(s => !taken.has(s));
    console.log(`[Availability] ${dateISO}: ${available.length} available, ${occupied.length} occupied`);
    return { available, occupied, date: dateISO };
  } catch (err) {
    console.error('[DB] queryAvailability error:', err);
    return { available: clinicSlots, occupied: [], date: dateISO };
  }
}

async function queryAppointmentById(
  pool: Pool,
  patientId: string | number,
  appointmentId: string,
): Promise<AppointmentInfo | null> {
  try {
    const res = await pool.query(
      `SELECT a.id, a.appointment_date, a.status,
              d.first_name || ' ' || d.last_name AS doctor_name,
              d.specialty
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.id = $1 AND a.patient_id = $2 AND a.status != 'cancelled'`,
      [appointmentId, patientId],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      date: row.appointment_date,
      doctorName: `Dr. ${row.doctor_name}`,
      service: row.specialty || 'General',
      status: row.status,
    };
  } catch (err) {
    console.error('[DB] queryAppointmentById error:', err);
    return null;
  }
}

// ── DB actions ────────────────────────────────────────────────────────────────

async function insertBooking(
  pool: Pool,
  patientId: string | number,
  fields: Record<string, string | null>,
): Promise<boolean> {
  const doctor = await findDoctorByService(pool, fields.service!);
  if (!doctor) { console.error('[Booking] No doctor for service:', fields.service); return false; }

  const date = parseDateTime(fields.date!, fields.time || '09:00');
  if (!date) { console.error('[Booking] Cannot parse date/time'); return false; }

  try {
    const res = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, duration_minutes, status)
       VALUES ($1, $2, $3, $4, 'scheduled') RETURNING id`,
      [patientId, doctor.id, date.toISOString(), SLOT_DURATION_MINUTES],
    );
    console.log(`[Booking] ✓ Created appointment ID=${res.rows[0].id}`);
    return true;
  } catch (err) {
    console.error('[Booking] Insert failed:', err);
    return false;
  }
}

async function rescheduleAppointment(
  pool: Pool,
  patientId: string | number,
  fields: Record<string, string | null>,
): Promise<boolean> {
  const newDate = parseDateTime(fields.new_date!, fields.time || '09:00');
  if (!newDate) { console.error('[Reschedule] Date parse failed'); return false; }

  try {
    const res = await pool.query(
      `UPDATE appointments
       SET appointment_date = $1, status = 'scheduled'
       WHERE id = $2 AND patient_id = $3 AND status != 'cancelled'
       RETURNING id`,
      [newDate.toISOString(), fields.appointment_id, patientId],
    );
    if ((res.rowCount ?? 0) === 0) { console.warn('[Reschedule] No matching appointment'); return false; }
    console.log(`[Reschedule] ✓ Appointment ${res.rows[0].id} moved to ${newDate.toISOString()}`);
    return true;
  } catch (err) {
    console.error('[Reschedule] Update failed:', err);
    return false;
  }
}

async function cancelAppointment(
  pool: Pool,
  patientId: string | number,
  fields: Record<string, string | null>,
): Promise<boolean> {
  try {
    const res = await pool.query(
      `UPDATE appointments
       SET status = 'cancelled'
       WHERE id = $1 AND patient_id = $2 AND status != 'cancelled'
       RETURNING id`,
      [fields.appointment_id, patientId],
    );
    if ((res.rowCount ?? 0) === 0) { console.warn('[Cancel] No matching appointment'); return false; }
    console.log(`[Cancel] ✓ Appointment ${res.rows[0].id} cancelled`);
    return true;
  } catch (err) {
    console.error('[Cancel] Update failed:', err);
    return false;
  }
}

const SUCCESS_MESSAGES: Record<string, [string, string]> = {
  BOOKING:      ['Your appointment has been booked! We\'ll send a confirmation to your registered email.', 'Sorry, there was an issue booking your appointment. Please contact the clinic directly.'],
  RESCHEDULE:   ['Your appointment has been rescheduled! We\'ll send an updated confirmation to your email.', 'Sorry, there was an issue rescheduling. Please contact the clinic directly.'],
  CANCELLATION: ['Your appointment has been cancelled. Let me know if you need to rebook!', 'Sorry, I couldn\'t cancel that appointment. Please contact the clinic directly.'],
};

// ── Session helpers ───────────────────────────────────────────────────────────

export async function clearChatSession(sessionId: string): Promise<void> {
  await deleteSession(sessionId);
}

async function persistSession(
  sessionId: string | undefined,
  session: SessionState,
  userMsg: string,
  botMsg: string,
  newIntent: string,
): Promise<void> {
  if (!sessionId) return;
  session.history.push({ role: 'user', content: userMsg });
  session.history.push({ role: 'assistant', content: botMsg });
  if (session.history.length > 20) session.history.splice(0, session.history.length - 20);
  session.activeIntent = newIntent;
  await setSession(sessionId, session);
}

async function generateLLMResponse(
  groq: Groq,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  fallback: string,
): Promise<string> {
  try {
    const resp = await groq.chat.completions.create({
      model: process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.3,
      max_tokens: 200,
      top_p: 0.9,
    });
    return resp.choices[0].message.content?.trim() || fallback;
  } catch (err) {
    console.warn('[LLM] generateLLMResponse failed:', err instanceof Error ? err.message : err);
    return fallback;
  }
}

// ── Groq tool-calling for RAG intents ────────────────────────────────────────

const CLINIC_INFO_TOOL: Groq.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_clinic_info',
    description:
      'Retrieves clinic information: hours, location, services, policies, payments, prescriptions, and emergency contacts. Always call this before answering any question about the clinic.',
    parameters: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The patient question to look up' },
      },
      required: ['query'],
    },
  },
};

async function generateWithToolCall(
  groq: Groq,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  intent: string,
  pool: Pool,
  userId: string | number | null,
  sessionId: string,
): Promise<string> {
  const chatModel = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';

  // Force tool call so the model MUST retrieve clinic data before responding
  const firstPass = await groq.chat.completions.create({
    model: chatModel,
    messages,
    tools: [CLINIC_INFO_TOOL],
    tool_choice: { type: 'function', function: { name: 'get_clinic_info' } },
    temperature: 0.1,
    max_tokens: 100,
  });

  const assistantMsg = firstPass.choices[0].message;
  const toolCalls = assistantMsg.tool_calls ?? [];

  if (toolCalls.length === 0) {
    // Model chose not to call — fall back to direct response
    return await generateLLMResponse(groq, messages, 'Please contact the clinic directly for assistance.');
  }

  // Execute the tool call(s)
  const toolResultMessages: Groq.Chat.ChatCompletionMessageParam[] = [
    ...messages,
    assistantMsg as Groq.Chat.ChatCompletionMessageParam,
  ];

  for (const tc of toolCalls) {
    let result = 'No clinic information found.';
    if (tc.function.name === 'get_clinic_info') {
      try {
        const args = JSON.parse(tc.function.arguments) as { query?: string };
        const rag = await handleRAGIntent(intent, {
          pool,
          message: args.query ?? messages[messages.length - 1].content,
          userId,
          sessionId,
        });
        if (rag.success && rag.message && !rag.message.startsWith('No relevant')) {
          result = rag.message.substring(0, 2000);
        }
      } catch (err) {
        console.warn('[RAG] Tool execution failed:', err instanceof Error ? err.message : err);
      }
    }
    console.log(`[RAG] Tool ${tc.function.name}: ${result.length} chars`);
    toolResultMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
  }

  // Final pass — model now has the retrieved context and produces the answer
  const finalPass = await groq.chat.completions.create({
    model: chatModel,
    messages: toolResultMessages,
    temperature: 0.3,
    max_tokens: 300,
  });

  return finalPass.choices[0].message.content?.trim() || 'Please contact the clinic directly for assistance.';
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export async function createChatAgent(_tools: Tool[], pool?: Pool): Promise<AgentWrapper> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  console.log('[Agent] Using Groq API');

  const shouldRetrieveRAG = (intent: string, confidence: number): boolean => {
    const always = new Set(['CLINIC_INFO', 'SERVICES', 'PAYMENT_BILLING', 'INSURANCE', 'PRESCRIPTION_REFERRAL']);
    if (intent === 'GENERAL_INQUIRY' || intent === 'OTHER') return confidence >= 0.8;
    return always.has(intent);
  };

  const TRANSACTIONAL = new Set(['BOOKING', 'RESCHEDULE', 'CANCELLATION']);

  return {
    invoke: async (input): Promise<ChatResult> => {
      const { input: userMessage, userId, sessionId } = input;
      const startTime = Date.now();

      const session: SessionState = (sessionId ? await getSession(sessionId) : null)
        ?? { activeIntent: '', history: [], collectedFields: {}, phase: 'collecting', ragContextCache: '' };

      if (!session.phase) session.phase = 'collecting';
      if (!session.ragContextCache) session.ragContextCache = '';

      try {
        // ── 1. Intent ──────────────────────────────────────────────────────────
        let intent: string;
        let confidence: number;

        if (TRANSACTIONAL.has(session.activeIntent) && session.history.length > 0) {
          intent = session.activeIntent;
          confidence = 1.0;
        } else {
          const result = await classifyIntent(userMessage);
          const classified = result.intent || 'GENERAL_INQUIRY';
          confidence = result.confidence || 0.5;
          intent = (TRANSACTIONAL.has(session.activeIntent) && !TRANSACTIONAL.has(classified))
            ? session.activeIntent
            : classified;
        }
        console.log(`[Intent] ${intent} (${confidence}) phase=${session.phase} (${Date.now() - startTime}ms)`);

        // ── 2. Transactional flow ──────────────────────────────────────────────
        if (TRANSACTIONAL.has(intent)) {
          if (!userId) {
            const msg = 'To manage appointments, please log in to your account first.';
            await persistSession(sessionId, session, userMessage, msg, '');
            return { messages: [new AIMessage(msg)] };
          }

          // ── Shared: slot_selection — user clicked a time slot ──────────────
          if (session.phase === 'slot_selection') {
            const timeMatch = userMessage.match(/\d{1,2}:\d{2}/);
            const selectedTime = timeMatch ? timeMatch[0] : userMessage.trim();
            session.collectedFields.time = selectedTime;
            console.log(`[SlotSelection] Slot selected: ${selectedTime}`);

            let action: string;
            let actionData: Record<string, any>;

            if (intent === 'BOOKING') {
              const doctor = await findDoctorByService(pool!, session.collectedFields.service!);
              action = 'show_booking_confirmation';
              actionData = {
                bookingDetails: {
                  service: session.collectedFields.service,
                  date: session.collectedFields.date,
                  time: selectedTime,
                  doctorName: doctor ? `Dr. ${doctor.name}` : 'Clinic doctor',
                  duration: SLOT_DURATION_MINUTES,
                },
              };
            } else {
              action = 'show_reschedule_confirmation';
              actionData = {
                bookingDetails: {
                  appointmentId: session.pendingAppointment?.id,
                  originalDate: session.pendingAppointment?.date,
                  service: session.pendingAppointment?.service,
                  date: session.collectedFields.new_date,
                  time: selectedTime,
                  doctorName: session.pendingAppointment?.doctorName,
                  duration: SLOT_DURATION_MINUTES,
                },
              };
            }

            session.phase = 'awaiting_confirmation';
            session.pendingActionData = actionData;
            const msg = 'Please review and confirm the details below.';
            await persistSession(sessionId, session, userMessage, msg, intent);
            return { messages: [new AIMessage(msg)], action, actionData };
          }

          // ── Shared: awaiting_confirmation — user clicked confirm/cancel ─────
          if (session.phase === 'awaiting_confirmation') {
            const isConfirm = /\b(confirm|yes|ok|sure|proceed|go ahead|book it|do it)\b/i.test(userMessage);
            const isAbort   = /\b(no|cancel|stop|abort|never mind|don.?t)\b/i.test(userMessage);

            if (isConfirm && pool) {
              let success = false;
              if (intent === 'BOOKING')      success = await insertBooking(pool, userId, session.collectedFields);
              if (intent === 'RESCHEDULE')   success = await rescheduleAppointment(pool, userId, session.collectedFields);
              if (intent === 'CANCELLATION') success = await cancelAppointment(pool, userId, session.collectedFields);

              const [okMsg, errMsg] = SUCCESS_MESSAGES[intent] ?? ['Done!', 'An error occurred.'];
              const msg = success ? okMsg : errMsg;
              session.phase = 'complete';
              await persistSession(sessionId, session, userMessage, msg, '');
              console.log(`[${intent}] Complete (success=${success}) (${Date.now() - startTime}ms)`);
              return { messages: [new AIMessage(msg)], ...(success ? { action: 'appointments_updated' } : {}) };
            }

            if (isAbort) {
              const msg = 'No problem! Your request has been cancelled. Is there anything else I can help with?';
              session.phase = 'complete';
              await persistSession(sessionId, session, userMessage, msg, '');
              return { messages: [new AIMessage(msg)] };
            }

            // Ambiguous — re-show the active confirmation widget
            const prompt = intent === 'CANCELLATION'
              ? 'Please confirm the cancellation or say "no" to keep your appointment.'
              : 'Please confirm your details or say "no" to cancel.';
            const pendingAction = intent === 'BOOKING' ? 'show_booking_confirmation'
              : intent === 'RESCHEDULE' ? 'show_reschedule_confirmation'
              : 'show_cancel_confirmation';
            await persistSession(sessionId, session, userMessage, prompt, intent);
            return { messages: [new AIMessage(prompt)], action: pendingAction, actionData: session.pendingActionData };
          }

          // ── BOOKING phases ─────────────────────────────────────────────────

          if (intent === 'BOOKING') {
            // collecting → show date picker immediately (no LLM needed)
            if (session.phase === 'collecting') {
              session.phase = 'date_selection';
              const msg = "I'd be happy to book an appointment! Please select a date below.";
              await persistSession(sessionId, session, userMessage, msg, intent);
              return { messages: [new AIMessage(msg)], action: 'show_date_picker' };
            }

            // date_selection → validate + show service picker
            if (session.phase === 'date_selection') {
              const dateISO = userMessage.trim(); // "2026-06-20" from DatePicker component
              const parsed = parseDateTime(dateISO, '09:00');

              if (!parsed) {
                const msg = 'Please select a valid date from the calendar.';
                await persistSession(sessionId, session, userMessage, msg, intent);
                return { messages: [new AIMessage(msg)], action: 'show_date_picker' };
              }

              if (parsed.getUTCDay() === 0) {
                const msg = 'The clinic is closed on Sundays. Please choose a different date.';
                await persistSession(sessionId, session, userMessage, msg, intent);
                return { messages: [new AIMessage(msg)], action: 'show_date_picker' };
              }

              session.collectedFields.date = dateISO;
              const services = await getAvailableServices(pool!);
              session.phase = 'service_selection';
              const msg = `You've selected ${formatDateForDisplay(dateISO)}. What type of service do you need?`;
              await persistSession(sessionId, session, userMessage, msg, intent);
              return { messages: [new AIMessage(msg)], action: 'show_service_picker', actionData: { services } };
            }

            // service_selection → get RAG clinic hours → show slot picker
            if (session.phase === 'service_selection') {
              const service = userMessage.trim();
              session.collectedFields.service = service;
              const dateISO = session.collectedFields.date!;
              const parsed = parseDateTime(dateISO, '09:00')!;

              // Fetch clinic hours from RAG for this specific day
              const hoursRag = await getClinicHoursRAG(pool!, userId, sessionId || 'agent');
              const clinicSlots = await getClinicSlotsForDay(groq, hoursRag, parsed);

              if (clinicSlots.length === 0) {
                session.collectedFields.date = null;
                session.phase = 'date_selection';
                const msg = `The clinic is not available on ${formatDateForDisplay(dateISO)}. Please choose another date.`;
                await persistSession(sessionId, session, userMessage, msg, intent);
                return { messages: [new AIMessage(msg)], action: 'show_date_picker' };
              }

              const avail = await queryAvailability(pool!, dateISO, clinicSlots);
              if (avail.available.length === 0) {
                session.collectedFields.date = null;
                session.phase = 'date_selection';
                const msg = `No available slots on ${formatDateForDisplay(dateISO)} for ${service}. Please choose another date.`;
                await persistSession(sessionId, session, userMessage, msg, intent);
                return { messages: [new AIMessage(msg)], action: 'show_date_picker' };
              }

              session.phase = 'slot_selection';
              const actionData = { ...avail, service };
              session.pendingActionData = actionData;
              const msg = `Here are the available time slots for your ${service} appointment on ${formatDateForDisplay(dateISO)}.`;
              await persistSession(sessionId, session, userMessage, msg, intent);
              return { messages: [new AIMessage(msg)], action: 'show_slot_picker', actionData };
            }
          }

          // ── RESCHEDULE phases ──────────────────────────────────────────────

          if (intent === 'RESCHEDULE') {
            // collecting — extract appointment_id via LLM + regex
            if (session.phase === 'collecting') {
              const isFollowUp = intent === session.activeIntent && session.history.length > 0;
              if (!isFollowUp && pool) {
                try {
                  const rag = await handleRAGIntent('CLINIC_INFO', { pool, message: userMessage, userId: userId || null, sessionId: sessionId || 'agent' });
                  if (rag.success && rag.message && !rag.message.startsWith('No relevant')) {
                  session.ragContextCache = rag.message.substring(0, 2000);
                }
                } catch { /* non-fatal */ }
              }

              const llmExtracted = await extractFields(groq, intent, session.history, userMessage);
              // Regex fallback for appointment_id
              if (!llmExtracted.appointment_id) {
                llmExtracted.appointment_id = regexExtractAppointmentId(userMessage);
              }
              const prev = session.collectedFields;
              const merged: Record<string, string | null> = {};
              for (const key of Object.keys(FIELD_SHAPES[intent] ?? {})) {
                const val = (llmExtracted[key] != null) ? llmExtracted[key] : (prev[key] ?? null);
                merged[key] = (val && TRIGGER_RE.test(val)) ? null : val;
              }
              session.collectedFields = merged;
              console.log(`[Fields] RESCHEDULE:`, merged);

              if (merged.appointment_id) {
                const appt = await queryAppointmentById(pool!, userId, merged.appointment_id);
                if (appt) {
                  session.pendingAppointment = appt;
                  session.phase = 'date_selection';
                  const msg = `Found your appointment with ${appt.doctorName} (${appt.service}) on ${formatDateForDisplay(new Date(appt.date).toISOString().split('T')[0])}. Please select a new date.`;
                  await persistSession(sessionId, session, userMessage, msg, intent);
                  return { messages: [new AIMessage(msg)], action: 'show_date_picker' };
                } else {
                  merged.appointment_id = null;
                  session.collectedFields = merged;
                  const msg = `I couldn't find that appointment on your account. Please check the ID, or visit your account page to see your appointments.`;
                  await persistSession(sessionId, session, userMessage, msg, intent);
                  return { messages: [new AIMessage(msg)] };
                }
              }

              // Appointment ID not yet given — ask for it via LLM
              const groqMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
                { role: 'system', content: buildSystemPrompt(intent, session.ragContextCache, session.collectedFields) },
                ...session.history.slice(-4),
                { role: 'user', content: userMessage },
              ];
              const raw = await generateLLMResponse(groq, groqMessages, 'Please provide your appointment ID to continue.');
              const responseText = processResponse(raw, session.collectedFields);
              await persistSession(sessionId, session, userMessage, responseText, intent);
              return { messages: [new AIMessage(responseText)] };
            }

            // date_selection — validate new date, query RAG hours, show slot picker
            if (session.phase === 'date_selection') {
              const dateISO = userMessage.trim();
              const parsed = parseDateTime(dateISO, '09:00');

              if (!parsed) {
                const msg = 'Please select a valid date from the calendar.';
                await persistSession(sessionId, session, userMessage, msg, intent);
                return { messages: [new AIMessage(msg)], action: 'show_date_picker' };
              }

              if (parsed.getUTCDay() === 0) {
                const msg = 'The clinic is closed on Sundays. Please choose a different date.';
                await persistSession(sessionId, session, userMessage, msg, intent);
                return { messages: [new AIMessage(msg)], action: 'show_date_picker' };
              }

              session.collectedFields.new_date = dateISO;
              const hoursRag = await getClinicHoursRAG(pool!, userId, sessionId || 'agent');
              const clinicSlots = await getClinicSlotsForDay(groq, hoursRag, parsed);

              if (clinicSlots.length === 0) {
                const msg = `The clinic is not available on ${formatDateForDisplay(dateISO)}. Please choose another date.`;
                await persistSession(sessionId, session, userMessage, msg, intent);
                return { messages: [new AIMessage(msg)], action: 'show_date_picker' };
              }

              const avail = await queryAvailability(pool!, dateISO, clinicSlots);
              if (avail.available.length === 0) {
                const msg = `No available slots on ${formatDateForDisplay(dateISO)}. Please choose another date.`;
                await persistSession(sessionId, session, userMessage, msg, intent);
                return { messages: [new AIMessage(msg)], action: 'show_date_picker' };
              }

              session.phase = 'slot_selection';
              const actionData = { ...avail, service: session.pendingAppointment?.service };
              session.pendingActionData = actionData;
              const msg = `Here are the available slots for ${formatDateForDisplay(dateISO)}.`;
              await persistSession(sessionId, session, userMessage, msg, intent);
              return { messages: [new AIMessage(msg)], action: 'show_slot_picker', actionData };
            }
          }

          // ── CANCELLATION phases ────────────────────────────────────────────

          if (intent === 'CANCELLATION' && session.phase === 'collecting') {
            const isFollowUp = intent === session.activeIntent && session.history.length > 0;
            if (!isFollowUp && pool) {
              try {
                const rag = await handleRAGIntent('CLINIC_INFO', { pool, message: userMessage, userId: userId || null, sessionId: sessionId || 'agent' });
                if (rag.success && rag.message && !rag.message.startsWith('No relevant')) {
                  session.ragContextCache = rag.message.substring(0, 2000);
                }
              } catch { /* non-fatal */ }
            }

            const llmExtracted = await extractFields(groq, intent, session.history, userMessage);
            if (!llmExtracted.appointment_id) {
              llmExtracted.appointment_id = regexExtractAppointmentId(userMessage);
            }
            const prev = session.collectedFields;
            const merged: Record<string, string | null> = {};
            for (const key of Object.keys(FIELD_SHAPES[intent] ?? {})) {
              const val = (llmExtracted[key] != null) ? llmExtracted[key] : (prev[key] ?? null);
              merged[key] = (val && TRIGGER_RE.test(val)) ? null : val;
            }
            session.collectedFields = merged;
            console.log(`[Fields] CANCELLATION:`, merged);

            if (merged.appointment_id) {
              const appt = await queryAppointmentById(pool!, userId, merged.appointment_id);
              if (appt) {
                session.pendingAppointment = appt;
                session.phase = 'awaiting_confirmation';
                const actionData = { appointmentDetails: appt };
                session.pendingActionData = actionData;
                const msg = 'I found your appointment. Please review the details and confirm cancellation.';
                await persistSession(sessionId, session, userMessage, msg, intent);
                return { messages: [new AIMessage(msg)], action: 'show_cancel_confirmation', actionData };
              } else {
                merged.appointment_id = null;
                session.collectedFields = merged;
                const msg = `I couldn't find that appointment on your account. Please double-check the ID, or visit your account page.`;
                await persistSession(sessionId, session, userMessage, msg, intent);
                return { messages: [new AIMessage(msg)] };
              }
            }

            const groqMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
              { role: 'system', content: buildSystemPrompt(intent, session.ragContextCache, session.collectedFields) },
              ...session.history.slice(-4),
              { role: 'user', content: userMessage },
            ];
            const raw = await generateLLMResponse(groq, groqMessages, 'Please provide your appointment ID to continue.');
            const responseText = processResponse(raw, session.collectedFields);
            await persistSession(sessionId, session, userMessage, responseText, intent);
            return { messages: [new AIMessage(responseText)] };
          }
        }

        // ── Non-transactional intents ──────────────────────────────────────────
        const isFollowUp = intent === session.activeIntent && session.history.length > 0;
        const useRAG = !isFollowUp && shouldRetrieveRAG(intent, confidence) && !!pool;

        const baseMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: buildSystemPrompt(intent, '', {}) },
          ...session.history.slice(-4),
          { role: 'user', content: userMessage },
        ];

        const raw = useRAG
          ? await generateWithToolCall(groq, baseMessages, intent, pool!, userId || null, sessionId || 'agent')
          : await generateLLMResponse(groq, baseMessages, 'Please contact the clinic directly for assistance.');
        const responseText = processResponse(raw, {});

        await persistSession(sessionId, session, userMessage, responseText, '');
        console.log(`[Agent] Done (${Date.now() - startTime}ms)`);
        return { messages: [new AIMessage(responseText)] };

      } catch (err) {
        console.error(`[Agent] Error (${Date.now() - startTime}ms):`, err);
        throw err;
      }
    },
  };
}
