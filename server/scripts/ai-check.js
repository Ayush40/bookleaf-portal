// Run: node scripts/ai-check.js   (from the server folder)
// Tests your GEMINI_API_KEY and model names and prints Google's exact error if something is wrong.
import { config } from '../src/config.js';

const { apiKey, baseUrl, classifyModel, draftModel } = config.ai;
if (!apiKey) { console.log('GEMINI_API_KEY is empty in server/.env'); process.exit(1); }
console.log(`Key: ${apiKey.slice(0, 3)}... (${apiKey.length} chars)  | base: ${baseUrl}\n`);

const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
const show = async (res) => { try { const j = await res.json(); return j.error ? `${j.error.status}: ${j.error.message}` : JSON.stringify(j).slice(0, 200); } catch { return '(no body)'; } };

for (const model of new Set([classifyModel, draftModel])) {
  const res = await fetch(`${baseUrl}/models/${model}:generateContent`, {
    method: 'POST', headers,
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word OK.' }] }] }),
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
  if (res.ok) {
    const j = await res.json();
    console.log(`PASS  ${model}  -> "${(j.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()}"`);
  } else {
    console.log(`FAIL  ${model}  HTTP ${res.status}  ${await show(res)}`);
  }
}

// Also list models this key can use, so you can pick valid names for the two GEMINI_*_MODEL settings.
const list = await fetch(`${baseUrl}/models?pageSize=100`, { headers }).catch(() => null);
if (list?.ok) {
  const names = (await list.json()).models.filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace('models/', ''));
  console.log('\nModels available to your key:\n  ' + names.filter((n) => /flash/.test(n)).join('\n  '));
} else if (list) console.log(`\nCould not list models: HTTP ${list.status} ${await show(list)}`);
