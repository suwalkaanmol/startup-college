// UniHub server: email-code sign-in for @vitstudent.ac.in, student profiles,
// signed hand-off tokens for the Travel and PG modules, and the static campus site.
// Zero dependencies: Node 20+ only.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sign, verify } from './lib/jwt.js';
import { sendMail } from './lib/mailer.js';
import { createStore } from './lib/store.js';

const HUB_DIR = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(HUB_DIR, '..');

// ---------- config ----------
function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
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
    travelSecret: env.TRAVEL_JWT_SECRET || '',
    pgSecret: env.UNIHUB_SSO_SECRET || '',
    pgUrl: (env.PG_URL || 'https://placemate-x6pt.onrender.com').replace(/\/$/, ''),
    travelApiUrl: (env.TRAVEL_API_URL || '').replace(/\/$/, ''),
    xeroxSupabaseUrl: env.XEROX_SUPABASE_URL || '',
    xeroxSupabaseKey: env.XEROX_SUPABASE_ANON_KEY || '',
    dataFile: env.DATA_FILE || path.join(HUB_DIR, 'data', 'hub.json'),
  };
}

// ---------- validation ----------
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

const publicUser = (u) => ({
  id: u.id, email: u.email, name: u.name, phone: u.phone, regNo: u.regNo, gender: u.gender,
  complete: Boolean(u.name && u.phone && u.regNo && u.gender), createdAt: u.createdAt,
});

// ---------- small helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.map': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};
const PUBLIC_TOP = new Set(['', 'index.html', 'sw.js', 'manifest.webmanifest', 'food', 'travel', 'xerox', 'pg', 'nav', 'hub']);
const BLOCKED = [
  /(^|\/)\./, /node_modules/, /\.(md|bat|sql|env|lock|log)$/i, /(^|\/)package(-lock)?\.json$/i,
  /^\/hub\/(?!web\/)/, /^\/(travel|pg)\/server(\/|$)/, /^\/pg\/(client|scripts)(\/|$)/,
  /^\/xerox\/(source|unihub-print|apps|packages|supabase|scripts)(\/|$)/, /^\/food\/(src|scripts|dist)(\/|$)/,
  /^\/travel\/(client|render\.yaml)(\/|$)/,
];

function send(res, status, body, headers = {}) {
  const isObj = body && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
const fail = (res, status, code, message) => send(res, status, { error: message, code });

function readJson(req, limit = 10_000) {
  return new Promise((resolve, reject) => {
    if (!/application\/json/i.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('JSON body required'), { status: 415 }));
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('Bad JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function clientIp(req) { return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown'; }

function limiter(windowMs, max) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) { hits.set(key, { start: now, n: 1 }); return true; }
    h.n += 1; return h.n <= max;
  };
}

