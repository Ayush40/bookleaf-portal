// Central, validated configuration. Secrets are read from environment variables ONLY
// and this module is never imported by anything that is sent to the browser.
import 'dotenv/config';

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (copy server/.env.example to server/.env)`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  databaseUrl: need('DATABASE_URL'),
  jwtSecret: need('JWT_SECRET'),
  jwtExpiresIn: '12h',
  clientOrigin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : false,
  autoSeed: process.env.AUTO_SEED !== 'false',
  seedDemoTickets: process.env.SEED_DEMO_TICKETS !== 'false',
  ai: {
    apiKey: process.env.GEMINI_API_KEY || '',
    baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta', // overridable for tests
    // Cheap/fast model for the tiny structured classification call, stronger model for customer-facing drafts.
    classifyModel: process.env.GEMINI_CLASSIFY_MODEL || 'gemini-3.5-flash-lite',
    draftModel: process.env.GEMINI_DRAFT_MODEL || 'gemini-3.5-flash',
    // If the draft model is overloaded/unavailable, retry once on this model before falling back to a template.
    draftFallbackModel: process.env.GEMINI_DRAFT_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 20000,
    retries: 2,
    // Free tier allows ~10-15 requests/min; space calls out so we don't self-inflict 429s.
    minGapMs: Number(process.env.AI_MIN_GAP_MS) || 2000,
  },
};
