// Run with: npm test (from hub/). Starts a real server on a free port with a throwaway database.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { createApp, makeConfig, rules } from '../server.js';
import { sign, verify } from '../lib/jwt.js';
import { sendMail } from '../lib/mailer.js';
import { countPdfPages, priceFile, inspectFile } from '../routes/xerox.js';
import { RATES } from '../seed.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unihub-'));
const { server, places } = createApp({ ...makeConfig({ NODE_ENV: 'test' }), dataFile: path.join(dir, 'hub.json'), showDevCodes: true }, { log: () => {} });
let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => new Promise((r) => server.close(r)));

// A tiny browser: keeps cookies per client.
function client() {
  const jar = {};
  return async (p, method = 'GET', body, headers = {}) => {
    const raw = Buffer.isBuffer(body);
    const res = await fetch(base + p, {
      method, body: body ? (raw ? body : JSON.stringify(body)) : undefined,
      headers: { ...(body && !raw ? { 'content-type': 'application/json' } : {}), ...headers, cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v) jar[k] = v; else delete jar[k]; }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
}
async function student(email, name, gender) {
  const c = client();
  const r = await c('/api/hub/auth/request-code', 'POST', { email });
  await c('/api/hub/auth/verify', 'POST', { email, code: r.body.devCode });
  await c('/api/hub/me', 'PUT', { name, phone: '9876543210', regNo: '24BCE0001', gender });
  return c;
}
async function staffLogin(username, password) { const c = client(); const r = await c('/api/staff/login', 'POST', { username, password }); assert.equal(r.status, 200, username); return c; }
async function ownerLogin(expect, place, password) { const c = client(); const r = await c('/api/staff/login', 'POST', { expect, place, password }); assert.equal(r.status, 200, place); return c; }
const pay = { phone: '9876543210', otp: '123456' };

test('rules: email domain, phone, reg no', () => {
  assert.equal(rules.email('x@gmail.com', 'vitstudent.ac.in').error, 'Use your @vitstudent.ac.in email.');
  assert.equal(rules.email(' A.B2024@VITSTUDENT.AC.IN ', 'vitstudent.ac.in').value, 'a.b2024@vitstudent.ac.in');
  assert.equal(rules.phone('98765 43210').value, '+919876543210');
  assert.ok(rules.phone('12345').error);
  assert.equal(rules.regNo('22bce1234').value, '22BCE1234');
});

test('jwt round trip and expiry', () => {
  const t = sign({ sub: 'u1' }, 'k', { expiresInSec: 60 });
  assert.equal(verify(t, 'k').sub, 'u1');
  assert.equal(verify(t, 'other'), null);
  assert.equal(verify(sign({ sub: 'u1', exp: 1 }, 'k'), 'k'), null);
});

test('student sign-in with an emailed code, profile, delete', async () => {
  const c = client();
  assert.equal((await c('/api/hub/me')).status, 401);
  assert.equal((await c('/api/hub/auth/request-code', 'POST', { email: 'a@gmail.com' })).status, 400);
  const r = await c('/api/hub/auth/request-code', 'POST', { email: 'test.student2024@vitstudent.ac.in' });
  assert.match(r.body.devCode, /^\d{6}$/);
  assert.equal((await c('/api/hub/auth/request-code', 'POST', { email: 'test.student2024@vitstudent.ac.in' })).status, 429, 'resend waits 30s');
  assert.equal((await c('/api/hub/auth/verify', 'POST', { email: 'test.student2024@vitstudent.ac.in', code: r.body.devCode === '000000' ? '111111' : '000000' })).body.code, 'WRONG_CODE');
  const ok = await c('/api/hub/auth/verify', 'POST', { email: 'test.student2024@vitstudent.ac.in', code: r.body.devCode });
  assert.equal(ok.body.user.complete, false);
  assert.equal((await c('/api/food/canteens')).status, 409, 'sections need a finished profile');
  const bad = await c('/api/hub/me', 'PUT', { name: 'A', phone: '1', regNo: 'x', gender: 'other' });
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['gender', 'name', 'phone', 'regNo']);
  assert.equal((await c('/api/hub/me', 'PUT', { name: 'Test Student', phone: '9876543210', regNo: '24bce0001', gender: 'female' })).body.user.complete, true);
  assert.equal((await c('/api/hub/me', 'DELETE', { confirm: 'yes' })).status, 400);
  assert.equal((await c('/api/hub/me', 'DELETE', { confirm: 'delete' })).status, 200);
  assert.equal((await c('/api/hub/me')).status, 401);
});

test('owner logins: one per canteen and shop, each sees only its own place', async () => {
  const pl = (await client()('/api/staff/places')).body;
  assert.deepEqual(pl.canteen.map((c) => c.id).sort(), ['darling', 'garnish', 'hangy-swig', 'kc']);
  assert.equal(pl.xerox.length, 6);
  assert.equal((await client()('/api/staff/login', 'POST', { expect: 'canteen', place: 'kc', password: 'Darling@2026' })).status, 401, 'another canteen’s password');
  const kc = await ownerLogin('canteen', 'kc', 'KcFood@2026');
  assert.equal((await kc('/api/food/staff/board')).body.canteen.id, 'kc');
  assert.equal((await kc('/api/xerox/staff/queue')).status, 403);
  assert.equal((await kc('/api/admin/staff')).status, 403);
  const admin = await staffLogin('admin', 'UniHub@Admin1');
  assert.equal((await admin('/api/food/staff/board?canteen=garnish')).body.canteen.id, 'garnish');
  const made = await admin('/api/admin/staff', 'POST', { username: 'tt.evening', role: 'xerox', place: 'tt', name: 'TT evening' });
  assert.equal(made.status, 200);
  await ownerLogin('xerox', 'tt', made.body.password);
});

test('food: four menus, compare, pickup time, daily stock, separate databases', async () => {
  const s = await student('asha2024@vitstudent.ac.in', 'Asha Rao', 'female');
  const { dishes, canteens } = (await s('/api/food/dishes')).body;
  assert.deepEqual(canteens.map((c) => c.dishes).sort((a, b) => a - b), [24, 27, 28, 48]);
  const ghee = dishes.find((d) => d.canteenId === 'darling' && d.name === 'Ghee Dosai');
  const biryani = dishes.find((d) => d.canteenId === 'darling' && d.name === 'Chicken Biryani');
  assert.equal(ghee.price, 92);
  const order = (body) => s('/api/food/orders', 'POST', { canteenId: 'darling', items: [{ id: ghee.id, qty: 1 }, { id: biryani.id, qty: 1 }], pay, ...body });
  assert.equal((await order({ pay: { ...pay, otp: '111111' } })).body.code, 'PAY_CODE');
  const soon = new Date(Date.now() + 5 * 60e3 + 5.5 * 3600e3).toISOString().slice(11, 16);
  assert.equal((await order({ pickupAt: soon })).body.code, 'TOO_EARLY', 'biryani needs 30 minutes');
  const o = (await order({ mode: 'dinein' })).body.order;
  assert.equal(o.total, 92 + 135); assert.equal(o.prepMins, 30); assert.match(o.token, /^D1$/); assert.equal(o.mode, 'dinein');
  assert.equal(o.payment.payee, 'Darling (DC)');
  assert.ok(new Date(o.items[0].startBy) > new Date(o.items[1].startBy), 'biryani starts first');
  // Darling's orders live only in Darling's database.
  assert.equal(places.get('food', 'darling').count('orders'), 1); assert.equal(places.get('food', 'kc').count('orders'), 0);
  const dc = await ownerLogin('canteen', 'darling', 'Darling@2026');
  assert.equal((await dc('/api/food/staff/verify', 'POST', { token: 'd1' })).body.code, 'NOT_READY');
  await dc(`/api/food/staff/orders/${o.id}/status`, 'POST', { status: 'READY' });
  assert.equal((await dc('/api/food/staff/verify', 'POST', { token: 'd1' })).body.order.status, 'COLLECTED');
  const mine = (await s('/api/food/orders/mine')).body.orders[0];
  assert.ok(mine.validUntil && !mine.expired, 'token valid for 2 hours after collection');
  // Daily stock: 1 left, a second order fails, a cancel puts it back.
  await dc(`/api/food/staff/menu/${ghee.id}`, 'PUT', { qtyLeft: 1 });
  const one = (await s('/api/food/orders', 'POST', { canteenId: 'darling', items: [{ id: ghee.id, qty: 1 }], pay })).body.order;
  assert.equal((await s('/api/food/orders', 'POST', { canteenId: 'darling', items: [{ id: ghee.id, qty: 1 }], pay })).body.code, 'OUT_OF_STOCK');
  await s(`/api/food/orders/${one.id}/cancel`, 'POST');
  assert.equal((await dc('/api/food/staff/menu')).body.items.find((m) => m.id === ghee.id).qtyLeft, 1);
  const h = (await dc('/api/food/staff/history')).body;
  assert.equal(h.totals.orders, 1); assert.equal(h.items.find((i) => i.name === 'Chicken Biryani').qty, 1);
  assert.ok((await s('/api/hub/orders')).body.orders.some((x) => x.token === 'D1'));
});

test('xerox: Word and image pages, ranges, N-in-1, A3, binding, chat, separate databases', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Pages /Kids [2 0 R 3 0 R 4 0 R] /Count 10 >> endobj\n%%EOF');
  assert.equal(countPdfPages(pdf), 10);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.equal(inspectFile(png, 'image').pages, 1);
  assert.equal(inspectFile(Buffer.from('nope'), 'docx'), null);
  // 10 pages: 1-4 and 7-8 = 6 pages, 2-in-1 = 3 sides, front & back = 2 sheets, 2 copies = 4 sheets, + staple per copy
  const f = { ranges: [{ from: 1, to: 4 }, { from: 7, to: 8 }], nup: 2, sides: 'double', copies: 2, color: 'bw', size: 'A4', binding: 'staple' };
  assert.deepEqual(priceFile(f, RATES), { selected: 6, sheets: 4, cost: 4 * 3 + 2 * 2 });
  assert.equal(priceFile({ ...f, size: 'A3', binding: 'none' }, RATES).cost, 4 * RATES.a3BwDouble);

  const s = await student('rahul2024@vitstudent.ac.in', 'Rahul V', 'male');
  const up = (await s('/api/xerox/shops/tt/files', 'POST', pdf, { 'content-type': 'application/pdf', 'x-filename': 'lab.pdf' })).body.file;
  assert.equal(up.pages, 10);
  assert.equal((await s('/api/xerox/shops/tt/files', 'POST', Buffer.from('nope'), { 'content-type': 'text/plain' })).status, 415);
  const line = { fileId: up.id, ranges: [{ from: 1, to: 4 }, { from: 7, to: 8 }], nup: 2, sides: 'double', copies: 2, binding: 'staple' };
  assert.equal((await s('/api/xerox/quote', 'POST', { shopId: 'tt', files: [{ ...line, ranges: [{ from: 9, to: 12 }] }] })).status, 400, 'range past the last page');
  assert.equal((await s('/api/xerox/orders', 'POST', { shopId: 'tt', files: [line], pay })).body.code, 'AGREE');
  const o = (await s('/api/xerox/orders', 'POST', { shopId: 'tt', agree: true, files: [line], pay })).body.order;
  assert.equal(o.total, 16); assert.match(o.token, /^T1$/); assert.equal(o.payment.payee, 'TT Xerox');
  assert.equal(places.get('xerox', 'tt').count('orders'), 1); assert.equal(places.get('xerox', 'prp').count('orders'), 0);
  const tt = await ownerLogin('xerox', 'tt', 'TtXerox@2026');
  const prp = await ownerLogin('xerox', 'prp', 'PrpXerox@2026');
  assert.equal((await tt('/api/xerox/staff/queue')).body.orders.length, 1);
  assert.equal((await prp('/api/xerox/staff/queue')).body.orders.length, 0);
  assert.equal((await fetch(`${base}/api/xerox/shops/tt/files/${up.id}`)).status, 401);
  assert.equal((await prp(`/api/xerox/shops/tt/files/${up.id}`)).status, 403);
  await tt(`/api/xerox/staff/orders/${o.id}/status`, 'POST', { status: 'PRINTING' });
  await tt(`/api/xerox/staff/orders/${o.id}/status`, 'POST', { status: 'READY' });
  assert.equal((await tt('/api/xerox/staff/verify', 'POST', { token: 't1' })).body.order.status, 'COLLECTED');
  await s('/api/xerox/shops/tt/chat', 'POST', { text: 'Please staple it' });
  const th = (await tt('/api/xerox/staff/chats')).body.threads;
  assert.equal(th[0].token, 'T1'); assert.equal(th[0].unread, 1);
  await tt(`/api/xerox/staff/chats/${th[0].studentId}`, 'POST', { text: 'Okay' });
  assert.deepEqual((await s('/api/xerox/shops/tt/chat')).body.messages.map((m) => m.from), ['student', 'shop']);
  assert.equal((await prp('/api/xerox/staff/chats')).body.threads.length, 0, 'other shops can’t read it');
});

