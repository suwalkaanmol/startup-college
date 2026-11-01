// Groups: private chat for 2 to 6 students, open seats others can ask to join, roommate picks, leave.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { tx, query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';
import { haversineKm } from '../lib/geo.js';
import { matchScore } from '../lib/matching.js';
import { MAX_SLOTS, lockUsers, slotsUsed, isBlocked, sharedActiveBooking, userHasGroupBooking, addSystemMessage } from '../lib/social.js';
import { leaveGroup, roommatesOf } from '../lib/groups.js';
import { publish } from '../events.js';
import { AGREEMENT_ITEMS, AGREEMENT_IDS } from '../lib/agreements.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireProfile } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth, requireProfile);

const UUID = /^[0-9a-f-]{36}$/i;
const uuid = (req, key = 'id') => { if (!UUID.test(req.params[key])) throw new HttpError(404, 'NOT_FOUND', 'Not found.'); return req.params[key]; };
const first = (name) => name.split(' ')[0];
const slotsFull = () => new HttpError(409, 'SLOTS_FULL', `You can be in up to ${MAX_SLOTS} groups (including pending requests) at once. Leave a group or cancel a request first.`);

/** Members of a group, or 404 if the caller isn't one (outsiders learn nothing). */
async function members(c, groupId, userId) {
  const rows = (await c.query('SELECT gm.user_id, u.name FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 ORDER BY gm.joined_at, gm.user_id', [groupId])).rows;
  if (!rows.some((m) => m.user_id === userId)) throw new HttpError(404, 'NOT_FOUND', 'Group not found.');
  return rows;
}

/* ---------- my groups ---------- */

r.get('/', wrap(async (req, res) => {
  const me = req.user.id;
  const { rows } = await query(
    `SELECT g.id, g.capacity, g.owner_id,
            (SELECT count(*) FROM messages x WHERE x.group_id=g.id AND x.created_at>m.last_read_at AND x.sender_id IS DISTINCT FROM $1)::int AS unread,
            (SELECT body FROM messages x WHERE x.group_id=g.id ORDER BY x.id DESC LIMIT 1) AS last_message,
            EXISTS (SELECT 1 FROM bookings b JOIN booking_members bm ON bm.booking_id=b.id AND bm.user_id=$1
                     WHERE b.group_id=g.id AND b.status IN ('pending_partner','confirmed')) AS has_booking,
            (SELECT json_agg(json_build_object('id',u.id,'name',u.name,'company',p.company) ORDER BY gm.joined_at, u.name)
               FROM group_members gm JOIN users u ON u.id=gm.user_id LEFT JOIN profiles p ON p.user_id=u.id WHERE gm.group_id=g.id) AS members
       FROM groups g JOIN group_members m ON m.group_id=g.id AND m.user_id=$1
      ORDER BY COALESCE((SELECT max(created_at) FROM messages x WHERE x.group_id=g.id), g.created_at) DESC`, [me]);
  const picks = rows.length ? (await query('SELECT group_id, from_user, to_user FROM roommate_picks WHERE group_id = ANY($1::uuid[])', [rows.map((g) => g.id)])).rows : [];
  const has = (gid, a, b) => picks.some((p) => p.group_id === gid && p.from_user === a && p.to_user === b);
  res.json({ groups: rows.map((g) => {
    const ms = g.members.map((m) => ({ ...m, isMe: m.id === me, isOwner: m.id === g.owner_id,
      pickedByMe: has(g.id, me, m.id), pickedMe: has(g.id, m.id, me), roommate: m.id !== me && has(g.id, me, m.id) && has(g.id, m.id, me) }));
    return { id: g.id, capacity: g.capacity, seatsLeft: Math.max(0, g.capacity - ms.length), isOwner: g.owner_id === me, members: ms,
      roommateIds: ms.filter((m) => m.roommate).map((m) => m.id), roommates: ms.some((m) => m.roommate),
      unread: g.unread, lastMessage: g.last_message, hasBooking: g.has_booking };
  }) });
}));

/* ---------- open groups (seats left) ---------- */

