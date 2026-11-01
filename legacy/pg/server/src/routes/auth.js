// Sessions only. Sign-in belongs to UniHub: it hands a signed token to /sso.
// For testing before UniHub exists, /dev/* lets you pick or create a test student (never enabled in production unless ALLOW_DEV_LOGIN=true).
import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { COOKIE, optionalAuth, requireAuth, setSession } from '../middleware/auth.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60e3, limit: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.', code: 'RATE_LIMIT' } });
r.use((req, res, next) => (config.isTest || req.path === '/me' ? next() : limiter(req, res, next)));

// In demo mode (no UNIHUB_SSO_SECRET) a stand-in UniHub signs tokens with a key derived from JWT_SECRET.
const ssoKey = () => config.ssoSecret || (config.devLogin ? crypto.createHash('sha256').update(config.jwtSecret + ':demo-unihub').digest('hex') : '');
const me = (u) => ({ id: u.id, name: u.name, email: u.email, gender: u.gender, regNo: u.reg_no,
  consentNeeded: !(u.terms_accepted_at && u.terms_version === config.termsVersion) });

/** UniHub -> PlaceMate. Token = JWT (HS256) signed with UNIHUB_SSO_SECRET, valid for a few minutes.
 *  Claims: sub (UniHub student id), name, email (@vitstudent.ac.in), gender ('male'|'female'), regNo (optional). */
const ssoClaims = z.object({
  sub: z.union([z.string(), z.number()]).transform(String),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().refine((e) => e.endsWith('@' + config.emailDomain), `Email must end with @${config.emailDomain}`),
  gender: z.enum(['male', 'female']),
  regNo: z.string().trim().toUpperCase().max(20).optional(),
});

/** Create the student on first visit, otherwise refresh their name/email. */
async function upsertStudent({ externalId, name, email, gender, regNo }) {
  const reg = regNo || externalId.toUpperCase().slice(0, 20);
  const found = (await query('SELECT * FROM users WHERE external_id=$1 OR email=$2 ORDER BY (external_id=$1) DESC LIMIT 1', [externalId, email])).rows[0];
  if (found) {
    return (await query('UPDATE users SET external_id=$1, name=$2, email=$3, gender=$4, email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$5 RETURNING *',
      [externalId, name, email, gender, found.id])).rows[0];
  }
  try {
    // Consent is NOT assumed: the student accepts the Terms and Privacy Policy on first use (see /consent).
    return (await query(`INSERT INTO users (external_id,reg_no,email,name,gender,email_verified_at)
      VALUES ($1,$2,$3,$4,$5,now()) RETURNING *`, [externalId, reg, email, name, gender])).rows[0];
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'EXISTS', 'This registration number is already linked to another student.');
    throw e;
  }
}

r.post('/sso', validate(z.object({ token: z.string().min(10) })), wrap(async (req, res) => {
  if (!ssoKey()) throw new HttpError(503, 'SSO_OFF', 'UniHub sign-in is not set up on this server yet.');
  let p;
  try { p = jwt.verify(req.body.token, ssoKey(), { algorithms: ['HS256'] }); }
  catch { throw new HttpError(401, 'BAD_TOKEN', 'Your UniHub sign-in has expired. Please open PlaceMate from UniHub again.'); }
  const c = ssoClaims.safeParse(p);
  if (!c.success) throw new HttpError(400, 'BAD_TOKEN', c.error.issues[0]?.message || 'Invalid sign-in details from UniHub.');
  const u = await upsertStudent({ externalId: c.data.sub, name: c.data.name, email: c.data.email, gender: c.data.gender, regNo: c.data.regNo });
  setSession(res, u);
  res.json({ user: me(u) });
}));

const devOnly = (_req, _res, next) => (config.devLogin ? next() : next(new HttpError(404, 'NOT_FOUND', 'Not found.')));
/** Stand-in for UniHub's own login, for testing only: returns the signed token UniHub would send. */
r.post('/dev/unihub-token', devOnly, validate(z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  gender: z.enum(['male', 'female'], { errorMap: () => ({ message: 'Choose Male or Female.' }) }),
})), wrap(async (req, res) => {
  const slug = req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 30) || 'student';
  const token = jwt.sign({ sub: `demo-${slug}`, name: req.body.name, gender: req.body.gender, email: `${slug}@${config.emailDomain}`, regNo: ('22DEMO' + slug.replace(/\./g, '').toUpperCase()).slice(0, 20) },
    ssoKey(), { algorithm: 'HS256', expiresIn: '5m' });
  res.json({ token });
}));
r.post('/dev/login', devOnly, validate(z.union([
  z.object({ userId: z.string().uuid() }),
  z.object({ name: z.string().trim().min(2, 'Enter a name.').max(80), gender: z.enum(['male', 'female'], { errorMap: () => ({ message: 'Choose Male or Female.' }) }) }),
])), wrap(async (req, res) => {
  let u;
  if (req.body.userId) {
    u = (await query('SELECT * FROM users WHERE id=$1', [req.body.userId])).rows[0];
    if (!u) throw new HttpError(404, 'NOT_FOUND', 'That test student no longer exists.');
  } else {
    const k = crypto.randomInt(10000, 99999);
    u = await upsertStudent({ externalId: `dev-${k}-${Date.now()}`, name: req.body.name, email: `dev${k}${Date.now() % 1e4}@${config.emailDomain}`, gender: req.body.gender, regNo: `22DEV${k}` });
  }
  setSession(res, u);
  res.json({ user: me(u) });
}));

r.post('/consent', requireAuth, validate(z.object({ accept: z.literal(true, { errorMap: () => ({ message: 'Please tick the box to continue.' }) }) })), wrap(async (req, res) => {
  const u = (await query('UPDATE users SET terms_version=$1, terms_accepted_at=now() WHERE id=$2 RETURNING *', [config.termsVersion, req.user.id])).rows[0];
  res.json({ user: me(u) });
}));

r.post('/logout', (_req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
r.get('/me', optionalAuth, (req, res) => res.json({ user: req.user ? me(req.user) : null })); // 200 even when signed out

export default r;