test('travel: girls-only rides, join, chat, fare split', async () => {
  const a = await student('anya2024@vitstudent.ac.in', 'Anya S', 'female');
  const b = await student('diya2024@vitstudent.ac.in', 'Diya P', 'female');
  const m = await student('chetan2024@vitstudent.ac.in', 'Chetan K', 'male');
  const date = new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10);
  const r = (await a('/api/travel/rides', 'POST', { dest: 'Chennai Airport', pickup: 'Main Gate', date, time: '06:30', vehicle: 'cab', seats: 4, girlsOnly: true, fare: 2400 })).body.ride;
  assert.equal((await m('/api/travel/rides')).body.rides.length, 0, 'hidden from boys');
  assert.equal((await m(`/api/travel/rides/${r.id}/join`, 'POST')).status, 403);
  assert.equal((await b(`/api/travel/rides/${r.id}/join`, 'POST')).body.ride.farePerPerson, 1200);
  assert.equal((await b(`/api/travel/rides/${r.id}/messages`, 'POST', { text: 'Gate at 6:15?' })).status, 200);
  assert.ok((await a(`/api/travel/rides/${r.id}`)).body.messages.some((x) => x.text === 'Gate at 6:15?'));
});

test('pg: same-gender matches, contacts only when both connect, enquiries reach admin', async () => {
  const a = await student('meera2024@vitstudent.ac.in', 'Meera K', 'female');
  const b = await student('nisha2024@vitstudent.ac.in', 'Nisha R', 'female');
  const m = await student('arjun2024@vitstudent.ac.in', 'Arjun M', 'male');
  const moveIn = new Date(Date.now() + 20 * 86400e3).toISOString().slice(0, 10);
  for (const c of [a, b, m]) await c('/api/pg/profile', 'PUT', { moveIn, budgetMax: 9000, tags: ['Quiet'] });
  const mine = (await a('/api/pg/matches')).body.matches;
  assert.ok(mine.every((x) => x.name !== 'Arjun M'));
  const nisha = mine.find((x) => x.name === 'Nisha R');
  await a(`/api/pg/connect/${nisha.uid}`, 'POST');
  assert.equal((await a('/api/pg/matches')).body.matches.find((x) => x.uid === nisha.uid).phone, undefined);
  const meera = (await b('/api/pg/matches')).body.matches.find((x) => x.name === 'Meera K');
  await b(`/api/pg/connect/${meera.uid}`, 'POST');
  assert.equal((await a('/api/pg/matches')).body.matches.find((x) => x.uid === nisha.uid).phone, '+919876543210');
  const admin = await staffLogin('admin', 'UniHub@Admin1');
  const l = (await admin('/api/admin/pg/listings', 'POST', { name: 'Test PG', area: 'Katpadi', rent: 8000, gender: 'female', sharing: 2 })).body.listing;
  assert.equal((await a(`/api/pg/listings/${l.id}/enquire`, 'POST', { message: 'Room in July?' })).status, 200);
  assert.ok((await admin('/api/admin/pg/enquiries')).body.enquiries.some((e) => e.message === 'Room in July?'));
});