// ---------- app ----------
export function createApp(cfg = makeConfig(), deps = {}) {
  const store = deps.store || createStore(cfg.dataFile);
  const mail = deps.sendMail || sendMail;
  const ipCodeLimit = limiter(15 * 60e3, 20);
  const ipVerifyLimit = limiter(15 * 60e3, 60);
  const hashCode = (email, code) => crypto.createHmac('sha256', cfg.jwtSecret).update(`${email}:${code}`).digest('hex');
  const SESSION_DAYS = 30;

  const secureCookie = (req) => cfg.production || req.headers['x-forwarded-proto'] === 'https';
  const setSession = (req, res, u) => {
    const t = sign({ sub: u.id }, cfg.jwtSecret, { expiresInSec: SESSION_DAYS * 86400 });
    res.setHeader('Set-Cookie', `hub_session=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secureCookie(req) ? '; Secure' : ''}`);
  };
  const clearSession = (req, res) => res.setHeader('Set-Cookie', `hub_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie(req) ? '; Secure' : ''}`);
  const currentUser = (req) => {
    const c = verify(cookies(req).hub_session, cfg.jwtSecret);
    return c ? store.userById(c.sub) : null;
  };

  async function api(req, res, url) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/health' && m === 'GET') return send(res, 200, { ok: true });

    if (p === '/api/hub/status' && m === 'GET') {
      return send(res, 200, {
        xerox: Boolean(cfg.xeroxSupabaseUrl && cfg.xeroxSupabaseKey) || xeroxFileConfigured(),
        food: true,
        travel: Boolean(cfg.travelApiUrl),
        pg: Boolean(cfg.pgUrl),
        signedHandoff: { travel: Boolean(cfg.travelSecret), pg: Boolean(cfg.pgSecret) },
      });
    }

    if (p === '/api/hub/config' && m === 'GET') {
      return send(res, 200, { appName: cfg.appName, domain: cfg.domain, devCodes: cfg.showDevCodes && !cfg.smtpUrl, mail: Boolean(cfg.smtpUrl) });
    }

    if (p === '/api/hub/auth/request-code' && m === 'POST') {
      if (!ipCodeLimit(clientIp(req))) return fail(res, 429, 'RATE_LIMIT', 'Too many code requests from this network. Try again in 15 minutes.');
      const body = await readJson(req);
      const e = rules.email(body.email, cfg.domain);
      if (e.error) return fail(res, 400, 'BAD_EMAIL', e.error);
      const now = Date.now();
      const prev = store.getCode(e.value);
      if (prev && now - prev.sentAt < 30e3) return fail(res, 429, 'WAIT', `Wait ${Math.ceil((30e3 - (now - prev.sentAt)) / 1000)} seconds before asking for another code.`);
      const hourStart = prev && now - prev.hourStart < 3600e3 ? prev.hourStart : now;
      const hourCount = prev && hourStart === prev.hourStart ? prev.hourCount + 1 : 1;
      if (hourCount > 6) return fail(res, 429, 'RATE_LIMIT', 'Too many codes for this email. Try again in an hour.');
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      store.setCode(e.value, { hash: hashCode(e.value, code), exp: now + 10 * 60e3, tries: 0, sentAt: now, hourStart, hourCount });
      if (cfg.smtpUrl) {
        try {
          await mail(cfg.smtpUrl, {
            from: cfg.mailFrom, to: e.value, subject: `${code} is your ${cfg.appName} code`,
            text: `Your ${cfg.appName} sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.`,
            html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#14204a"><p>Your ${cfg.appName} sign-in code is</p><p style="font-size:30px;letter-spacing:6px;font-weight:bold;color:#1f3fae">${code}</p><p>It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p></div>`,
          });
        } catch (err) {
          console.error('[mail]', err.message);
          store.dropCode(e.value);
          return fail(res, 502, 'MAIL_FAILED', 'We couldn’t send the email just now. Try again in a minute.');
        }
        return send(res, 200, { sent: true, email: e.value });
      }
      if (cfg.showDevCodes) {
        console.log(`[dev] sign-in code for ${e.value}: ${code}`);
        return send(res, 200, { sent: true, email: e.value, devCode: code });
      }
      store.dropCode(e.value);
      return fail(res, 503, 'MAIL_OFF', 'Email sign-in isn’t set up on this server yet.');
    }

    if (p === '/api/hub/auth/verify' && m === 'POST') {
      if (!ipVerifyLimit(clientIp(req))) return fail(res, 429, 'RATE_LIMIT', 'Too many attempts from this network. Try again in 15 minutes.');
      const body = await readJson(req);
      const e = rules.email(body.email, cfg.domain);
      if (e.error) return fail(res, 400, 'BAD_EMAIL', e.error);
      const code = String(body.code || '').replace(/\D/g, '');
      if (code.length !== 6) return fail(res, 400, 'BAD_CODE', 'Enter the 6-digit code from the email.');
      const rec = store.getCode(e.value);
      if (!rec || rec.exp < Date.now()) return fail(res, 400, 'EXPIRED', 'This code has expired. Ask for a new one.');
      const ok = crypto.timingSafeEqual(Buffer.from(rec.hash, 'hex'), Buffer.from(hashCode(e.value, code), 'hex'));
      if (!ok) {
        rec.tries += 1;
        if (rec.tries >= 5) { store.dropCode(e.value); return fail(res, 400, 'LOCKED', 'Too many wrong tries. Ask for a new code.'); }
        store.setCode(e.value, rec);
        return fail(res, 400, 'WRONG_CODE', `That code isn’t right. ${5 - rec.tries} ${5 - rec.tries === 1 ? 'try' : 'tries'} left.`);
      }
      store.dropCode(e.value);
      const u = store.userByEmail(e.value) || store.createUser(e.value);
      setSession(req, res, u);
      return send(res, 200, { user: publicUser(u) });
    }

    if (p === '/api/hub/auth/logout' && m === 'POST') { clearSession(req, res); return send(res, 200, { ok: true }); }

    const user = currentUser(req);
    if (p.startsWith('/api/hub/') && !user) return fail(res, 401, 'SIGNED_OUT', 'Please sign in.');

    if (p === '/api/hub/me' && m === 'GET') return send(res, 200, { user: publicUser(user) });

    if (p === '/api/hub/me' && m === 'PUT') {
      const body = await readJson(req);
      const patch = {}; const errors = {};
      for (const k of ['name', 'phone', 'regNo', 'gender']) {
        if (body[k] === undefined) continue;
        const r = rules[k](body[k]);
        if (r.error) errors[k] = r.error; else patch[k] = r.value;
      }
      if (Object.keys(errors).length) return send(res, 400, { error: 'Check the highlighted fields.', code: 'INVALID', fields: errors });
      return send(res, 200, { user: publicUser(store.updateUser(user.id, patch)) });
    }

    if (p === '/api/hub/me' && m === 'DELETE') {
      const body = await readJson(req);
      if (String(body.confirm || '').trim().toUpperCase() !== 'DELETE') return fail(res, 400, 'CONFIRM', 'Type DELETE to confirm.');
      store.deleteUser(user.id); clearSession(req, res);
      return send(res, 200, { ok: true });
    }

    const sso = p.match(/^\/api\/hub\/sso\/(travel|pg)$/);
    if (sso && m === 'GET') {
      const u = publicUser(user);
      if (!u.complete) return fail(res, 409, 'PROFILE', 'Finish your profile first.');
      if (sso[1] === 'travel') {
        if (!cfg.travelSecret) return send(res, 200, { url: 'travel/index.html', linked: false, note: 'Travel opens as a guest until TRAVEL_JWT_SECRET is set on the hub.' });
        const username = u.name.replace(/[^A-Za-z0-9_]/g, '').slice(0, 20).padEnd(3, '0');
        const token = sign({ sub: u.id, username, name: u.name, email: u.email, gender: u.gender }, cfg.travelSecret, { expiresInSec: 30 * 86400 });
        return send(res, 200, { url: `travel/index.html#token=${encodeURIComponent(token)}`, linked: true });
      }
      if (!cfg.pgSecret) return send(res, 200, { url: 'pg/index.html', linked: false, note: 'PG opens its own start page until UNIHUB_SSO_SECRET is set on the hub.' });
      const token = sign({ sub: u.id, name: u.name, email: u.email, gender: u.gender, regNo: u.regNo }, cfg.pgSecret, { expiresInSec: 300 });
      return send(res, 200, { url: `${cfg.pgUrl}/sso?token=${encodeURIComponent(token)}`, linked: true });
    }

    return fail(res, 404, 'NOT_FOUND', 'Not found.');
  }

  function serveStatic(req, res, url) {
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad path'); }
    if (rel.includes('\0') || BLOCKED.some((r) => r.test(rel))) return send(res, 404, 'Not found');
    const top = rel.split('/')[1] || '';
    if (!PUBLIC_TOP.has(top)) return send(res, 404, 'Not found');
    let file = path.join(SITE_ROOT, rel);
    if (!file.startsWith(SITE_ROOT)) return send(res, 404, 'Not found');
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) {
        if (!rel.endsWith('/')) { res.writeHead(301, { Location: rel + '/' + url.search }); return res.end(); }
        file = path.join(file, 'index.html');
      }
      fs.stat(file, (err2, st2) => {
        if (err2 || !st2.isFile()) return send(res, 404, 'Not found');
        const ext = path.extname(file).toLowerCase();
        const hashed = /\/assets\/.+-[A-Za-z0-9_-]{6,}\.(js|css|svg|png|woff2?)$/.test(rel);
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Content-Length': st2.size,
          'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
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
      if (url.pathname.startsWith('/api/hub/') || url.pathname === '/api/health') return await api(req, res, url);
      // Every other /api call and /socket.io belongs to the Travel server; pass it through.
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return proxyTravel(req, res);
      const runtime = runtimeConfig(url.pathname);
      if (runtime !== null) return send(res, 200, runtime, { 'Content-Type': 'text/javascript; charset=utf-8' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(req, res, url);
    } catch (err) {
      if (err.status) return fail(res, err.status, 'BAD_REQUEST', err.message);
      console.error(err);
      return fail(res, 500, 'SERVER', 'Something went wrong on our side.');
    }
  });
  // Xerox counts as connected when hub/.env or xerox/config.js names a Supabase project.
  function xeroxFileConfigured() {
    try { return /supabaseUrl:\s*'https:\/\//.test(fs.readFileSync(path.join(SITE_ROOT, 'xerox', 'config.js'), 'utf8')); } catch { return false; }
  }

  // Module settings that used to be edited by hand now come from hub/.env.
  function runtimeConfig(pathname) {
    if (pathname === '/xerox/config.js' || pathname === '/xerox/owner/config.js') {
      if (!cfg.xeroxSupabaseUrl) return null; // fall back to the file in the repo
      return `window.XEROX_CONFIG = ${JSON.stringify({ supabaseUrl: cfg.xeroxSupabaseUrl, supabaseAnonKey: cfg.xeroxSupabaseKey })};\n`;
    }
    if (pathname === '/travel/config.js') return 'window.TRAVEL_CONFIG = { API_URL: "" }; // UniHub forwards /api and /socket.io to the Travel server\n';
    return null;
  }

  function proxyTravel(req, res) {
    if (!cfg.travelApiUrl) return fail(res, 503, 'TRAVEL_OFF', 'Travel isn’t connected yet. Set TRAVEL_API_URL on the UniHub server.');
    const target = new URL(cfg.travelApiUrl);
    const lib = target.protocol === 'https:' ? https : http;
    const headers = { ...req.headers, host: target.host, 'x-forwarded-for': clientIp(req), 'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'http' };
    delete headers.cookie; // UniHub's session cookie is not Travel's business
    const up = lib.request({ protocol: target.protocol, hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), method: req.method, path: req.url, headers, timeout: 60000 }, (r) => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
    });
    up.on('timeout', () => up.destroy(new Error('timeout')));
    up.on('error', () => { if (!res.headersSent) fail(res, 502, 'TRAVEL_DOWN', 'Travel is waking up or unreachable. Try again in a minute.'); else res.end(); });
    req.pipe(up);
  }

  // Socket.IO websockets for Travel's live chat and group updates.
  server.on('upgrade', (req, socket, head) => {
    if (!cfg.travelApiUrl || !req.url.startsWith('/socket.io/')) { socket.destroy(); return; }
    const target = new URL(cfg.travelApiUrl);
    const secure = target.protocol === 'https:';
    const port = Number(target.port) || (secure ? 443 : 80);
    const upstream = secure ? tls.connect({ host: target.hostname, port, servername: target.hostname }) : net.connect({ host: target.hostname, port });
    upstream.once(secure ? 'secureConnect' : 'connect', () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [k, v] of Object.entries(req.headers)) if (k !== 'host' && k !== 'cookie') lines.push(`${k}: ${v}`);
      lines.push(`host: ${target.host}`, '', '');
      upstream.write(lines.join('\r\n'));
      if (head && head.length) upstream.write(head);
      upstream.pipe(socket); socket.pipe(upstream);
    });
    const close = () => { socket.destroy(); upstream.destroy(); };
    upstream.on('error', close); socket.on('error', close);
  });

  setInterval(() => store.pruneCodes(), 10 * 60e3).unref();
  return { server, store, cfg };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, cfg } = createApp();
  server.listen(cfg.port, () => {
    console.log(`${cfg.appName} running at http://localhost:${cfg.port}`);
    if (!cfg.smtpUrl) console.log(cfg.showDevCodes ? 'No SMTP_URL set: sign-in codes are printed here and shown on screen (dev mode).' : 'No SMTP_URL set: email sign-in is off.');
  });
}
