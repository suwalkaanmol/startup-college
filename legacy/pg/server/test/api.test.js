// End-to-end API tests against a SEPARATE database (tables are wiped each run).
// Setup:  createdb placemate_test   then   npm test --prefix server
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/placemate_test';
if (!/test/i.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('Refusing to run: the test database name must contain "test".');

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { pool, query } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { seed } = await import('../src/seed.js');
const { createApp } = await import('../src/app.js');

let server, base;

/** Tiny HTTP client with its own cookie jar (one per signed-in "device"). */
class Client {
  cookie = '';
  async req(method, path, body) {
    const res = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'PlaceMate', ...(this.cookie && { Cookie: this.cookie }) }, body: body && JSON.stringify(body) });
    for (const c of res.headers.getSetCookie?.() || []) { const [pair] = c.split(';'); const [k, v] = pair.split('='); if (k === 'pm_session') this.cookie = v ? pair : ''; }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
  get = (p) => this.req('GET', p);
  post = (p, b = {}) => this.req('POST', p, b);
}

let seq = 100;
const plusDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const DATES = { moveInFrom: plusDays(10), moveInTo: plusDays(40), moveInDate: plusDays(20) };
/** Create a test student through the dev sign-in + save a profile. */
async function makeUser({ gender = 'male', hubId = 'blr-whitefield', maxDistanceKm = 10, tags = [], priorities = [], profile = true, consent = true, dates = DATES } = {}) {
  const n = seq++, c = new Client();
  const ver = await c.post('/auth/dev/login', { name: `Student ${n}`, gender });
  assert.equal(ver.status, 200, JSON.stringify(ver.body));
  if (consent) assert.equal((await c.post('/auth/consent', { accept: true })).status, 200);
  if (profile) assert.equal((await c.req('PUT', '/profile', { company: 'TCS', hubId, maxDistanceKm, tags, priorities, ...dates })).status, 200);
  return { c, id: ver.body.user.id, email: ver.body.user.email, n };
}

