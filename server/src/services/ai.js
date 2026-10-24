// Gemini REST client + the two AI features (classify, draft).
// Production concerns handled here: key stays server-side, timeouts, retry with backoff,
// request spacing (free-tier RPM), circuit breaker, token logging, strict output validation.
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { CATEGORIES, PRIORITIES } from '../constants.js';
import { CLASSIFIER_SYSTEM, classifierPrompt } from '../prompts/classifier.js';
import { draftSystem, draftPrompt } from '../prompts/drafter.js';

export class AiError extends Error {
  constructor(message, { retryable = false, code = 'AI_ERROR' } = {}) {
    super(message);
    this.retryable = retryable;
    this.code = code;
  }
}

export const aiEnabled = () => Boolean(config.ai.apiKey);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- request spacing: calls run one at a time with a minimum gap (keeps us inside free-tier limits)
let chain = Promise.resolve();
let lastCallAt = 0;
function schedule(fn) {
  const run = chain.then(async () => {
    const wait = lastCallAt + config.ai.minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

// --- circuit breaker: after 3 consecutive failures stop calling the API for 60s (fail fast, no queue pile-up)
const breaker = { fails: 0, openUntil: 0 };

async function callGemini({ model, system, user, json = false, maxOutputTokens, temperature }) {
  if (!aiEnabled()) throw new AiError('AI is not configured', { code: 'AI_DISABLED' });
  if (Date.now() < breaker.openUntil) throw new AiError('AI paused after repeated failures', { code: 'AI_PAUSED' });

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(json && { responseMimeType: 'application/json' }),
      // 2.5 models "think" by default and thinking tokens eat the output budget; we don't need it here.
      // (Newer 3.x models are given a larger maxOutputTokens ceiling instead; replies stay short because the prompt caps them at ~220 words.)
      ...(/2\.5/.test(model) && { thinkingConfig: { thinkingBudget: 0 } }),
    },
  };
  const url = `${config.ai.baseUrl}/models/${model}:generateContent`;

  return schedule(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.ai.apiKey }, // key in header, never in logs/URLs
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.ai.timeoutMs),
        });
        if (!res.ok) {
          // Surface Google's own reason (e.g. "API key not valid", "quota exceeded", "model not found") to admins/logs.
          let detail = '';
          try {
            const e = (await res.json()).error;
            detail = [e?.status, e?.message].filter(Boolean).join(': ').split(config.ai.apiKey).join('***').slice(0, 250);
          } catch { /* non-JSON error body */ }
          throw new AiError(`Gemini HTTP ${res.status}${detail ? ` - ${detail}` : ''}`, { retryable: res.status === 429 || res.status >= 500, code: res.status === 429 ? 'AI_RATE_LIMITED' : 'AI_HTTP_ERROR' });
        }
        const data = await res.json();
        const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
        if (!text) throw new AiError('Empty AI response (possibly blocked by safety filters)', { code: 'AI_EMPTY' });
        breaker.fails = 0;
        return { text, usage: data.usageMetadata || {} };
      } catch (err) {
        const retryable = err.retryable ?? (err.name === 'TimeoutError' || err.name === 'TypeError'); // timeout / network
        if (retryable && attempt < config.ai.retries) {
          await sleep(1000 * 2 ** attempt); // 1s, 2s
          continue;
        }
        if (++breaker.fails >= 3) breaker.openUntil = Date.now() + 60_000;
        throw err instanceof AiError ? err : new AiError(err.message || 'AI request failed', { retryable });
      }
    }
  });
}

async function logCall(ticketId, kind, model, ok, usage, error) {
  if (!ok && error === 'AI is not configured') return; // not a real call; keep the usage stats meaningful
  await query(
    'INSERT INTO ai_calls (ticket_id, kind, model, ok, prompt_tokens, output_tokens, error) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [ticketId, kind, model, ok, usage?.promptTokenCount ?? null, usage?.candidatesTokenCount ?? null, error ? String(error).slice(0, 300) : null],
  ).catch(() => {}); // logging must never break the request
}

const classificationSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  reason: z.string().trim().max(300).default(''),
});

/** Structured classification: one small call, JSON mode, validated against enums. */
export async function classify(ticketId, input) {
  const model = config.ai.classifyModel;
  try {
    const { text, usage } = await callGemini({
      model, system: CLASSIFIER_SYSTEM, user: classifierPrompt(input), json: true, maxOutputTokens: 512, temperature: 0,
    });
    const parsed = classificationSchema.parse(JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()));
    await logCall(ticketId, 'classify', model, true, usage);
    return parsed;
  } catch (err) {
    await logCall(ticketId, 'classify', model, false, null, err.message);
    throw err;
  }
}

/** Draft reply grounded in the category's KB section + the author's verified book data. */
export async function draftReply(ticketId, ctx) {
  const firstName = ctx.author.name.split(' ')[0];
  // Model fallback chain: preferred model first; if it is overloaded (503), rate-limited or retired, try the backup.
  const models = [config.ai.draftModel, config.ai.draftFallbackModel].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr;
  for (const model of models) {
    try {
      const { text, usage } = await callGemini({
        model, system: draftSystem(ctx.category, firstName), user: draftPrompt(ctx), maxOutputTokens: 1500, temperature: 0.4,
      });
      await logCall(ticketId, 'draft', model, true, usage);
      return text;
    } catch (err) {
      await logCall(ticketId, 'draft', model, false, null, err.message);
      lastErr = err;
      if (err.code === 'AI_DISABLED' || err.code === 'AI_PAUSED') break; // trying another model won't help
      console.warn(`[ai] draft on ${model} failed: ${err.message}${model !== models.at(-1) ? ' - trying fallback model' : ''}`);
    }
  }
  throw lastErr;
}
