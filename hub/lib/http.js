// Request and response helpers shared by every route.
export class HttpError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

export function send(res, status, body, headers = {}) {
  const isObj = body && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
export const fail = (res, status, code, message, extra = {}) => send(res, status, { error: message, code, ...extra });

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'TOO_BIG', `That’s too large. The limit is ${Math.round(limit / 1048576) || 1} MB.`)); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
export async function readJson(req, limit = 20_000) {
  if (!/application\/json/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'JSON', 'JSON body required.');
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { throw new HttpError(400, 'BAD_JSON', 'Bad JSON.'); }
}

export function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

export function limiter(windowMs, max) {
  const hits = new Map();
  return (key) => {
    const t = Date.now(); const h = hits.get(key);
    if (!h || t - h.start > windowMs) { hits.set(key, { start: t, n: 1 }); return true; }
    h.n += 1; return h.n <= max;
  };
}

// Today in India, as YYYY-MM-DD: tokens and "today's orders" follow the campus day.
export function today(d = new Date()) {
  return new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
}

// Small input checkers that throw a friendly 400.
export const need = {
  str(v, label, { min = 1, max = 200 } = {}) {
    const s = String(v ?? '').trim();
    if (s.length < min) throw new HttpError(400, 'INVALID', `${label} is required.`);
    if (s.length > max) throw new HttpError(400, 'INVALID', `${label} is too long (max ${max} characters).`);
    return s;
  },
  int(v, label, { min = 0, max = 1e9 } = {}) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, 'INVALID', `${label} must be a whole number from ${min} to ${max}.`);
    return n;
  },
  oneOf(v, label, list) {
    if (!list.includes(v)) throw new HttpError(400, 'INVALID', `${label} must be one of: ${list.join(', ')}.`);
    return v;
  },
  date(v, label) {
    const s = String(v || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + 'T00:00:00Z'))) throw new HttpError(400, 'INVALID', `${label} must be a date.`);
    return s;
  },
  time(v, label) {
    const s = String(v || '');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new HttpError(400, 'INVALID', `${label} must be a time like 14:30.`);
    return s;
  },
};
