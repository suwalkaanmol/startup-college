// Live updates: Server-Sent Events fanned out through PostgreSQL LISTEN/NOTIFY,
// so every server instance reaches its own connected browsers. Payloads are tiny; clients refetch.
import pg from 'pg';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuth } from './middleware/auth.js';

const CHANNEL = 'placemate_events';
const clients = new Map(); // userId -> Set<res>

/** Tell these users something changed. type: request | group | message | booking */
export async function publish(type, ids, client = pool) {
  await client.query('SELECT pg_notify($1,$2)', [CHANNEL, JSON.stringify({ type, ids: [...new Set(ids)] })]);
}

export async function startListener() {
  const c = new pg.Client({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined });
  const connect = async () => {
    try {
      await c.connect();
      await c.query(`LISTEN ${CHANNEL}`);
    } catch (e) { console.error('[events] listener failed', e.message); }
  };
  c.on('notification', (m) => {
    try {
      const { type, ids } = JSON.parse(m.payload);
      for (const id of ids) for (const res of clients.get(id) || []) res.write(`data: ${JSON.stringify({ type, ids })}\n\n`);
    } catch { /* ignore malformed payloads */ }
  });
  c.on('error', (e) => console.error('[events] connection error', e.message));
  await connect();
}

export const sseHandler = [requireAuth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const set = clients.get(req.user.id) || clients.set(req.user.id, new Set()).get(req.user.id);
  set.add(res);
  const beat = setInterval(() => res.write(': ping\n\n'), 25e3); // keeps proxies from closing the stream
  req.on('close', () => { clearInterval(beat); set.delete(res); if (!set.size) clients.delete(req.user.id); });
}];
