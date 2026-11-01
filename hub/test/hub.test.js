// Run with: npm test (from hub/)
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createApp, makeConfig, rules } from '../server.js';
import { sign, verify } from '../lib/jwt.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unihub-'));
const cfg = { ...makeConfig({ NODE_ENV: 'test' }), dataFile: path.join(dir, 'hub.json'), travelSecret: 'travel-secret-travel-secret-1234', pgSecret: 'pg-secret-pg-secret-pg-secret-12', showDevCodes: true };
const { server } = createApp(cfg);
let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => new Promise((r) => server.close(r)));

let cookie = '';
const call = async (p, method = 'GET', body) => {
  const res = await fetch(base + p, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('rules: email domain, phone, reg no', () => {
  assert.equal(rules.email('x@gmail.com', 'vitstudent.ac.in').error, 'Use your @vitstudent.ac.in email.');
  assert.equal(rules.email(' A.B2024@VITSTUDENT.AC.IN ', 'vitstudent.ac.in').value, 'a.b2024@vitstudent.ac.in');
  assert.equal(rules.phone('98765 43210').value, '+919876543210');
  assert.equal(rules.phone('+91-9876543210').value, '+919876543210');
  assert.ok(rules.phone('12345').error);
  assert.equal(rules.regNo('22bce1234').value, '22BCE1234');
  assert.ok(rules.regNo('BCE1234').error);
});

test('jwt round trip and expiry', () => {
  const t = sign({ sub: 'u1' }, 'k', { expiresInSec: 60 });
  assert.equal(verify(t, 'k').sub, 'u1');
  assert.equal(verify(t, 'other'), null);
  assert.equal(verify(sign({ sub: 'u1', exp: 1 }, 'k'), 'k'), null);
});

test('sign-in with an emailed code, then profile and hand-off tokens', async () => {
  assert.equal((await call('/api/hub/me')).status, 401);
  assert.equal((await call('/api/hub/auth/request-code', 'POST', { email: 'a@gmail.com' })).status, 400);
  const r = await call('/api/hub/auth/request-code', 'POST', { email: 'test.student2024@vitstudent.ac.in' });
  assert.equal(r.status, 200); assert.match(r.body.devCode, /^\d{6}$/);
  assert.equal((await call('/api/hub/auth/request-code', 'POST', { email: 'test.student2024@vitstudent.ac.in' })).status, 429, 'resend waits 30s');
  const wrong = await call('/api/hub/auth/verify', 'POST', { email: 'test.student2024@vitstudent.ac.in', code: r.body.devCode === '000000' ? '111111' : '000000' });
  assert.equal(wrong.body.code, 'WRONG_CODE');
  const ok = await call('/api/hub/auth/verify', 'POST', { email: 'test.student2024@vitstudent.ac.in', code: r.body.devCode });
  assert.equal(ok.status, 200); assert.equal(ok.body.user.complete, false); assert.ok(cookie.startsWith('hub_session='));
  assert.equal((await call('/api/hub/auth/verify', 'POST', { email: 'test.student2024@vitstudent.ac.in', code: r.body.devCode })).status, 400, 'codes work once');

  assert.equal((await call('/api/hub/sso/travel')).status, 409, 'profile first');
  const bad = await call('/api/hub/me', 'PUT', { name: 'A', phone: '1', regNo: 'x', gender: 'other' });
  assert.equal(bad.status, 400); assert.deepEqual(Object.keys(bad.body.fields).sort(), ['gender', 'name', 'phone', 'regNo']);
  const me = await call('/api/hub/me', 'PUT', { name: 'Test Student', phone: '9876543210', regNo: '24bce0001', gender: 'female' });
  assert.equal(me.body.user.complete, true); assert.equal(me.body.user.regNo, '24BCE0001');

  const t = await call('/api/hub/sso/travel');
  const travelClaims = verify(decodeURIComponent(t.body.url.split('#token=')[1]), cfg.travelSecret);
  assert.equal(travelClaims.gender, 'female'); assert.equal(travelClaims.username, 'TestStudent');
  const p = await call('/api/hub/sso/pg');
  const pgClaims = verify(decodeURIComponent(p.body.url.split('token=')[1]), cfg.pgSecret);
  assert.equal(pgClaims.email, 'test.student2024@vitstudent.ac.in'); assert.equal(pgClaims.regNo, '24BCE0001');
  assert.ok(pgClaims.exp - pgClaims.iat <= 300);

  await call('/api/hub/auth/logout', 'POST');
  assert.equal((await call('/api/hub/me')).status, 401);
});

test('private files are never served', async () => {
  for (const p of ['/hub/server.js', '/hub/data/hub.json', '/.git/config', '/pg/server/src/config.js', '/xerox/source/README.md', '/hub/.env']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
  assert.equal((await fetch(base + '/hub/web/app.js')).status, 200);
  assert.equal((await fetch(base + '/')).status, 200);
});

test('mailer speaks SMTP: EHLO, AUTH, MAIL, RCPT, DATA', async () => {
  const net = await import('node:net');
  const { sendMail } = await import('../lib/mailer.js');
  const seen = [];
  let data = '';
  const smtp = net.createServer((sock) => {
    let inData = false, buf = '';
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (d) => {
      buf += d.toString();
      let i;
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
  await sendMail(`smtp://user:pass@127.0.0.1:${smtp.address().port}`, { from: 'UniHub <no-reply@x.in>', to: 'a@vitstudent.ac.in', subject: '123456 is your code', text: 'Code 123456', html: '<b>123456</b>' });
  smtp.close();
  assert.deepEqual(seen, ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
  assert.match(data, /Subject: 123456 is your code/);
  assert.match(data, /Code 123456/);
});
