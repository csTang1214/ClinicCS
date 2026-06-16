import Groq from 'groq-sdk';

let _groq: Groq | null = null;
const getGroq = () => {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
};

const CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are a helpful customer service assistant for a medical clinic. Answer patient questions about appointments, clinic hours, insurance, and services.

CRITICAL RULES:
- Respond with ONLY plain conversational text
- Do NOT use any brackets, markers, or special formatting
- Do NOT use ### or other markdown
- Keep responses brief and natural, like a human would speak
- Focus on being helpful and direct`;

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const conversationSessions: Map<string, Message[]> = new Map();

export const getOrCreateSession = (sessionId: string): Message[] => {
  if (!conversationSessions.has(sessionId)) {
    conversationSessions.set(sessionId, []);
  }
  return conversationSessions.get(sessionId)!;
};

export const clearSession = (sessionId: string): void => {
  conversationSessions.delete(sessionId);
};

export const generateResponse = async (
  prompt: string,
  augmentation: string = '',
  model: string = CHAT_MODEL,
  sessionId?: string,
): Promise<string> => {
  const sessionMessages = sessionId ? getOrCreateSession(sessionId) : [];
  const fullSystemPrompt = augmentation ? `${SYSTEM_PROMPT}\n\n${augmentation}` : SYSTEM_PROMPT;

  const messages: Message[] = [
    { role: 'system', content: fullSystemPrompt },
    ...sessionMessages,
    { role: 'user', content: prompt },
  ];

  const response = await getGroq().chat.completions.create({
    model,
    messages,
    temperature: 0.3,
    max_tokens: 200,
    top_p: 0.8,
  });

  const responseText = response.choices[0].message.content?.trim() ?? '';

  if (!responseText) throw new Error('Groq returned empty response');

  if (sessionId) {
    sessionMessages.push({ role: 'user', content: prompt });
    sessionMessages.push({ role: 'assistant', content: responseText });
    if (sessionMessages.length > 20) sessionMessages.splice(0, sessionMessages.length - 20);
  }

  return responseText;
};

export { classifyIntent } from './intent_classification.js';