test('private files are never served', async () => {
  for (const p of ['/hub/server.js', '/hub/data/hub.json', '/hub/data/places/food-kc.json', '/.git/config', '/legacy/pg/server/src/config.js', '/hub/.env', '/hub/routes/food.js']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
  for (const p of ['/', '/hub/web/app.js', '/food/', '/admin/', '/sw.js']) assert.equal((await fetch(base + p)).status, 200, p);
});

test('mailer speaks SMTP: EHLO, AUTH, MAIL, RCPT, DATA', async () => {
  const seen = []; let data = '';
  const smtp = net.createServer((sock) => {
    let inData = false, buf = '';
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (d) => {
      buf += d.toString(); let i;
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (line === '.') { inData = false; sock.write('250 queued\r\n'); } else data += line + '\n'; continue; }
        seen.push(line.split(' ')[0]);
        if (/^EHLO/.test(line)) sock.write('250-fake\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH/.test(line)) sock.write('235 ok\r\n');
        else if (/^DATA/.test(line)) { inData = true; sock.write('354 go\r\n'); }
        else if (/^QUIT/.test(line)) { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 ok\r\n');
      }
    });
  });
  await new Promise((r) => smtp.listen(0, r));
  await sendMail(`smtp://user:pass@127.0.0.1:${smtp.address().port}`, { from: 'UniHub <no-reply@x.in>', to: 'a@vitstudent.ac.in', subject: '123456 is your code', text: 'Code 123456' });
  smtp.close();
  assert.deepEqual(seen, ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
  assert.match(data, /Subject: 123456 is your code/);
});
