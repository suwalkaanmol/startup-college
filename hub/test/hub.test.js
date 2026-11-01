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
import { countPdfPages, priceFile } from '../routes/xerox.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unihub-'));
const { server } = createApp({ ...makeConfig({ NODE_ENV: 'test' }), dataFile: path.join(dir, 'hub.json'), showDevCodes: true }, { log: () => {} });
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

test('staff logins: right password, right place, admin only for admin', async () => {
  assert.equal((await client()('/api/staff/login', 'POST', { username: 'foodys', password: 'nope' })).status, 401);
  const canteen = await staffLogin('foodys', 'Foodys@2026');
  assert.equal((await canteen('/api/xerox/staff/queue')).status, 403);
  assert.equal((await canteen('/api/admin/staff')).status, 403);
  const admin = await staffLogin('admin', 'UniHub@Admin1');
  const made = await admin('/api/admin/staff', 'POST', { username: 'tt.evening', role: 'xerox', place: 'tt', name: 'TT evening' });
  assert.equal(made.status, 200); assert.ok(made.body.password.length >= 8);
  await staffLogin('tt.evening', made.body.password);
  assert.equal((await admin('/api/admin/staff', 'POST', { username: 'tt.evening', role: 'xerox', place: 'tt' })).status, 409);
});

test('food: order, token, staff steps, handover, stock', async () => {
  const s = await student('asha2024@vitstudent.ac.in', 'Asha Rao', 'female');
  const menu = (await s('/api/food/canteens/foodys/menu')).body.items;
  const dosa = menu.find((m) => m.name === 'Masala Dosa');
  const pay = { phone: '9876543210', otp: '123456' };
  assert.equal((await s('/api/food/orders', 'POST', { canteenId: 'foodys', items: [{ id: dosa.id, qty: 2 }], pay: { ...pay, otp: '111111' } })).body.code, 'PAY_CODE', 'wrong code: no order');
  assert.equal((await s('/api/food/orders', 'POST', { canteenId: 'foodys', items: [{ id: dosa.id, qty: 2 }] })).body.code, 'PAY_PHONE', 'no payment: no order');
  const o = (await s('/api/food/orders', 'POST', { canteenId: 'foodys', items: [{ id: dosa.id, qty: 2 }], pay })).body.order;
  assert.equal(o.total, 120); assert.match(o.token, /^F1$/, 'unpaid attempts use no token');
  assert.equal(o.payment.status, 'PAID'); assert.equal(o.payment.amount, 120);
  const st = await staffLogin('foodys', 'Foodys@2026');
  assert.equal((await st(`/api/food/staff/orders/${o.id}/status`, 'POST', { status: 'READY' })).status, 409, 'no skipping steps');
  await st(`/api/food/staff/orders/${o.id}/status`, 'POST', { status: 'PREPARING' });
  await st(`/api/food/staff/orders/${o.id}/status`, 'POST', { status: 'READY' });
  assert.equal((await st('/api/food/staff/verify', 'POST', { token: o.token.toLowerCase() })).body.order.status, 'COMPLETED');
  await st(`/api/food/staff/menu/${dosa.id}`, 'PUT', { inStock: false });
  assert.equal((await s('/api/food/orders', 'POST', { canteenId: 'foodys', items: [{ id: dosa.id, qty: 1 }], pay })).body.code, 'OUT_OF_STOCK');
  const idli = menu.find((m) => m.name !== 'Masala Dosa' && m.inStock);
  const c = (await s('/api/food/orders', 'POST', { canteenId: 'foodys', items: [{ id: idli.id, qty: 1 }], pay })).body.order;
  await s(`/api/food/orders/${c.id}/cancel`, 'POST');
  assert.equal((await s('/api/food/orders/mine')).body.orders.find((x) => x.id === c.id).payment.status, 'REFUNDED');
  assert.ok((await s('/api/hub/orders')).body.orders.some((x) => x.token === o.token));
});

test('xerox: page count, team price rules, shop queue, file privacy', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Pages /Kids [2 0 R 3 0 R 4 0 R] /Count 3 >> endobj\n%%EOF');
  assert.equal(countPdfPages(pdf), 3);
  assert.equal(countPdfPages(Buffer.from('hello')), -1);
  const rates = { bwSingle: 2, bwDouble: 3, colorSingle: 10, colorDouble: 20, spiral: 30 };
  assert.deepEqual(priceFile({ from: 1, to: 3, copies: 2, color: 'bw', sides: 'double', spiral: true }, rates), { sheets: 3, cost: 39 });
  const s = await student('rahul2024@vitstudent.ac.in', 'Rahul V', 'male');
  const up = (await s('/api/xerox/files', 'POST', pdf, { 'content-type': 'application/pdf', 'x-filename': 'lab.pdf' })).body.file;
  assert.equal(up.pages, 3);
  assert.equal((await s('/api/xerox/files', 'POST', Buffer.from('nope'), { 'content-type': 'application/pdf' })).status, 400);
  const o = (await s('/api/xerox/orders', 'POST', { shopId: 'prp', files: [{ fileId: up.id, copies: 1, color: 'color', sides: 'single' }], pay: { phone: '+91 98765 43210', otp: '123456' } })).body.order;
  assert.equal(o.payment.status, 'PAID');
  assert.equal(o.total, 30); assert.match(o.token, /^P\d+$/);
  const prp = await staffLogin('prp', 'PrpXerox@2026');
  assert.equal((await prp('/api/xerox/staff/queue')).body.orders.length, 1);
  const ganga = await staffLogin('ganga', 'GangaXerox@2026');
  assert.equal((await ganga('/api/xerox/staff/queue')).body.orders.length, 0);
  assert.equal((await fetch(`${base}/api/xerox/files/${up.id}`)).status, 401);
  assert.equal((await ganga(`/api/xerox/files/${up.id}`)).status, 403);
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
  for (const p of ['/hub/server.js', '/hub/data/hub.json', '/.git/config', '/legacy/pg/server/src/config.js', '/hub/.env', '/hub/routes/food.js']) {
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
