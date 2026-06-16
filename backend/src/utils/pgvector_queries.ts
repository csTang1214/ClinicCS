import { Pool } from 'pg';
import { pipeline } from '@xenova/transformers';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

type QueryContext = {
  intent: string[];
  message: string;
  userId?: string | number | null;
};

export type QueryResult = {
  documents: string[];
  metadatas: Record<string, any>[];
  distances: number[];
  ids: string[];
};

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_HOST?.includes('supabase') ? { rejectUnauthorized: false } : false,
});

let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

async function embed(text: string): Promise<string> {
  const extractor = await getEmbedder();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  const values = Array.from(output.data as Float32Array);
  return `[${values.join(',')}]`;
}

const intentSectionMap: Record<string, string[]> = {
  BOOKING: ['Appointments'],
  RESCHEDULE: ['Appointments'],
  CANCELLATION: ['Appointments'],
  CLINIC_INFO: ['Clinic Information'],
  SERVICES: ['Clinic Information'],
  PAYMENT_BILLING: ['Payments & Billing'],
  INSURANCE: ['Payments & Billing'],
  PRESCRIPTION_REFERRAL: ['Prescriptions & Referrals'],
  FEEDBACK_COMPLAINT: ['Patient Care & Rights'],
  EMERGENCY: ['Emergency Information'],
  GENERAL_INQUIRY: ['Clinic Information', 'Patient Care & Rights'],
  OTHER: [],
};

export async function initializePgVectorCollection(): Promise<number> {
  const result = await pool.query('SELECT COUNT(*) FROM public.clinic_documents');
  return parseInt(result.rows[0].count, 10);
}

export async function queryClinicContext(context: QueryContext): Promise<QueryResult> {
  const sections = context.intent.flatMap(i => intentSectionMap[i] || []);
  const uniqueSections = Array.from(new Set(sections));
  const vectorStr = await embed(context.message);

  let result;
  if (uniqueSections.length > 0) {
    result = await pool.query(
      `SELECT id, section, content,
              1 - (embedding <=> $1::vector) AS similarity
       FROM public.clinic_documents
       WHERE section = ANY($2)
       ORDER BY embedding <=> $1::vector
       LIMIT 5`,
      [vectorStr, uniqueSections]
    );
  } else {
    result = await pool.query(
      `SELECT id, section, content,
              1 - (embedding <=> $1::vector) AS similarity
       FROM public.clinic_documents
       ORDER BY embedding <=> $1::vector
       LIMIT 5`,
      [vectorStr]
    );
  }

  return {
    documents: result.rows.map(r => r.content),
    metadatas: result.rows.map(r => ({ section: r.section })),
    distances: result.rows.map(r => 1 - parseFloat(r.similarity)),
    ids: result.rows.map(r => r.id),
  };
}

export function formatContextForLLM(results: QueryResult): string {
  if (results.documents.length === 0) {
    return 'No relevant information found in the clinic database.';
  }
  return (
    'Relevant clinic information:\n\n' +
    results.documents
      .map((doc, idx) => `[${results.metadatas[idx]?.section ?? 'Unknown'}]\n${doc}`)
      .join('\n\n---\n\n')
  );
}

export async function getDocumentsBySection(section: string): Promise<QueryResult> {
  const result = await pool.query(
    'SELECT id, section, content FROM public.clinic_documents WHERE section = $1',
    [section]
  );
  return {
    documents: result.rows.map(r => r.content),
    metadatas: result.rows.map(r => ({ section: r.section })),
    distances: [],
    ids: result.rows.map(r => r.id),
  };
}

export async function globalSearch(query: string): Promise<QueryResult> {
  const vectorStr = await embed(query);
  const result = await pool.query(
    `SELECT id, section, content,
            1 - (embedding <=> $1::vector) AS similarity
     FROM public.clinic_documents
     ORDER BY embedding <=> $1::vector
     LIMIT 10`,
    [vectorStr]
  );
  return {
    documents: result.rows.map(r => r.content),
    metadatas: result.rows.map(r => ({ section: r.section })),
    distances: result.rows.map(r => 1 - parseFloat(r.similarity)),
    ids: result.rows.map(r => r.id),
  };
}

export async function queryWithContext(
  context: QueryContext
): Promise<{ context: string; rawResults: QueryResult }> {
  const results = await queryClinicContext(context);
  return { context: formatContextForLLM(results), rawResults: results };
}

export const getClinicContactInfo = () => getDocumentsBySection('Clinic Information');
export const getAppointmentPolicies = () => getDocumentsBySection('Appointments');
export const getPaymentInfo = () => getDocumentsBySection('Payments & Billing');
export const getEmergencyInfo = () => getDocumentsBySection('Emergency Information');
