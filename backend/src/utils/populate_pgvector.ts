import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Pool } from 'pg';
import { pipeline } from '@xenova/transformers';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sections = [
  { name: 'Appointments',            pattern: '1. Appointments' },
  { name: 'Clinic Information',      pattern: '2. Clinic Information' },
  { name: 'Patient Care & Rights',   pattern: '3. Patient Care & Rights' },
  { name: 'Payments & Billing',      pattern: '4. Payments & Billing' },
  { name: 'Prescriptions & Referrals', pattern: '5. Prescriptions & Referrals' },
  { name: 'Emergency Information',   pattern: '6. Emergency Information' },
  { name: 'How Our Website Works',   pattern: '7. How Our Website Works' },
];

async function populatePgVector() {
  console.log('Starting pgvector population...');

  const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl:      process.env.DB_HOST?.includes('supabase') ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log(`[DB] host=${process.env.DB_HOST} db=${process.env.DB_NAME} user=${process.env.DB_USER}`);
    console.log('Loading embedding model (first run downloads ~25 MB)...');
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    const policyPath = path.resolve(__dirname, '../../../chatbot/fine_tuning/ClinicPolicy.txt');
    if (!fs.existsSync(policyPath)) {
      console.error(`Policy file not found: ${policyPath}`);
      process.exit(1);
    }
    const policyText = fs.readFileSync(policyPath, 'utf-8');
    console.log(`Loaded policy (${policyText.length} chars)`);

    await pool.query('DELETE FROM public.clinic_documents');
    console.log('Cleared existing documents');

    let count = 0;
    for (let i = 0; i < sections.length; i++) {
      const { name, pattern } = sections[i];
      const startIdx = policyText.indexOf(pattern);
      if (startIdx === -1) {
        console.warn(`Section not found: ${pattern}`);
        continue;
      }
      const endIdx =
        i + 1 < sections.length ? policyText.indexOf(sections[i + 1].pattern) : policyText.length;
      const content = policyText.substring(startIdx, endIdx).trim();
      const id = `${name.toLowerCase().replace(/\s+/g, '_')}_0`;

      const output = await extractor(content, { pooling: 'mean', normalize: true });
      const vectorStr = `[${Array.from(output.data as Float32Array).join(',')}]`;

      await pool.query(
        `INSERT INTO public.clinic_documents (id, section, content, embedding)
         VALUES ($1, $2, $3, $4::vector)
         ON CONFLICT (id) DO UPDATE SET content = $3, embedding = $4::vector`,
        [id, name, content, vectorStr]
      );

      console.log(`  ✓ ${id}`);
      count++;
    }

    console.log(`\nDone — ${count} sections inserted into pgvector`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

populatePgVector();
