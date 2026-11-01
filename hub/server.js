// UniHub server: one server for the whole campus app.
// - Students sign in with a @vitstudent.ac.in email and an emailed 6-digit code.
// - Food, Xerox, Travel and PG run here, with one database (hub/data/hub.json) and live updates.
// - Canteen staff, Xerox shop staff and admins sign in with a staff ID and password.
// Zero dependencies: Node 20+ only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sign, verify } from './lib/jwt.js';
import { sendMail } from './lib/mailer.js';
import { createStore } from './lib/store.js';
import { createLive } from './lib/live.js';
import { HttpError, send, fail, readJson, cookies, clientIp, limiter } from './lib/http.js';
import { seed } from './seed.js';
import food from './routes/food.js';
import xerox from './routes/xerox.js';
import travel from './routes/travel.js';
import pg from './routes/pg.js';
import staffRoutes from './routes/staff.js';

const HUB_DIR = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(HUB_DIR, '..');

// ---------- config ----------
function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
}
loadEnvFile(path.join(HUB_DIR, '.env'));

export function makeConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET || (production ? '' : 'dev-only-unihub-secret-change-me-0000000000');
  if (production && (!jwtSecret || jwtSecret.length < 32)) throw new Error('Set JWT_SECRET (32+ characters) before running in production.');
  return {
    production,
    port: Number(env.PORT) || 3000,
    appName: env.APP_NAME || 'UniHub',
    domain: (env.ALLOWED_DOMAIN || 'vitstudent.ac.in').toLowerCase(),
    jwtSecret,
    smtpUrl: env.SMTP_URL || '',
    mailFrom: env.MAIL_FROM || 'UniHub <no-reply@unihub.local>',
    showDevCodes: env.DEV_SHOW_CODES ? env.DEV_SHOW_CODES === 'true' : !production,
    adminPassword: env.ADMIN_PASSWORD || '',
    dataFile: env.DATA_FILE || path.join(HUB_DIR, 'data', 'hub.json'),
  };
}

// ---------- student profile rules ----------
export const rules = {
  email(v, domain) {
    const e = String(v || '').trim().toLowerCase();
    if (!e) return { error: 'Enter your college email.' };
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(e)) return { error: 'That doesn’t look like an email address.' };
    if (!e.endsWith('@' + domain)) return { error: `Use your @${domain} email.` };
    return { value: e };
  },
  name(v) {
    const s = String(v || '').trim().replace(/\s+/g, ' ');
    if (s.length < 2) return { error: 'Enter your full name.' };
    if (s.length > 60 || !/^[\p{L} .'-]+$/u.test(s)) return { error: 'Use letters, spaces, dots or hyphens only.' };
    return { value: s };
  },
  phone(v) {
    const d = String(v || '').replace(/[\s-]/g, '').replace(/^\+?91(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(d)) return { error: 'Enter a 10-digit Indian mobile number.' };
    return { value: '+91' + d };
  },
  regNo(v) {
    const s = String(v || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^\d{2}[A-Z]{2,4}\d{3,5}$/.test(s)) return { error: 'Use the format on your ID card, like 22BCE1234.' };
    return { value: s };
  },
  gender(v) {
    const s = String(v || '').toLowerCase();
    if (!['male', 'female'].includes(s)) return { error: 'Choose one. Travel and PG use it to match you safely.' };
    return { value: s };
  },
};
const complete = (u) => Boolean(u.name && u.phone && u.regNo && u.gender);
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone, regNo: u.regNo, gender: u.gender, complete: complete(u), createdAt: u.createdAt });

// ---------- static files ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};
const PUBLIC_TOP = new Set(['', 'index.html', 'sw.js', 'manifest.webmanifest', 'food', 'travel', 'xerox', 'pg', 'nav', 'admin', 'hub']);
const BLOCKED = [
  /(^|\/)\./, /node_modules/, /\.(md|bat|sql|env|lock|log|map)$/i, /(^|\/)package(-lock)?\.json$/i,
  /^\/hub\/(?!web\/)/,
];

