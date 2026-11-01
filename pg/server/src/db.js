// PostgreSQL pool plus two small helpers. All SQL elsewhere is parameterised.
import pg from 'pg';

// Return DATE columns as plain 'YYYY-MM-DD' strings so timezones never shift a move-in date.
pg.types.setTypeParser(1082, (v) => v);
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export const query = (text, params) => pool.query(text, params);

/** Run fn(client) inside a transaction; rolls back on any error. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
