import dotenv from 'dotenv';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { hashPassword, comparePasswords } from './utils/password.js';
import { signToken, verifyToken, decodeToken} from './utils/jwt.js';
import cookieParser from 'cookie-parser';
import { generateUserId } from './utils/id.js';
import { generateResponse, clearSession } from './utils/ollama.js';
import { classifyIntent } from './utils/intent_classification.js';
import { handleRAGIntent } from './utils/intent_actions.js';
import { createChatAgent, clearChatSession } from './langchain_agent.js';
import { BookingTool, CancelAppointmentTool, RescheduleAppointmentTool, ClinicalInfoTool } from './utils/langchain_tools.js';


const envPath = path.resolve(process.cwd(), '.env');
const rootEnvPath = path.resolve(process.cwd(), '../.env');
dotenv.config({ path: envPath });
dotenv.config({ path: rootEnvPath });

const app = express();
app.use(cookieParser());

// Middleware - must be set up before routes
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'clinic_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl:      process.env.DB_HOST?.includes('supabase') ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected PostgreSQL error', err);
  process.exit(-1);
});

let chatAgent: Awaited<ReturnType<typeof createChatAgent>>;


async function initializeAgent() {
  const tools = [
    new BookingTool(pool),
    new CancelAppointmentTool(pool),
    new RescheduleAppointmentTool(pool),
    new ClinicalInfoTool(pool),
  ];
  chatAgent = await createChatAgent(tools, pool);
}


async function checkPgVector() {
  try {
    const { initializePgVectorCollection } = await import('./utils/pgvector_queries.js');
    const count = await initializePgVectorCollection();
    if (count === 0) {
      console.warn('[pgvector] Collection is empty — RAG will not work.');
      console.warn('[pgvector] Run: npx tsx src/utils/populate_pgvector.ts');
    } else {
      console.log(`[pgvector] Collection ready: ${count} documents`);
    }
  } catch (err) {
    console.error('[pgvector] Failed to check collection:', err instanceof Error ? err.message : err);
  }
}