/** Groups with free seats this student may see. Full groups are never returned. Optionally just one group. */
async function openGroups(me, onlyId = null) {
  const mine = (await query('SELECT p.*, h.lat, h.lng FROM profiles p JOIN hubs h ON h.id=p.hub_id WHERE p.user_id=$1', [me.id])).rows[0];
  const gs = (await query(
    `SELECT g.id, g.capacity FROM groups g
      WHERE ($2::uuid IS NULL OR g.id=$2)
        AND (SELECT count(*) FROM group_members WHERE group_id=g.id) < g.capacity
        AND NOT EXISTS (SELECT 1 FROM group_members x WHERE x.group_id=g.id AND x.user_id=$1)
        AND NOT EXISTS (SELECT 1 FROM group_members x JOIN users u ON u.id=x.user_id WHERE x.group_id=g.id AND u.gender<>$3)
        AND NOT EXISTS (SELECT 1 FROM group_members x JOIN blocks b ON (b.blocker_id=$1 AND b.blocked_id=x.user_id) OR (b.blocker_id=x.user_id AND b.blocked_id=$1) WHERE x.group_id=g.id)`,
    [me.id, onlyId, me.gender])).rows;
  if (!gs.length) return [];
  const ms = (await query(
    `SELECT gm.group_id, u.id, u.name, p.company, p.tags, p.priorities, p.move_in_from, p.move_in_to, p.move_in_date, h.area, h.city, h.lat, h.lng
       FROM group_members gm JOIN users u ON u.id=gm.user_id JOIN profiles p ON p.user_id=u.id JOIN hubs h ON h.id=p.hub_id
      WHERE gm.group_id = ANY($1::uuid[]) ORDER BY gm.joined_at, u.name`, [gs.map((g) => g.id)])).rows;
  const asked = new Map((await query("SELECT id, group_id FROM group_join_requests WHERE user_id=$1 AND status='pending'", [me.id])).rows.map((x) => [x.group_id, x.id]));
  const overlap = (m) => !!(mine.move_in_from && m.move_in_from && mine.move_in_from <= m.move_in_to && m.move_in_from <= mine.move_in_to);
  return gs.map((g) => {
    const mem = ms.filter((m) => m.group_id === g.id);
    const dist = Math.min(...mem.map((m) => haversineKm(mine.lat, mine.lng, m.lat, m.lng)));
    const scores = mem.map((m) => matchScore(mine, m)).filter((s) => s !== null);
    return { id: g.id, capacity: g.capacity, seatsLeft: g.capacity - mem.length, distanceKm: Math.round(dist * 10) / 10,
      score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      members: mem.map((m) => ({ id: m.id, name: m.name, company: m.company, office: `${m.area}, ${m.city}`, moveInDate: m.move_in_date })), _fits: mem.some(overlap),
      relation: asked.has(g.id) ? { type: 'requested', requestId: asked.get(g.id) } : { type: 'none' }, _maxKm: mine.max_distance_km };
  }).filter((g) => g.members.length && g.distanceKm <= g._maxKm && g._fits).map(({ _maxKm, _fits, ...g }) => g)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.distanceKm - b.distanceKm);
}

r.get('/open', wrap(async (req, res) => res.json({ groups: await openGroups(req.user) })));

/** Ask to join a group that still has a free seat. The group owner decides. */
r.post('/:id/join', wrap(async (req, res) => {
  const gid = uuid(req), me = req.user;
  if (!(await openGroups(me, gid)).length) throw new HttpError(404, 'NOT_FOUND', 'This group is not available.');
  const owner = await tx(async (c) => {
    await lockUsers(c, me.id);
    const g = (await c.query('SELECT owner_id, capacity FROM groups WHERE id=$1 FOR UPDATE', [gid])).rows[0];
    if (!g) throw new HttpError(404, 'NOT_FOUND', 'This group is not available.');
    const n = (await c.query('SELECT count(*)::int n FROM group_members WHERE group_id=$1', [gid])).rows[0].n;
    if (n >= g.capacity) throw new HttpError(409, 'GROUP_FULL', 'This group is already full.');
    if (await slotsUsed(c, me.id) >= MAX_SLOTS) throw slotsFull();
    try { await c.query('INSERT INTO group_join_requests (group_id, user_id) VALUES ($1,$2)', [gid, me.id]); }
    catch (e) { if (e.code === '23505') throw new HttpError(409, 'DUPLICATE', 'You already asked to join this group.'); throw e; }
    return g.owner_id;
  });
  await publish('request', [me.id, owner]);
  res.status(201).json({ ok: true });
}));

