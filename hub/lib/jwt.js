// Minimal HS256 JSON Web Tokens using only node:crypto.
// Compatible with the `jsonwebtoken` package that the Travel and PG servers use to verify.
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const json64 = (obj) => b64u(JSON.stringify(obj));

export function sign(payload, secret, { expiresInSec } = {}) {
  if (!secret) throw new Error('JWT secret is missing');
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, ...(expiresInSec ? { exp: now + expiresInSec } : {}) };
  const head = json64({ alg: 'HS256', typ: 'JWT' });
  const data = `${head}.${json64(body)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verify(token, secret) {
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  let header;
  try { header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8')); } catch { return null; }
  if (header.alg !== 'HS256') return null;
  const expected = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest();
  let given;
  try { given = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (claims.exp && Math.floor(Date.now() / 1000) >= claims.exp) return null;
  return claims;
}
