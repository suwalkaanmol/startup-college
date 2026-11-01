// Staff passwords: scrypt with a per-account salt. Never stored or logged in plain text.
import crypto from 'node:crypto';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function checkPassword(pw, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const got = crypto.scryptSync(String(pw), salt, 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
export function passwordProblem(pw) {
  const s = String(pw || '');
  if (s.length < 8) return 'Use at least 8 characters.';
  if (s.length > 100) return 'Use at most 100 characters.';
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Mix letters and numbers.';
  return '';
}
export function randomPassword() {
  const words = ['Lotus', 'Banyan', 'Marina', 'Coral', 'Monsoon', 'Saffron', 'Ganga', 'Kaveri', 'Nilgiri', 'Palmyra'];
  return `${words[crypto.randomInt(words.length)]}-${crypto.randomInt(1000, 9999)}-${words[crypto.randomInt(words.length)]}`;
}