/** Owner decides on a join request. */
r.post('/join-requests/:rid/accept', wrap(async (req, res) => {
  const rid = uuid(req, 'rid'), me = req.user;
  const out = await tx(async (c) => {
    const jr = (await c.query("SELECT j.*, g.owner_id, g.capacity FROM group_join_requests j JOIN groups g ON g.id=j.group_id WHERE j.id=$1 AND j.status='pending'", [rid])).rows[0];
    if (!jr || jr.owner_id !== me.id) throw new HttpError(404, 'NOT_FOUND', 'This request is no longer available.');
    await lockUsers(c, me.id, jr.user_id); // same lock order as /join: users first, then the group row
    await c.query('SELECT 1 FROM groups WHERE id=$1 FOR UPDATE', [jr.group_id]);
    const ms = (await c.query('SELECT user_id FROM group_members WHERE group_id=$1', [jr.group_id])).rows.map((m) => m.user_id);
    if (ms.length >= jr.capacity) throw new HttpError(409, 'GROUP_FULL', 'This group is already full.');
    for (const m of ms) if (await isBlocked(c, jr.user_id, m)) throw new HttpError(404, 'NOT_FOUND', 'This request is no longer available.');
    await c.query('INSERT INTO group_members (group_id, user_id) VALUES ($1,$2)', [jr.group_id, jr.user_id]);
    await c.query("UPDATE group_join_requests SET status='accepted', responded_at=now() WHERE id=$1", [rid]);
    const name = (await c.query('SELECT name FROM users WHERE id=$1', [jr.user_id])).rows[0].name;
    const left = jr.capacity - ms.length - 1;
    await addSystemMessage(c, jr.group_id, `${name} joined the group. ${left > 0 ? `${left} ${left === 1 ? 'seat is' : 'seats are'} open.` : 'The group is now full.'}`);
    let declined = [];
    if (left === 0) declined = (await c.query("UPDATE group_join_requests SET status='declined', responded_at=now() WHERE group_id=$1 AND status='pending' RETURNING user_id", [jr.group_id])).rows.map((x) => x.user_id);
    return { groupId: jr.group_id, ids: [...ms, jr.user_id, ...declined] };
  });
  await publish('group', out.ids); await publish('request', out.ids);
  res.json({ groupId: out.groupId });
}));

