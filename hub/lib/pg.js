// A small PostgreSQL client with no dependencies: TLS, SCRAM-SHA-256 / md5 / password sign-in,
// and parameterised queries over the extended protocol. Enough for UniHub's storage on Neon or any Postgres.
// One connection, queries run one at a time, reconnects on the next query after a drop.
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

const enc = (s) => Buffer.from(s, 'utf8');
function msg(type, body) { const len = Buffer.alloc(4); len.writeInt32BE(body.length + 4); return Buffer.concat([type ? Buffer.from(type) : Buffer.alloc(0), len, body]); }
const cstr = (s) => Buffer.concat([enc(s), Buffer.from([0])]);
const int16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const int32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };

export function parseUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname, port: Number(u.port) || 5432, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)) || decodeURIComponent(u.username), sslmode: u.searchParams.get('sslmode') || (/^(localhost|127\.|::1)/.test(u.hostname) ? 'disable' : 'require'),
  };
}

export function createPg(url, { log = () => {} } = {}) {
  const cfg = parseUrl(url);
  let sock = null, ready = null, buf = Buffer.alloc(0), waiters = [], inbox = [], queue = Promise.resolve();

  // Reads whole server messages as they arrive.
  function onData(d) {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 5) {
      const len = buf.readInt32BE(1); if (buf.length < len + 1) break;
      const m = { type: String.fromCharCode(buf[0]), body: Buffer.from(buf.subarray(5, len + 1)) };
      buf = buf.subarray(len + 1);
      if (m.type === 'N' || m.type === 'S' || m.type === 'K' || m.type === 'A') continue; // notices, settings, keys: not needed
      const w = waiters.shift(); if (w) w(m); else inbox.push(m);
    }
  }
  const next = () => {
    if (inbox.length) return Promise.resolve(inbox.shift());
    return new Promise((res, rej) => {
      const w = (m) => { clearTimeout(t); res(m); };
      const t = setTimeout(() => { waiters = waiters.filter((x) => x !== w); sock?.destroy(); rej(new Error('Database did not answer in time.')); }, 30000); // a dead connection is dropped and the next query reconnects
      waiters.push(w);
    });
  };
  const errorText = (body) => { const f = {}; let i = 0; while (i < body.length && body[i]) { const k = String.fromCharCode(body[i]); const e = body.indexOf(0, i + 1); f[k] = body.subarray(i + 1, e).toString(); i = e + 1; } return Object.assign(new Error(f.M || 'Database error'), { code: f.C }); };

  async function connect() {
    buf = Buffer.alloc(0); waiters = []; inbox = [];
    let s = net.connect(cfg.port, cfg.host);
    await new Promise((res, rej) => { s.once('connect', res); s.once('error', rej); });
    if (cfg.sslmode !== 'disable') {
      s.write(Buffer.concat([int32(8), int32(80877103)]));
      const answer = await new Promise((res, rej) => { s.once('data', (d) => res(String.fromCharCode(d[0]))); s.once('error', rej); });
      if (answer !== 'S') throw new Error('The database does not accept encrypted connections.');
      s = tls.connect({ socket: s, servername: net.isIP(cfg.host) ? undefined : cfg.host, rejectUnauthorized: cfg.sslmode !== 'no-verify' });
      await new Promise((res, rej) => { s.once('secureConnect', res); s.once('error', rej); });
    }
    sock = s;
    s.on('data', onData);
    s.on('error', (e) => { log(`Database connection error: ${e.message}`); });
    s.on('close', () => { sock = null; ready = null; for (const w of waiters.splice(0)) w({ type: 'E', body: Buffer.from('MDatabase connection closed\0\0') }); });
    s.write(msg('', Buffer.concat([int32(196608), cstr('user'), cstr(cfg.user), cstr('database'), cstr(cfg.database), cstr('application_name'), cstr('unihub'), Buffer.from([0])])));
    for (;;) {
      const m = await next();
      if (m.type === 'E') throw errorText(m.body);
      if (m.type === 'R') {
        const kind = m.body.readInt32BE(0);
        if (kind === 0) continue;
        if (kind === 3) s.write(msg('p', cstr(cfg.password)));
        else if (kind === 5) {
          const salt = m.body.subarray(4, 8);
          const inner = crypto.createHash('md5').update(cfg.password + cfg.user).digest('hex');
          s.write(msg('p', cstr('md5' + crypto.createHash('md5').update(Buffer.concat([enc(inner), salt])).digest('hex'))));
        } else if (kind === 10) await scram(s);
        else throw new Error(`Unsupported sign-in method (${kind}).`);
      }
      if (m.type === 'Z') return;
    }
  }

  async function scram(s) {
    const nonce = crypto.randomBytes(18).toString('base64');
    const first = `n=*,r=${nonce}`;
    const init = enc(`n,,${first}`);
    s.write(msg('p', Buffer.concat([cstr('SCRAM-SHA-256'), int32(init.length), init])));
    const m1 = await next(); if (m1.type === 'E') throw errorText(m1.body);
    const server = m1.body.subarray(4).toString();
    const a = Object.fromEntries(server.split(',').map((p) => [p[0], p.slice(2)]));
    if (!a.r.startsWith(nonce)) throw new Error('Database sign-in failed (nonce).');
    const salted = crypto.pbkdf2Sync(cfg.password.normalize('NFKC'), Buffer.from(a.s, 'base64'), Number(a.i), 32, 'sha256');
    const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
    const clientKey = hmac(salted, 'Client Key');
    const storedKey = crypto.createHash('sha256').update(clientKey).digest();
    const without = `c=biws,r=${a.r}`;
    const auth = `${first},${server},${without}`;
    const sig = hmac(storedKey, auth);
    const proof = Buffer.from(clientKey.map((b, i) => b ^ sig[i])).toString('base64');
    s.write(msg('p', enc(`${without},p=${proof}`)));
    const m2 = await next(); if (m2.type === 'E') throw errorText(m2.body);
    const fin = m2.body.subarray(4).toString();
    const expect = hmac(hmac(salted, 'Server Key'), auth).toString('base64');
    if (!fin.includes(`v=${expect}`)) throw new Error('Database sign-in failed (server proof).');
  }

  // Values travel as text; Buffers are sent as bytea hex. Rows come back as objects of strings (bytea -> Buffer).
  async function run(sql, params = []) {
    if (!sock) { ready ||= connect().catch((e) => { ready = null; throw e; }); await ready; }
    const vals = params.map((p) => (p == null ? null : Buffer.isBuffer(p) ? enc('\\x' + p.toString('hex')) : enc(String(p))));
    const bind = [cstr(''), cstr(''), int16(0), int16(vals.length)];
    for (const v of vals) bind.push(v === null ? int32(-1) : Buffer.concat([int32(v.length), v]));
    bind.push(int16(0));
    sock.write(Buffer.concat([msg('P', Buffer.concat([cstr(''), cstr(sql), int16(0)])), msg('B', Buffer.concat(bind)), msg('D', Buffer.concat([Buffer.from('P'), cstr('')])), msg('E', Buffer.concat([cstr(''), int32(0)])), msg('S', Buffer.alloc(0))]));
    let cols = [], types = [], rows = [], err = null;
    for (;;) {
      const m = await next();
      if (m.type === 'T') {
        const n = m.body.readInt16BE(0); let i = 2; cols = []; types = [];
        for (let k = 0; k < n; k++) { const e = m.body.indexOf(0, i); cols.push(m.body.subarray(i, e).toString()); types.push(m.body.readInt32BE(e + 7)); i = e + 19; }
      } else if (m.type === 'D') {
        const n = m.body.readInt16BE(0); let i = 2; const row = {};
        for (let k = 0; k < n; k++) {
          const len = m.body.readInt32BE(i); i += 4;
          if (len < 0) { row[cols[k]] = null; continue; }
          const raw = m.body.subarray(i, i + len); i += len;
          row[cols[k]] = types[k] === 17 ? Buffer.from(raw.toString().slice(2), 'hex') : raw.toString();
        }
        rows.push(row);
      } else if (m.type === 'E') err = errorText(m.body);
      else if (m.type === 'Z') break;
    }
    if (err) throw err;
    return rows;
  }
  return {
    query(sql, params) { const p = queue.then(() => run(sql, params)); queue = p.catch(() => {}); return p; },
    close() { try { sock?.end(msg('X', Buffer.alloc(0))); } catch { /* closed */ } },
  };
}
