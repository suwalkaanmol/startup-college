// Where UniHub keeps its data. Two interchangeable backends:
// - files (default): JSON files under hub/data, uploads next to them. Good on your own computer.
// - postgres (DATABASE_URL set): one shared database, e.g. Neon. Data survives restarts and redeploys.
// Each canteen and shop keeps its own document either way (places/food-kc.json, places/xerox-tt.json ...).
import fs from 'node:fs';
import path from 'node:path';
import { createPg } from './pg.js';

export function fileBackend() {
  return {
    kind: 'files',
    read(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } },
    write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); },
    async flush() {},
    blobs: {
      async put(file, buf) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); },
      async get(file) { try { return fs.readFileSync(file); } catch { return null; } },
      async del(file) { fs.rm(file, { force: true }, () => {}); },
    },
  };
}

export async function pgBackend(url, dataDir, log = console.log) {
  const db = createPg(url, { log });
  await db.query('CREATE TABLE IF NOT EXISTS unihub_docs (name text PRIMARY KEY, body text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  await db.query('CREATE TABLE IF NOT EXISTS unihub_blobs (name text PRIMARY KEY, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())');
  const key = (file) => path.relative(dataDir, file).split(path.sep).join('/');
  const docs = new Map((await db.query('SELECT name, body FROM unihub_docs')).map((r) => [r.name, r.body]));
  log(`Database connected: ${docs.size} document${docs.size === 1 ? '' : 's'} loaded.`);
  // Saves run in the background, newest version of each document wins; failures retry.
  const dirty = new Map(); let running = null;
  const pump = () => running ||= (async () => {
    while (dirty.size) {
      const [name, body] = dirty.entries().next().value; dirty.delete(name);
      try { await db.query('INSERT INTO unihub_docs (name, body, updated_at) VALUES ($1, $2, now()) ON CONFLICT (name) DO UPDATE SET body = excluded.body, updated_at = now()', [name, body]); }
      catch (e) { log(`Database save failed (${name}): ${e.message}. Retrying.`); if (!dirty.has(name)) dirty.set(name, body); await new Promise((r) => setTimeout(r, 2000)); }
    }
    running = null;
  })();
  return {
    kind: 'postgres',
    read(file) { return docs.get(key(file)) ?? null; },
    write(file, text) { docs.set(key(file), text); dirty.set(key(file), text); pump(); },
    async flush() { while (running || dirty.size) await (running || pump()); },
    blobs: {
      async put(file, buf) { await db.query('INSERT INTO unihub_blobs (name, data) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET data = excluded.data', [key(file), buf]); },
      async get(file) { const [r] = await db.query('SELECT data FROM unihub_blobs WHERE name = $1', [key(file)]); return r ? r.data : null; },
      async del(file) { await db.query('DELETE FROM unihub_blobs WHERE name = $1', [key(file)]).catch(() => {}); },
    },
    close: () => db.close(),
  };
}