before(async () => {
  await migrate(); await seed();
  await query('TRUNCATE users, groups RESTART IDENTITY CASCADE');
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(async () => { server.close(); await pool.end(); });

test('sign-in: dev picker validation, CSRF, UniHub token', async () => {
  const c = new Client();
  assert.equal((await c.post('/auth/dev/login', { name: 'X', gender: 'male' })).status, 400);
  assert.equal((await c.post('/auth/dev/login', { name: 'Test User', gender: 'other' })).status, 400);
  assert.equal((await c.post('/auth/login', { identifier: 'a', password: 'b' })).status, 404); // old password login is gone
  const raw = await fetch(base + '/api/auth/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(raw.status, 403); // no X-Requested-With header
  // UniHub token: off until a secret is set, then accepted/rejected correctly.
  assert.equal((await c.post('/auth/sso', { token: 'x'.repeat(20) })).status, 401); // garbage token
  const demo = await c.post('/auth/dev/unihub-token', { name: 'Demo Person', gender: 'female' }); // stand-in UniHub token works end to end
  assert.equal(demo.status, 200);
  const viaDemo = await c.post('/auth/sso', { token: demo.body.token });
  assert.deepEqual([viaDemo.status, viaDemo.body.user.name, viaDemo.body.user.gender], [200, 'Demo Person', 'female']);
  const { config } = await import('../src/config.js'); const jwt = (await import('jsonwebtoken')).default;
  config.ssoSecret = 'unihub-test-secret';
  try {
    const claims = { sub: 'uni-42', name: 'Uni Student', email: 'uni42@vitstudent.ac.in', gender: 'female', regNo: '22BCE4242' };
    assert.equal((await c.post('/auth/sso', { token: jwt.sign(claims, 'wrong-secret') })).status, 401);
    assert.equal((await c.post('/auth/sso', { token: jwt.sign({ ...claims, email: 'u@gmail.com' }, config.ssoSecret) })).status, 400);
    assert.equal((await c.post('/auth/sso', { token: jwt.sign(claims, config.ssoSecret, { expiresIn: -10 }) })).status, 401);
    const ok = await c.post('/auth/sso', { token: jwt.sign(claims, config.ssoSecret, { expiresIn: '5m' }) });
    assert.equal(ok.status, 200); assert.equal((await c.get('/auth/me')).body.user.name, 'Uni Student');
    const again = await new Client().post('/auth/sso', { token: jwt.sign({ ...claims, name: 'Uni Renamed' }, config.ssoSecret, { expiresIn: '5m' }) });
    assert.equal(again.body.user.id, ok.body.user.id); // same student, not a duplicate
    assert.equal(again.body.user.name, 'Uni Renamed');
  } finally { config.ssoSecret = ''; }
});

test('consent is required before using PlaceMate', async () => {
  const u = await makeUser({ consent: false, profile: false });
  assert.equal((await u.c.get('/auth/me')).body.user.consentNeeded, true);
  assert.equal((await u.c.get('/matches')).body.code, 'CONSENT_REQUIRED');
  assert.equal((await u.c.post('/auth/consent', { accept: false })).status, 400);
  assert.equal((await u.c.post('/auth/consent', { accept: true })).body.user.consentNeeded, false);
  assert.equal((await u.c.get('/matches')).body.code, 'NO_PROFILE');
});

test('NO_PROFILE and tag sanitising', async () => {
  const u = await makeUser({ profile: false });
  assert.equal((await u.c.get('/matches')).body.code, 'NO_PROFILE');
  const put = await u.c.req('PUT', '/profile', { ...DATES, company: 'TCS', hubId: 'blr-whitefield', maxDistanceKm: 10,
    tags: ['vegetarian', 'non_veg', 'bogus', 'gym'], priorities: ['gym', 'night_owl', 'vegetarian'] });
  assert.deepEqual(put.body.profile.tags, ['vegetarian', 'gym']); // unknown dropped, one food only
  assert.deepEqual(put.body.profile.priorities, ['gym', 'vegetarian']); // only selected tags
});

// Shared cast for the remaining tests.
const cast = {};
test('matching: ranking, gender separation, distance filter', async () => {
  cast.a = await makeUser({ tags: ['early_sleeper', 'non_smoker'], priorities: ['early_sleeper'] });
  cast.b = await makeUser({ tags: ['early_sleeper', 'non_smoker'] });
  cast.c = await makeUser({ tags: ['night_owl'] });
  cast.f = await makeUser({ gender: 'female', tags: ['early_sleeper'] });
  cast.far = await makeUser({ hubId: 'maa-guindy', maxDistanceKm: 5 });
  const mine = new Set([cast.b.id, cast.c.id, cast.f.id, cast.far.id]); // ignore users left by earlier tests
  const list = (await cast.a.c.get('/matches')).body.matches.filter((m) => mine.has(m.id));
  assert.deepEqual(list.map((m) => m.id), [cast.b.id, cast.c.id]); // best match first; female and far user absent
  assert.ok(list[0].score > list[1].score);
  assert.equal((await cast.f.c.get('/matches')).body.matches.length, 0); // no males, no other women nearby
  assert.equal((await cast.far.c.get('/matches')).body.matches.length, 0);
});

test('requests: duplicate, accept -> group, chat, unread, outsider blocked', async () => {
  const { a, b, c } = cast;
  assert.equal((await a.c.post('/requests', { toUserId: b.id })).status, 201);
  assert.equal((await a.c.post('/requests', { toUserId: b.id })).body.code, 'DUPLICATE');
  assert.equal((await b.c.post('/requests', { toUserId: a.id })).body.code, 'INCOMING');
  const incoming = (await b.c.get('/requests')).body.incoming;
  assert.equal(incoming.length, 1);
  const acc = await b.c.post(`/requests/${incoming[0].id}/accept`);
  assert.equal(acc.status, 200);
  cast.gid = acc.body.groupId;
  assert.equal((await a.c.post(`/groups/${cast.gid}/messages`, { body: 'Hi!' })).status, 201);
  const g = (await b.c.get('/groups')).body.groups[0];
  assert.ok(g.unread >= 1); // system note + Hi
  const msgs = (await b.c.get(`/groups/${cast.gid}/messages`)).body.messages;
  assert.ok(msgs.some((m) => m.body === 'Hi!'));
  assert.equal((await b.c.get('/groups')).body.groups[0].unread, 0); // reading clears it
  assert.equal((await c.c.get(`/groups/${cast.gid}/messages`)).status, 404); // outsider
});

test('bookings: roommates must pick each other, credits for both, one active booking, cancel reverses', async () => {
  const { a, b, gid } = cast;
  const pgs = (await a.c.get('/pgs?sharing=double')).body.pgs;
  assert.ok(pgs.length > 0 && pgs.every((p) => p.isSample));
  const pg = pgs.find((p) => p.bedsLeft >= 2);
  const body = { pgId: pg.id, sharing: 'double', groupId: gid, moveIn: new Date(Date.now() + 864e5 * 30).toISOString().slice(0, 10) };
  assert.equal((await a.c.post('/bookings', body)).body.code, 'NOT_CONFIRMED');
  await a.c.post(`/groups/${gid}/pick`, { userId: b.id, on: true }); // one pick is not enough
  assert.equal((await a.c.post('/bookings', body)).body.code, 'NOT_CONFIRMED');
  await b.c.post(`/groups/${gid}/pick`, { userId: a.id, on: true }); // both picked each other: roommates
  assert.equal((await a.c.get('/groups')).body.groups[0].roommates, true);
  const made = await a.c.post('/bookings', body);
  assert.equal(made.body.status, 'pending_partner');
  assert.equal((await a.c.get('/bookings/credits')).body.balance, 0); // nothing until confirmed
  assert.equal((await a.c.post('/bookings', body)).body.code, 'ACTIVE_BOOKING');
  assert.equal((await b.c.post(`/bookings/${made.body.id}/accept`)).status, 200);
  assert.equal((await a.c.get('/bookings/credits')).body.balance, 100);
  assert.equal((await b.c.get('/bookings/credits')).body.balance, 100);
  assert.equal((await a.c.req('DELETE', `/groups/${gid}`)).body.code, 'HAS_BOOKING');
  assert.equal((await a.c.post(`/bookings/${made.body.id}/cancel`)).status, 200);
  assert.equal((await a.c.get('/bookings/credits')).body.balance, 0);
  assert.equal((await b.c.get('/bookings/credits')).body.balance, 0);
});

test('matching: shared tags explain the score', async () => {
  const d = (await cast.a.c.get(`/matches/${cast.b.id}`)).body.match;
  assert.deepEqual([...d.shared].sort(), ['early_sleeper', 'non_smoker']);
});

test('roommate checklist: needs confirmation, both tick, outsider blocked', async () => {
  const { a, b, c, gid } = cast;
  const items = (await a.c.get(`/groups/${gid}/agreements`)).body.items;
  assert.ok(items.length >= 5 && items.every((i) => !i.mine && !i.theirs));
  assert.equal((await a.c.post(`/groups/${gid}/agreements`, { item: 'bogus', on: true })).status, 400);
  await a.c.post(`/groups/${gid}/agreements`, { item: 'bills', on: true });
  let seenByB = (await b.c.get(`/groups/${gid}/agreements`)).body.items.find((i) => i.id === 'bills');
  assert.deepEqual([seenByB.mine, seenByB.theirs], [false, true]);
  await b.c.post(`/groups/${gid}/agreements`, { item: 'bills', on: true });
  seenByB = (await b.c.get(`/groups/${gid}/agreements`)).body.items.find((i) => i.id === 'bills');
  assert.deepEqual([seenByB.mine, seenByB.theirs], [true, true]);
  await a.c.post(`/groups/${gid}/agreements`, { item: 'bills', on: false });
  assert.equal((await b.c.get(`/groups/${gid}/agreements`)).body.items.find((i) => i.id === 'bills').theirs, false);
  assert.equal((await c.c.get(`/groups/${gid}/agreements`)).status, 404); // outsider
});

test('3-slot limit, then block hides both ways and report works', async () => {
  const s = await makeUser({ tags: ['gym'] }), d = await makeUser(), e = await makeUser();
  const t = [cast.c, d, e];
  for (const x of t) assert.equal((await s.c.post('/requests', { toUserId: x.id })).status, 201);
  assert.equal((await s.c.post('/requests', { toUserId: cast.b.id })).body.code, 'SLOTS_FULL');
  assert.equal((await s.c.post('/safety/block', { userId: cast.c.id })).status, 200);
  assert.ok(!(await s.c.get('/matches')).body.matches.some((m) => m.id === cast.c.id));
  assert.ok(!(await cast.c.c.get('/matches')).body.matches.some((m) => m.id === s.id));
  assert.equal((await cast.c.c.get('/requests')).body.incoming.length, 0); // pending request cancelled
  assert.equal((await s.c.post('/safety/report', { userId: d.id, reason: 'scam', details: 'test' })).status, 201);
});

const DAY = 864e5;
const futureDate = (days) => new Date(Date.now() + DAY * days).toISOString().slice(0, 10);
const myGroup = async (u, gid) => (await u.c.get('/groups')).body.groups.find((g) => g.id === gid);
const openList = async (u) => (await u.c.get('/groups/open')).body.groups;
const pickEachOther = async (gid, a, b) => { await a.c.post(`/groups/${gid}/pick`, { userId: b.id, on: true }); await b.c.post(`/groups/${gid}/pick`, { userId: a.id, on: true }); };
const credits = async (u) => (await u.c.get('/bookings/credits')).body.balance;
/** `owner` asks others[0] for a group of `size`; everyone else asks to join and the owner accepts. Returns the group id. */
async function makeGroup(owner, size, others) {
  assert.equal((await owner.c.post('/requests', { toUserId: others[0].id, groupSize: size })).status, 201);
  const rq = (await others[0].c.get('/requests')).body.incoming.find((q) => q.user.id === owner.id);
  const acc = await others[0].c.post(`/requests/${rq.id}/accept`);
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  for (const x of others.slice(1)) {
    assert.equal((await x.c.post(`/groups/${acc.body.groupId}/join`)).status, 201);
    const jr = (await owner.c.get('/requests')).body.joinIncoming.find((j) => j.user.id === x.id);
    assert.equal((await owner.c.post(`/groups/join-requests/${jr.id}/accept`)).status, 200);
  }
  return acc.body.groupId;
}
const pgWithBeds = async (u, sharing, beds) => (await u.c.get(`/pgs?sharing=${sharing}`)).body.pgs.find((p) => p.bedsLeft >= beds);

test('open groups: seats left, hidden when full, owner approves, leaving reopens a seat, a lone person is dropped', async () => {
  const [o, p, x, y] = [await makeUser(), await makeUser(), await makeUser(), await makeUser()];
  const woman = await makeUser({ gender: 'female' });
  assert.equal((await o.c.post('/requests', { toUserId: p.id, groupSize: 9 })).status, 400); // too big
  assert.equal((await o.c.post('/requests', { toUserId: p.id, groupSize: 3 })).status, 201);
  const rq = (await p.c.get('/requests')).body.incoming[0];
  assert.equal(rq.groupSize, 3);
  const gid = (await p.c.post(`/requests/${rq.id}/accept`)).body.groupId;
  let g = await myGroup(o, gid);
  assert.deepEqual([g.capacity, g.seatsLeft, g.isOwner], [3, 1, true]);

  // A group with a free seat is shown to same-gender students nearby; a full group (cast.gid) is hidden.
  let list = await openList(x);
  assert.equal(list.find((q) => q.id === gid).seatsLeft, 1);
  assert.ok(!list.some((q) => q.id === cast.gid));
  assert.equal((await openList(woman)).length, 0);
  assert.ok(!(await openList(o)).some((q) => q.id === gid)); // members don't see their own group as "open"

  // Two people ask; only the owner can decide.
  assert.equal((await x.c.post(`/groups/${gid}/join`)).status, 201);
  assert.equal((await x.c.post(`/groups/${gid}/join`)).body.code, 'DUPLICATE');
  assert.equal((await y.c.post(`/groups/${gid}/join`)).status, 201);
  assert.equal((await openList(x)).find((q) => q.id === gid).relation.type, 'requested');
  const incoming = (await o.c.get('/requests')).body.joinIncoming;
  assert.equal(incoming.length, 2);
  assert.equal((await p.c.get('/requests')).body.joinIncoming.length, 0);
  const jx = incoming.find((j) => j.user.id === x.id), jy = incoming.find((j) => j.user.id === y.id);
  assert.equal((await p.c.post(`/groups/join-requests/${jx.id}/accept`)).status, 404);
  assert.equal((await o.c.post(`/groups/join-requests/${jx.id}/accept`)).status, 200);

  // Now full: hidden from others, and the other pending ask was declined automatically.
  g = await myGroup(x, gid);
  assert.deepEqual([g.members.length, g.seatsLeft], [3, 0]);
  assert.ok(!(await openList(y)).some((q) => q.id === gid));
  assert.equal((await y.c.get('/requests')).body.joinOutgoing.length, 0);
  assert.equal((await o.c.post(`/groups/join-requests/${jy.id}/accept`)).status, 404);
  assert.equal((await y.c.post(`/groups/${gid}/join`)).status, 404);

  // A member leaves: the seat shows up again.
  assert.equal((await p.c.req('DELETE', `/groups/${gid}`)).body.deleted, false);
  assert.equal((await p.c.get('/groups')).body.groups.some((q) => q.id === gid), false);
  assert.equal((await openList(y)).find((q) => q.id === gid).seatsLeft, 1);
  // y joins; then the owner leaves and the longest-standing member (x) becomes owner.
  assert.equal((await y.c.post(`/groups/${gid}/join`)).status, 201);
  const jy2 = (await o.c.get('/requests')).body.joinIncoming[0];
  assert.equal((await o.c.post(`/groups/join-requests/${jy2.id}/accept`)).status, 200);
  assert.equal((await o.c.req('DELETE', `/groups/${gid}`)).body.deleted, false);
  g = await myGroup(x, gid);
  assert.deepEqual([g.members.length, g.seatsLeft, g.isOwner], [2, 1, true]);
  // x leaves: only y is left, so the group and its chat are deleted and y is an individual again.
  assert.equal((await x.c.req('DELETE', `/groups/${gid}`)).body.deleted, true);
  assert.equal(await myGroup(y, gid), undefined);
  assert.equal((await y.c.get(`/groups/${gid}/messages`)).status, 404);
  assert.equal((await query('SELECT count(*)::int n FROM messages WHERE group_id=$1', [gid])).rows[0].n, 0);
  assert.ok((await y.c.get('/matches')).body.matches.some((m) => m.id === x.id)); // visible as individuals again
});

test('slots: join requests count toward 3, and cancelling frees one', async () => {
  const [o, p, w, a1, a2, a3] = [await makeUser(), await makeUser(), await makeUser(), await makeUser(), await makeUser(), await makeUser()];
  const gid = await makeGroup(o, 3, [p]);
  assert.equal((await w.c.post(`/groups/${gid}/join`)).status, 201);
  assert.equal((await w.c.post('/requests', { toUserId: a1.id })).status, 201);
  assert.equal((await w.c.post('/requests', { toUserId: a2.id })).status, 201);
  assert.equal((await w.c.post('/requests', { toUserId: a3.id })).body.code, 'SLOTS_FULL');
  const jr = (await w.c.get('/requests')).body.joinOutgoing[0];
  assert.equal((await w.c.post(`/groups/join-requests/${jr.id}/cancel`)).status, 200);
  assert.equal((await w.c.post('/requests', { toUserId: a3.id })).status, 201);
});

test('group of 3: picks are per pair; two roommates book together, then all three book a triple', async () => {
  const [u1, u2, u3] = [await makeUser(), await makeUser(), await makeUser()];
  const gid = await makeGroup(u1, 3, [u2, u3]);
  const pg = await pgWithBeds(u1, 'triple', 3), moveIn = futureDate(30);
  const mk = (extra) => ({ pgId: pg.id, sharing: 'double', groupId: gid, moveIn, ...extra });
  await pickEachOther(gid, u1, u2);
  await u3.c.post(`/groups/${gid}/pick`, { userId: u1.id, on: true }); // u3 picked u1, but u1 did not pick u3
  assert.deepEqual((await myGroup(u1, gid)).roommateIds, [u2.id]);
  assert.equal((await u3.c.post(`/groups/${gid}/pick`, { userId: u3.id, on: true })).status, 400);
  assert.equal((await u3.c.post('/bookings', mk({ withUserIds: [u1.id] }))).body.code, 'NOT_CONFIRMED');

  const two = await u1.c.post('/bookings', mk({ withUserIds: [u2.id] })); // 2 of the 3 can book together
  assert.equal(two.body.status, 'pending_partner');
  assert.equal((await u2.c.post(`/bookings/${two.body.id}/accept`)).status, 200);
  assert.deepEqual([await credits(u1), await credits(u2), await credits(u3)], [100, 100, 0]);
  assert.equal((await u1.c.post(`/bookings/${two.body.id}/cancel`)).status, 200);
  assert.deepEqual([await credits(u1), await credits(u2)], [0, 0]);

  await pickEachOther(gid, u1, u3); await pickEachOther(gid, u2, u3);
  assert.equal((await u1.c.post('/bookings', mk({}))).body.code, 'BAD_SHARING'); // three people need a triple
  const three = await u1.c.post('/bookings', mk({ sharing: 'triple' }));
  assert.equal(three.status, 201);
  assert.equal((await u2.c.post(`/bookings/${three.body.id}/accept`)).status, 200);
  assert.equal((await u1.c.get('/bookings')).body.bookings[0].status, 'pending_partner'); // still waiting for u3
  assert.equal(await credits(u1), 0);
  assert.equal((await u3.c.post(`/bookings/${three.body.id}/accept`)).status, 200);
  assert.deepEqual([await credits(u1), await credits(u2), await credits(u3)], [100, 100, 100]);
  assert.equal((await u1.c.post(`/bookings/${three.body.id}/cancel`)).status, 200);
  assert.deepEqual([await credits(u1), await credits(u2), await credits(u3)], [0, 0, 0]);
});

test('block: you leave shared groups; the others keep theirs', async () => {
  const [o, p, x] = [await makeUser(), await makeUser(), await makeUser()];
  const gid = await makeGroup(o, 3, [p, x]);
  assert.equal((await o.c.post('/safety/block', { userId: x.id })).status, 200);
  assert.equal(await myGroup(o, gid), undefined);
  assert.equal((await myGroup(p, gid)).members.length, 2);
  assert.ok(!(await openList(o)).some((q) => q.id === gid));
});

test('cleanup: 5 working days after move-in people leave their groups; lone groups and chats are deleted', async () => {
  const { runCleanup } = await import('../src/cleanup.js');
  const { addWorkingDays } = await import('../src/lib/groups.js');
  assert.equal(addWorkingDays('2026-10-29', 5), '2026-11-05'); // Thursday + 5 working days
  assert.equal(addWorkingDays('2026-10-30', 1), '2026-11-02'); // Friday + 1 = Monday

  const [o, p, x, y, m1, m2] = [await makeUser(), await makeUser(), await makeUser(), await makeUser(), await makeUser(), await makeUser()];
  const big = await makeGroup(o, 4, [p, x, y]), small = await makeGroup(m1, 2, [m2]);
  await pickEachOther(big, o, p); await pickEachOther(small, m1, m2);
  const pg = await pgWithBeds(o, 'double', 4), moveIn = futureDate(3);
  for (const [a, b, gid] of [[o, p, big], [m1, m2, small]]) {
    const bk = await a.c.post('/bookings', { pgId: pg.id, sharing: 'double', groupId: gid, moveIn });
    assert.equal((await b.c.post(`/bookings/${bk.body.id}/accept`)).status, 200);
  }
  await runCleanup(addWorkingDays(moveIn, 4)); // one day too early
  assert.equal((await myGroup(o, big)).members.length, 4);
  await runCleanup(addWorkingDays(moveIn, 5));
  assert.equal(await myGroup(o, big), undefined); assert.equal(await myGroup(p, big), undefined);
  const gx = await myGroup(x, big); // the two who did not book stay, with open seats
  assert.deepEqual([gx.members.length, gx.seatsLeft, gx.isOwner], [2, 2, true]);
  assert.equal(await myGroup(m1, small), undefined); // both moved in: group deleted
  assert.equal((await query('SELECT count(*)::int n FROM messages WHERE group_id=$1', [small])).rows[0].n, 0); // chat deleted too
});

test('account: export and delete', async () => {
  const exp = await cast.a.c.get('/account/export');
  assert.equal(exp.body.account.email, cast.a.email);
  assert.equal((await cast.a.c.req('DELETE', '/account', { confirm: 'nope' })).status, 400);
  assert.equal((await cast.a.c.req('DELETE', '/account', { confirm: 'DELETE' })).status, 200);
  assert.equal((await cast.a.c.get('/auth/me')).body.user, null);
  assert.equal((await cast.b.c.get('/groups')).body.groups.length, 0); // group removed for the partner too
});

test('move-in dates: validated, and only overlapping windows are listed with their exact date', async () => {
  const me = await makeUser({ dates: { moveInFrom: plusDays(100), moveInTo: plusDays(130), moveInDate: plusDays(110) }, tags: ['early_sleeper'] });
  const put = (dates) => me.c.req('PUT', '/profile', { company: 'TCS', hubId: 'blr-whitefield', maxDistanceKm: 10, tags: [], priorities: [], ...dates });
  assert.equal((await put({ moveInFrom: plusDays(100), moveInTo: plusDays(90), moveInDate: plusDays(95) })).status, 400); // window backwards
  assert.equal((await put({ moveInFrom: plusDays(100), moveInTo: plusDays(130), moveInDate: plusDays(140) })).status, 400); // exact date outside window
  assert.equal((await put({ moveInFrom: '2020-01-01', moveInTo: '2020-02-01', moveInDate: '2020-01-15' })).status, 400); // in the past
  assert.equal((await put({ moveInFrom: 'nope', moveInTo: plusDays(130), moveInDate: plusDays(110) })).status, 400);
  assert.equal((await put({ moveInFrom: plusDays(100), moveInTo: plusDays(130), moveInDate: plusDays(110) })).status, 200);
  const inside = await makeUser({ dates: { moveInFrom: plusDays(125), moveInTo: plusDays(160), moveInDate: plusDays(150) } }); // overlaps on days 125-130
  const outside = await makeUser({ dates: { moveInFrom: plusDays(131), moveInTo: plusDays(170), moveInDate: plusDays(140) } }); // starts the day after
  const ids = (await me.c.get('/matches')).body.matches.map((m) => m.id);
  assert.ok(ids.includes(inside.id)); assert.ok(!ids.includes(outside.id));
  const row = (await me.c.get('/matches')).body.matches.find((m) => m.id === inside.id);
  assert.equal(row.moveInDate, plusDays(150));
  const d = (await me.c.get('/matches/' + inside.id)).body.match;
  assert.deepEqual([d.moveInFrom, d.moveInTo, d.moveInDate], [plusDays(125), plusDays(160), plusDays(150)]);
  assert.equal((await me.c.get('/matches/' + outside.id)).status, 404); // not visible either
  assert.equal((await outside.c.get('/matches')).body.matches.some((m) => m.id === me.id), false); // and symmetric
  const old = await makeUser({ profile: false }); // a profile without dates cannot use the app yet
  await query("INSERT INTO profiles (user_id,company,hub_id,max_distance_km) VALUES ($1,'TCS','blr-whitefield',10)", [old.id]);
  assert.equal((await old.c.get('/matches')).body.code, 'NO_PROFILE');
});
