import { config } from './config.js';
import { migrate, pool } from './db.js';
import { seedAll } from './seed.js';
import { createApp } from './app.js';
import { requeuePending } from './services/triage.js';
import { aiEnabled } from './services/ai.js';

async function main() {
  await migrate();
  if (config.autoSeed) await seedAll();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`BookLeaf portal API on http://localhost:${config.port}  (AI: ${aiEnabled() ? 'Gemini enabled' : 'disabled - set GEMINI_API_KEY'})`);
    requeuePending().catch((e) => console.error('[requeue]', e));
  });
  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
