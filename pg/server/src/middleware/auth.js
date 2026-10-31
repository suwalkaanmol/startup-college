// Session handling: JWT in an httpOnly cookie, revocable through users.token_version.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';

export const COOKIE = 'pm_session';

export function setSession(res, user) {
  const token = jwt.sign({ sub: user.id, v: user.token_version }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 7 * 864e5, path: '/' });
}

async function loadUser(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret);
    const { rows } = await query(
      'SELECT id,reg_no,email,name,gender,token_version,terms_version,terms_accepted_at FROM users WHERE id=$1 AND email_verified_at IS NOT NULL', [p.sub]);
    return rows[0] && rows[0].token_version === p.v ? rows[0] : null;
  } catch { return null; }
}

export const optionalAuth = wrap(async (req, _res, next) => { req.user = await loadUser(req); next(); });
export const requireAuth = wrap(async (req, _res, next) => {
  req.user = await loadUser(req);
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in.');
  next();
});
/** Most features need a saved profile (office + distance) first. */
export const requireProfile = wrap(async (req, _res, next) => {
  if (!(req.user.terms_accepted_at && req.user.terms_version === config.termsVersion)) throw new HttpError(403, 'CONSENT_REQUIRED', 'Please accept the Terms and Privacy Policy first.');
  const { rows } = await query('SELECT 1 FROM profiles WHERE user_id=$1 AND move_in_date IS NOT NULL', [req.user.id]);
  if (!rows[0]) throw new HttpError(409, 'NO_PROFILE', 'Please complete your profile first.');
  next();
});