const closeJoin = (field, status) => wrap(async (req, res) => {
  const rid = uuid(req, 'rid');
  const col = field === 'owner' ? 'g.owner_id' : 'j.user_id';
  const { rows } = await query(
    `UPDATE group_join_requests j SET status='${status}', responded_at=now() FROM groups g
      WHERE j.id=$1 AND j.group_id=g.id AND ${col}=$2 AND j.status='pending' RETURNING j.user_id, g.owner_id`, [rid, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'This request is no longer available.');
  await publish('request', [rows[0].user_id, rows[0].owner_id]);
  res.json({ ok: true });
});
r.post('/join-requests/:rid/decline', closeJoin('owner', 'declined'));
r.post('/join-requests/:rid/cancel', closeJoin('requester', 'cancelled'));

/* ---------- chat ---------- */

r.get('/:id/messages', wrap(async (req, res) => {
  const id = uuid(req), after = Number(req.query.after) || 0;
  await members({ query }, id, req.user.id);
  const { rows } = await query('SELECT m.id, m.sender_id, u.name AS sender_name, m.body, m.created_at FROM messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.group_id=$1 AND m.id>$2 ORDER BY m.id ASC LIMIT 200', [id, after]);
  await query('UPDATE group_members SET last_read_at=now() WHERE group_id=$1 AND user_id=$2', [id, req.user.id]); // opening the chat marks it read
  res.json({ messages: rows.map((m) => ({ id: Number(m.id), senderId: m.sender_id, senderName: m.sender_name, body: m.body, createdAt: m.created_at, system: m.sender_id === null })) });
}));

const chatLimit = rateLimit({ windowMs: 60e3, limit: 40, keyGenerator: (req) => req.user.id, skip: () => config.isTest,
  message: { error: 'You are sending messages too fast.', code: 'RATE_LIMIT' } });

r.post('/:id/messages', chatLimit, validate(z.object({ body: z.string().trim().min(1, 'Type a message.').max(2000, 'Messages can be up to 2000 characters.') })), wrap(async (req, res) => {
  const id = uuid(req);
  const ms = await members({ query }, id, req.user.id);
  const { rows } = await query('INSERT INTO messages (group_id,sender_id,body) VALUES ($1,$2,$3) RETURNING id', [id, req.user.id, req.body.body]);
  await publish('message', ms.map((m) => m.user_id));
  res.status(201).json({ id: Number(rows[0].id) });
}));

r.post('/:id/read', wrap(async (req, res) => {
  const id = uuid(req);
  await members({ query }, id, req.user.id);
  await query('UPDATE group_members SET last_read_at=now() WHERE group_id=$1 AND user_id=$2', [id, req.user.id]);
  res.json({ ok: true });
}));

/* ---------- roommate picks ---------- */

/** Pick (or un-pick) a group member as your roommate. Two people are roommates when each picked the other. */
r.post('/:id/pick', validate(z.object({ userId: z.string().uuid('Invalid student.'), on: z.boolean() })), wrap(async (req, res) => {
  const id = uuid(req), me = req.user, { userId, on } = req.body;
  const ids = await tx(async (c) => {
    const ms = await members(c, id, me.id);
    const target = ms.find((m) => m.user_id === userId);
    if (!target || userId === me.id) throw new HttpError(400, 'BAD_PICK', 'Choose another member of this group.');
    const wasMutual = (await roommatesOf(c, id, me.id)).includes(userId);
    if (on) {
      await c.query('INSERT INTO roommate_picks (group_id, from_user, to_user) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, me.id, userId]);
      if ((await roommatesOf(c, id, me.id)).includes(userId) && !wasMutual) await addSystemMessage(c, id, `${me.name} and ${target.name} are now roommates. They can book a PG together.`);
    } else {
      if (wasMutual && await sharedActiveBooking(c, me.id, userId)) throw new HttpError(409, 'HAS_BOOKING', 'Cancel your shared booking before changing this.');
      await c.query('DELETE FROM roommate_picks WHERE group_id=$1 AND from_user=$2 AND to_user=$3', [id, me.id, userId]);
      if (wasMutual) await addSystemMessage(c, id, `${me.name} and ${target.name} are no longer roommates.`);
    }
    return ms.map((m) => m.user_id);
  });
  await publish('group', ids);
  res.json({ ok: true });
}));

/* ---------- roommate checklist (for people who picked each other) ---------- */

async function checklistPeople(c, id, me) {
  const ms = await members(c, id, me.id);
  const ids = await roommatesOf(c, id, me.id);
  if (!ids.length) throw new HttpError(409, 'NOT_CONFIRMED', 'Pick a roommate, and wait for them to pick you back, to use the checklist.');
  return { ms, ids };
}

r.get('/:id/agreements', wrap(async (req, res) => {
  const id = uuid(req), { ms, ids } = await checklistPeople({ query }, id, req.user);
  const rows = (await query('SELECT user_id, item FROM group_agreements WHERE group_id=$1', [id])).rows;
  const ticked = (u, item) => rows.some((x) => x.user_id === u && x.item === item);
  res.json({ otherName: ms.filter((m) => ids.includes(m.user_id)).map((m) => first(m.name)).join(' & '),
    items: AGREEMENT_ITEMS.map((i) => ({ ...i, mine: ticked(req.user.id, i.id), theirs: ids.every((u) => ticked(u, i.id)) })) });
}));

r.post('/:id/agreements', validate(z.object({ item: z.enum(AGREEMENT_IDS), on: z.boolean() })), wrap(async (req, res) => {
  const id = uuid(req), { ms } = await checklistPeople({ query }, id, req.user);
  if (req.body.on) await query('INSERT INTO group_agreements (group_id,user_id,item) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, req.user.id, req.body.item]);
  else await query('DELETE FROM group_agreements WHERE group_id=$1 AND user_id=$2 AND item=$3', [id, req.user.id, req.body.item]);
  await publish('group', ms.map((m) => m.user_id));
  res.json({ ok: true });
}));

/* ---------- leave ---------- */

/** Leave a group. A freed seat shows up for other students. When fewer than 2 people remain the group and its chat are deleted. */
r.delete('/:id', wrap(async (req, res) => {
  const id = uuid(req);
  const out = await tx(async (c) => {
    await members(c, id, req.user.id);
    if (await userHasGroupBooking(c, id, req.user.id)) throw new HttpError(409, 'HAS_BOOKING', 'Cancel your booking before leaving this group.');
    const ids = await leaveGroup(c, id, req.user.id);
    const deleted = (await c.query('SELECT 1 FROM groups WHERE id=$1', [id])).rowCount === 0;
    return { ids, deleted };
  });
  await publish('group', out.ids);
  res.json({ ok: true, deleted: out.deleted });
}));

export default r;
