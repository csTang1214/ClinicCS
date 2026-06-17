import Groq from 'groq-sdk';

let _groq: Groq | null = null;
const getGroq = () => {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
};

const CLASSIFIER_MODEL = process.env.GROQ_CLASSIFIER_MODEL || 'llama-3.1-8b-instant';
const CONFIDENCE_THRESHOLD = 0.6;

const SYSTEM_PROMPT = `Classify the user message into exactly ONE of these intents:
BOOKING, RESCHEDULE, CANCELLATION, CLINIC_INFO, SERVICES, PAYMENT_BILLING, INSURANCE, PRESCRIPTION_REFERRAL, FEEDBACK_COMPLAINT, EMERGENCY, GENERAL_INQUIRY

Reply with ONLY this format (no extra text):
INTENT: <intent>
CONFIDENCE: <0.0-1.0>
REASON: <one short phrase>`;

export interface IntentResult {
  intent: string;
  confidence: number;
  reason: string;
  error?: string;
  rawResponse?: string;
}

function classifyIntentByKeywords(userMessage: string): IntentResult {
  const lowerMsg = userMessage.toLowerCase();

  const patterns: Record<string, string[]> = {
    CANCELLATION:          ['cancel', 'cancellation', 'postpone', 'not coming', 'wont be able', "won't be able"],
    RESCHEDULE:            ['reschedule', 'change appointment', 'move appointment', 'different time', 'move my', 'change my appointment'],
    BOOKING:               ['book', 'schedule', 'new appointment', 'when can i', 'set up', 'make an appointment'],
    CLINIC_INFO:           ['hours', 'opening', 'open', 'closed', 'location', 'address', 'contact', 'phone', 'where are you', 'how to reach'],
    SERVICES:              ['services', 'do you offer', 'physiotherapy', 'dental', 'mental health', 'what do you treat', 'what do you provide'],
    PAYMENT_BILLING:       ['fee', 'cost', 'price', 'payment', 'billing', 'charge', 'how much', 'expensive', 'invoice'],
    INSURANCE:             ['insurance', 'covered', 'coverage', 'claim', 'insured'],
    PRESCRIPTION_REFERRAL: ['prescription', 'refill', 'referral', 'specialist', 'medication', 'repeat prescription'],
    FEEDBACK_COMPLAINT:    ['feedback', 'complaint', 'suggestion', 'report', 'unhappy', 'disappointed', 'terrible', 'great service'],
    EMERGENCY:             ['emergency', 'urgent', '999', '911', 'hospital', 'critical', 'severe pain', 'ambulance'],
  };

  for (const [intent, keywords] of Object.entries(patterns)) {
    if (keywords.some(keyword => lowerMsg.includes(keyword))) {
      return { intent, confidence: 0.75, reason: `Matched keyword for ${intent}` };
    }
  }

  return { intent: 'GENERAL_INQUIRY', confidence: 0.5, reason: 'No keyword match' };
}

async function classifyIntentWithLLM(userMessage: string): Promise<IntentResult> {
  const response = await getGroq().chat.completions.create({
    model: CLASSIFIER_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0,
    max_tokens: 40,
    top_p: 0.5,
  });

  const text = response.choices[0].message.content ?? '';
  const intentMatch    = text.match(/INTENT:\s*(\w+)/i);
  const confidenceMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
  const reasonMatch    = text.match(/REASON:\s*(.+)/i);

  if (!intentMatch) throw new Error('No INTENT found in LLM response');

  return {
    intent:      intentMatch[1].toUpperCase(),
    confidence:  confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7,
    reason:      reasonMatch?.[1].trim() ?? 'LLM classification',
    rawResponse: text,
  };
}

export const classifyIntent = async (userMessage: string): Promise<IntentResult> => {
  try {
    const result = await classifyIntentWithLLM(userMessage);
    console.log(`[Intent] LLM: ${result.intent} (${result.confidence})`);
    if (result.confidence < CONFIDENCE_THRESHOLD) {
      console.log(`[Intent] Low confidence (${result.confidence} < ${CONFIDENCE_THRESHOLD}) — falling back to GENERAL_INQUIRY`);
      return { intent: 'GENERAL_INQUIRY', confidence: result.confidence, reason: `Low-confidence fallback from ${result.intent}` };
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Intent] LLM failed (${msg}) — keyword fallback`);
    const result = classifyIntentByKeywords(userMessage);
    console.log(`[Intent] Keyword fallback: ${result.intent} (${result.confidence})`);
    return result;
  }
};
