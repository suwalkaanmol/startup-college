// Receipt verification codes. Each paid order gets a code signed with the server's secret, printed on the slip.
// Anyone can check a slip at /verify/: a made-up or edited slip won't match any order.
import crypto from 'node:crypto';

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
export function receiptCode(secret, kind, placeId, o) {
  const mac = crypto.createHmac('sha256', secret).update(`${kind}|${placeId}|${o.id}|${o.token}|${o.total}|${o.createdAt}`).digest();
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHA[mac[i] % 32];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}
export const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').slice(0, 10).replace(/^(.{5})(.+)$/, '$1-$2');