// ---------- a tiny router ----------
function createRouter() {
  const routes = [];
  const add = (method) => (pattern, auth, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, auth, handler });
  };
  return {
    HANDLED: Symbol('handled'),
    get: add('GET'), post: add('POST'), put: add('PUT'), del: add('DELETE'),
    match(method, pathname) {
      let allowed = false;
      for (const r of routes) {
        const m = pathname.match(r.re); if (!m) continue;
        if (r.method !== method) { allowed = true; continue; }
        const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
      return allowed ? { notAllowed: true } : null;
    },
  };
}

// ---------- app ----------
export function createApp(cfg = makeConfig(), deps = {}) {
  const store = deps.store || createStore(cfg.dataFile);
  const mail = deps.sendMail || sendMail;
  const live = createLive();
  const log = deps.log || console.log;
  seed(store, cfg, log);

  const ipCodeLimit = limiter(15 * 60e3, 20);
  const ipVerifyLimit = limiter(15 * 60e3, 60);
  const hashCode = (email, code) => crypto.createHmac('sha256', cfg.jwtSecret).update(`${email}:${code}`).digest('hex');
  const secure = (req) => cfg.production || req.headers['x-forwarded-proto'] === 'https';
  const cookie = (req, name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`;
  const addCookie = (res, c) => { const prev = res.getHeader('Set-Cookie'); res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : c); };

  const sessions = {
    student(req) { const c = verify(cookies(req).hub_session, cfg.jwtSecret); return c && !c.typ ? store.userById(c.sub) : null; },
    staff(req) { const c = verify(cookies(req).hub_staff, cfg.jwtSecret); return c && c.typ === 'staff' ? store.get('staff', c.sub) : null; },
  };
  const ctx = {
    store, live, cfg,
    setStaffSession(req, res, s) { addCookie(res, cookie(req, 'hub_staff', sign({ sub: s.id, typ: 'staff' }, cfg.jwtSecret, { expiresInSec: 12 * 3600 }), 12 * 3600)); },
    clearStaffSession(req, res) { addCookie(res, cookie(req, 'hub_staff', '', 0)); },
  };

  const r = createRouter();
  const modules = [food(r, ctx), xerox(r, ctx), travel(r, ctx), pg(r, ctx), staffRoutes(r, ctx)];

  // ---------- student sign-in ----------
  r.get('/api/health', null, () => ({ ok: true }));
  r.get('/api/hub/config', null, () => ({ appName: cfg.appName, domain: cfg.domain, devCodes: cfg.showDevCodes && !cfg.smtpUrl, mail: Boolean(cfg.smtpUrl) }));

  r.post('/api/hub/auth/request-code', null, async ({ req }) => {
    if (!ipCodeLimit(clientIp(req))) throw new HttpError(429, 'RATE_LIMIT', 'Too many code requests from this network. Try again in 15 minutes.');
    const body = await readJson(req);
    const e = rules.email(body.email, cfg.domain);
    if (e.error) throw new HttpError(400, 'BAD_EMAIL', e.error);
    const t = Date.now(); const prev = store.getCode(e.value);
    if (prev && t - prev.sentAt < 30e3) throw new HttpError(429, 'WAIT', `Wait ${Math.ceil((30e3 - (t - prev.sentAt)) / 1000)} seconds before asking for another code.`);
    const hourStart = prev && t - prev.hourStart < 3600e3 ? prev.hourStart : t;
    const hourCount = prev && hourStart === prev.hourStart ? prev.hourCount + 1 : 1;
    if (hourCount > 6) throw new HttpError(429, 'RATE_LIMIT', 'Too many codes for this email. Try again in an hour.');
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    store.setCode(e.value, { hash: hashCode(e.value, code), exp: t + 10 * 60e3, tries: 0, sentAt: t, hourStart, hourCount });
    if (cfg.smtpUrl) {
      try {
        await mail(cfg.smtpUrl, {
          from: cfg.mailFrom, to: e.value, subject: `${code} is your ${cfg.appName} code`,
          text: `Your ${cfg.appName} sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.`,
          html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#14204a"><p>Your ${cfg.appName} sign-in code is</p><p style="font-size:30px;letter-spacing:6px;font-weight:bold;color:#1f3fae">${code}</p><p>It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p></div>`,
        });
      } catch (err) {
        log('[mail] ' + err.message); store.dropCode(e.value);
        throw new HttpError(502, 'MAIL_FAILED', 'We couldn’t send the email just now. Try again in a minute.');
      }
      return { sent: true, email: e.value };
    }
    if (cfg.showDevCodes) { log(`[dev] sign-in code for ${e.value}: ${code}`); return { sent: true, email: e.value, devCode: code }; }
    store.dropCode(e.value);
    throw new HttpError(503, 'MAIL_OFF', 'Email sign-in isn’t set up on this server yet.');
  });

  r.post('/api/hub/auth/verify', null, async ({ req, res }) => {
    if (!ipVerifyLimit(clientIp(req))) throw new HttpError(429, 'RATE_LIMIT', 'Too many attempts from this network. Try again in 15 minutes.');
    const body = await readJson(req);
    const e = rules.email(body.email, cfg.domain); if (e.error) throw new HttpError(400, 'BAD_EMAIL', e.error);
    const code = String(body.code || '').replace(/\D/g, '');
    if (code.length !== 6) throw new HttpError(400, 'BAD_CODE', 'Enter the 6-digit code from the email.');
    const rec = store.getCode(e.value);
    if (!rec || rec.exp < Date.now()) throw new HttpError(400, 'EXPIRED', 'This code has expired. Ask for a new one.');
    const ok = crypto.timingSafeEqual(Buffer.from(rec.hash, 'hex'), Buffer.from(hashCode(e.value, code), 'hex'));
    if (!ok) {
      rec.tries += 1;
      if (rec.tries >= 5) { store.dropCode(e.value); throw new HttpError(400, 'LOCKED', 'Too many wrong tries. Ask for a new code.'); }
      store.setCode(e.value, rec);
      throw new HttpError(400, 'WRONG_CODE', `That code isn’t right. ${5 - rec.tries} ${5 - rec.tries === 1 ? 'try' : 'tries'} left.`);
    }
    store.dropCode(e.value);
    const u = store.userByEmail(e.value) || store.createUser(e.value);
    addCookie(res, cookie(req, 'hub_session', sign({ sub: u.id }, cfg.jwtSecret, { expiresInSec: 30 * 86400 }), 30 * 86400));
    return { user: publicUser(u) };
  });

  r.post('/api/hub/auth/logout', null, ({ req, res }) => { addCookie(res, cookie(req, 'hub_session', '', 0)); return { ok: true }; });
  r.get('/api/hub/me', 'signedIn', ({ user }) => ({ user: publicUser(user) }));
  r.put('/api/hub/me', 'signedIn', async ({ req, user }) => {
    const body = await readJson(req); const patch = {}; const fields = {};
    for (const k of ['name', 'phone', 'regNo', 'gender']) {
      if (body[k] === undefined) continue;
      const v = rules[k](body[k]); if (v.error) fields[k] = v.error; else patch[k] = v.value;
    }
    if (Object.keys(fields).length) throw new HttpError(400, 'INVALID', 'Check the highlighted fields.', { fields });
    return { user: publicUser(store.updateUser(user.id, patch)) };
  });
  r.del('/api/hub/me', 'signedIn', async ({ req, res, user }) => {
    const body = await readJson(req);
    if (String(body.confirm || '').trim().toUpperCase() !== 'DELETE') throw new HttpError(400, 'CONFIRM', 'Type DELETE to confirm.');
    for (const [col, key] of [['pgProfiles', 'uid'], ['pgSaves', 'uid'], ['xeroxFiles', 'studentId']]) for (const d of store.list(col, (x) => x[key] === user.id)) store.remove(col, d.id);
    for (const c of store.list('pgConnects', (x) => x.from === user.id || x.to === user.id)) store.remove('pgConnects', c.id);
    store.deleteUser(user.id); addCookie(res, cookie(req, 'hub_session', '', 0));
    return { ok: true };
  });
  // Everything the student ordered, newest first, for the profile drawer.
  r.get('/api/hub/orders', 'student', ({ user }) => {
    const f = store.list('foodOrders', (o) => o.studentId === user.id).map((o) => ({ source: 'food', id: o.id, title: o.canteenName, token: o.token, status: o.status, amount: o.total, at: o.createdAt, detail: o.items.map((i) => `${i.qty}× ${i.name}`).join(', ') }));
    const x = store.list('xeroxOrders', (o) => o.studentId === user.id).map((o) => ({ source: 'xerox', id: o.id, title: o.shopName, token: o.token, status: o.status, amount: o.total, at: o.createdAt, detail: o.files.map((i) => i.name).join(', ') }));
    return { orders: [...f, ...x].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60) };
  });

  // Live updates: GET /api/live?t=topic1,topic2 (each topic checked against who is asking)
  r.get('/api/live', 'any', ({ req, res, url, user, staff }) => {
    const topics = String(url.searchParams.get('t') || '').split(',').filter(Boolean).slice(0, 10);
    const who = { user: user && complete(user) ? user : null, staff };
    const ok = topics.filter((t) => modules.some((m) => m.topics(t, who)));
    if (!ok.length) throw new HttpError(403, 'FORBIDDEN', 'Nothing to follow.');
    live.open(req, res, ok);
    return r.HANDLED;
  });

  async function handleApi(req, res, url) {
    const found = r.match(req.method, url.pathname);
    if (!found) return fail(res, 404, 'NOT_FOUND', 'Not found.');
    if (found.notAllowed) return fail(res, 405, 'METHOD', 'Method not allowed.');
    const { route, params } = found;
    const user = sessions.student(req);
    const staff = sessions.staff(req);
    if (route.auth === 'signedIn' && !user) return fail(res, 401, 'SIGNED_OUT', 'Please sign in.');
    if (route.auth === 'student') {
      if (!user) return fail(res, 401, 'SIGNED_OUT', 'Please sign in.');
      if (!complete(user)) return fail(res, 409, 'PROFILE', 'Finish your profile first.');
    }
    if (route.auth === 'staff' && !staff) return fail(res, 401, 'STAFF_SIGNED_OUT', 'Please sign in with your staff ID.');
    if (route.auth === 'admin' && (!staff || staff.role !== 'admin')) return fail(res, staff ? 403 : 401, 'ADMIN_ONLY', 'Only an admin can do this.');
    if (route.auth === 'any' && !user && !staff) return fail(res, 401, 'SIGNED_OUT', 'Please sign in.');
    const out = await route.handler({ req, res, url, params, user, staff });
    if (out === r.HANDLED) return;
    return send(res, 200, out || { ok: true });
  }

  function serveStatic(req, res, url) {
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad path'); }
    if (rel.includes('\0') || BLOCKED.some((re) => re.test(rel))) return send(res, 404, 'Not found');
    if (!PUBLIC_TOP.has(rel.split('/')[1] || '')) return send(res, 404, 'Not found');
    let file = path.join(SITE_ROOT, rel);
    if (!file.startsWith(SITE_ROOT)) return send(res, 404, 'Not found');
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) {
        if (!rel.endsWith('/')) { res.writeHead(301, { Location: rel + '/' + url.search }); return res.end(); }
        file = path.join(file, 'index.html');
      }
      fs.stat(file, (err2, st2) => {
        if (err2 || !st2.isFile()) return send(res, 404, 'Not found');
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Content-Length': st2.size, 'Cache-Control': 'no-cache',
          ...(rel === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
        });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file).pipe(res);
      });
    });
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(req, res, url);
    } catch (err) {
      if (res.headersSent) { res.end(); return; }
      if (err instanceof HttpError || err.status) return fail(res, err.status, err.code || 'BAD_REQUEST', err.message, err.extra);
      log(err.stack || String(err));
      return fail(res, 500, 'SERVER', 'Something went wrong on our side.');
    }
  });
  setInterval(() => store.pruneCodes(), 10 * 60e3).unref();
  return { server, store, cfg, live };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, cfg, store } = createApp();
  server.listen(cfg.port, () => {
    console.log(`${cfg.appName} running at http://localhost:${cfg.port}`);
    if (!cfg.smtpUrl) console.log(cfg.showDevCodes ? 'No SMTP_URL set: sign-in codes are printed here and shown on screen (test mode).' : 'No SMTP_URL set: email sign-in is off.');
  });
  const stop = () => { store.flushNow(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