async function startServer() {
  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL connected');
    await initializeAgent();
    console.log('LC Agent initialized');
    await checkPgVector();
  } catch (err) {
    console.error('PostgreSQL connection failed', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Database: ${process.env.DB_NAME || 'clinic_db'}`);
  });
}

// Routes
// Health check endpoint
app.get('/health', (req, res) => {
  const response = { status: 'ok', database: 'connected' };
  res.json(response);
});

// Model health check - verify Groq models are accessible
app.get('/health/models', async (req, res) => {
  try {
    const intentStart = Date.now();
    const intentTest = await classifyIntent('test');
    const intentTime = Date.now() - intentStart;

    const chatStart = Date.now();
    const chatTest = await generateResponse('Hello');
    const chatTime = Date.now() - chatStart;

    res.json({
      status: 'ok',
      models: {
        classifier: {
          status: intentTest.error ? 'error' : 'ok',
          model: process.env.GROQ_CLASSIFIER_MODEL || 'llama-3.1-8b-instant',
          responseTime: `${intentTime}ms`,
          intent: intentTest.intent,
          error: intentTest.error || null,
        },
        chat: {
          status: chatTest.length > 0 ? 'ok' : 'error',
          model: process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile',
          responseTime: `${chatTime}ms`,
        },
      },
    });
  } catch (err) {
    console.error('Model health check error:', err);
    res.status(503).json({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Create Patient (Sign up)
app.post('/createPatient', async (req, res) => {
  const {first_name, last_name, date_of_birth, email, phone, address} = req.body;
  
  // Validate required fields
  if (!date_of_birth || date_of_birth.trim() === '') {
    return res.status(400).json({ error: 'Date of birth is required' });
  }
  
  const hashedPassword = await hashPassword(req.body.password);
  const id = generateUserId();
  console.log('================================');
  console.log('Creating patient with email:', email);
  try {
    const result = await pool.query(
      'INSERT INTO patients (id, first_name, last_name, date_of_birth, email, password, phone, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id.idINT, first_name, last_name, date_of_birth, email, hashedPassword, phone, address]
    );
    res.status(201).json(result.rows[0]);
    console.log('Patient created', id)
    console.log('================================');
  } catch (err) {
    console.error('Error creating patient', err);
    console.log('================================');
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Login endpoint 
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('===============================');
  console.log('User logging in');
  try {
    const result = await pool.query(
      'SELECT * FROM patients WHERE email = $1',
      [email]
    );

    const user = result.rows[0];
    //FOR TESTING PURPOSES ONLY - REMOVE IN PRODUCTION
    if (user) {
      console.log('User found:', { id: user.id, email: user.email });
    }
    if (user && await comparePasswords(password, user.password)) {
      const token = signToken({ userId: user.id, email: user.email });
      console.log('Login successful for user:', email);
      console.log('===============================');
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 3600000 });
      res.json({ message: 'Login successful', user: { id: user.id, email: user.email }});
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Error during login', err);
    console.log('===============================');
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get current user endpoint - requires valid token in cookies
app.get('/me', async (req, res) => {
  try {
    const token = req.cookies.token;
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = verifyToken(token);
    if (!decoded || typeof decoded === 'string') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const result = await pool.query(
      'SELECT id, first_name, last_name, email, phone, address, date_of_birth, created_at, updated_at FROM patients WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching current user:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Logout endpoint - clears token cookie
app.post('/logout', (req, res) => {
  console.log('User logging out');
  try {
    res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
    res.json({ message: 'Logout successful' });
  } catch (err) {
    console.error('Error during logout', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Clear chat session endpoint
app.post('/clear-session', async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    clearSession(sessionId);
    await clearChatSession(sessionId);
    console.log(`Cleared session: ${sessionId}`);
    res.json({ message: 'Session cleared successfully' });
  } catch (err) {
    console.error('Error clearing session:', err);
    res.status(500).json({ error: 'Failed to clear session' });
  }
});

app.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  
  if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
  
  // Use provided sessionId or generate a temporary one
  const chatSessionId = sessionId || `anonymous-${Date.now()}-${Math.random()}`;
  
  // Extract userId from token if available
  let userId: string | number | null = null;
  try {
    const token = req.cookies.token;
    if (token) {
      const decoded = verifyToken(token);
      if (decoded && typeof decoded !== 'string') {
        userId = decoded.userId;
      }
    }
  } catch (err) {
    // Token verification failed, continue as anonymous
  }
  
  console.log('================================');
  console.log('[/chat] Received message:', message);
  console.log('[/chat] Session ID:', chatSessionId);
  console.log('[/chat] User ID:', userId || 'anonymous');
  
  try {
    const result = await chatAgent.invoke({ input: message, userId, sessionId: chatSessionId });

    // Extract final response from agent messages
    const lastMessage = result.messages[result.messages.length - 1];
    const response = lastMessage.content || 'Unable to process your request';

    console.log('[/chat] Agent response:', response);
    res.json({ response, sessionId: chatSessionId, action: result.action, actionData: result.actionData });
    console.log('================================');

  } catch (err) {
    console.error('[/chat] Error:', err);
    console.log('================================');
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// Get appointments for the authenticated patient
app.get('/appointments', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = verifyToken(token);
    if (!decoded || typeof decoded === 'string') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const result = await pool.query(
      `SELECT a.id, a.patient_id, a.doctor_id, a.appointment_date, a.duration_minutes,
              a.status, a.notes, a.created_at,
              d.first_name AS doctor_first_name, d.last_name AS doctor_last_name, d.specialty
       FROM appointments a
       LEFT JOIN doctors d ON a.doctor_id = d.id
       WHERE a.patient_id = $1
       ORDER BY a.appointment_date DESC`,
      [decoded.userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Error handling
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
startServer();