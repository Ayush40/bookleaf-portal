import pg from 'pg';
import fs from 'node:fs';
import { config } from './config.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoids timezone shifts from JS Date objects).
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
export const query = (text, params) => pool.query(text, params);

/** Run several statements atomically. */
export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Idempotent schema creation (safe to run on every boot). */
export async function migrate() {
  const sql = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}
