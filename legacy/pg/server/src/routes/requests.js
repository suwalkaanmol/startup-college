// Roommate requests. Slots: max 3 = groups you are in + pending requests you sent.
import { Router } from 'express';
import { z } from 'zod';
import { tx, query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';
import { MAX_SLOTS, MAX_GROUP_SIZE, lockUsers, slotsUsed, isBlocked, addSystemMessage } from '../lib/social.js';
import { publish } from '../events.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireProfile } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth, requireProfile);
const slotsFull = () => new HttpError(409, 'SLOTS_FULL', `You can be in up to ${MAX_SLOTS} groups (including pending requests) at once. Leave a group or cancel a request first.`);

r.get('/', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT q.id, q.from_user, q.to_user, q.group_size, q.created_at, u.id AS other_id, u.name, p.company
       FROM roommate_requests q JOIN users u ON u.id = CASE WHEN q.from_user=$1 THEN q.to_user ELSE q.from_user END
       LEFT JOIN profiles p ON p.user_id=u.id
      WHERE q.status='pending' AND (q.from_user=$1 OR q.to_user=$1) ORDER BY q.created_at DESC`, [req.user.id]);
  const shape = (q) => ({ id: q.id, user: { id: q.other_id, name: q.name, company: q.company }, groupSize: q.group_size, createdAt: q.created_at });
  // Join requests: people asking to enter a group I own (incoming), and groups I asked to join (outgoing).
  const jr = (await query(
    `SELECT j.id, j.group_id, j.user_id, u.name, p.company, g.owner_id, g.capacity,
            (SELECT count(*) FROM group_members WHERE group_id=g.id)::int AS n,
            (SELECT json_agg(x.name ORDER BY m.joined_at) FROM group_members m JOIN users x ON x.id=m.user_id WHERE m.group_id=g.id) AS member_names
       FROM group_join_requests j JOIN groups g ON g.id=j.group_id JOIN users u ON u.id=j.user_id LEFT JOIN profiles p ON p.user_id=u.id
      WHERE j.status='pending' AND (j.user_id=$1 OR g.owner_id=$1) ORDER BY j.created_at DESC`, [req.user.id])).rows;
  const joinShape = (j) => ({ id: j.id, groupId: j.group_id, user: { id: j.user_id, name: j.name, company: j.company }, memberNames: j.member_names, seatsLeft: j.capacity - j.n, createdAt: j.created_at });
  res.json({
    incoming: rows.filter((q) => q.to_user === req.user.id).map(shape),
    outgoing: rows.filter((q) => q.from_user === req.user.id).map(shape),
    joinIncoming: jr.filter((j) => j.owner_id === req.user.id).map(joinShape),
    joinOutgoing: jr.filter((j) => j.user_id === req.user.id).map(joinShape),
    slots: { used: await slotsUsed({ query }, req.user.id), max: MAX_SLOTS },
  });
}));

r.post('/', validate(z.object({ toUserId: z.string().uuid('Invalid student.'), groupSize: z.number().int().min(2, 'A group has at least 2 people.').max(MAX_GROUP_SIZE, `A group can have up to ${MAX_GROUP_SIZE} people.`).default(2) })), wrap(async (req, res) => {
  const me = req.user, to = req.body.toUserId, size = req.body.groupSize;
  const created = await tx(async (c) => {
    await lockUsers(c, me.id);
    const t = (await c.query('SELECT u.id, u.gender FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.email_verified_at IS NOT NULL', [to])).rows[0];
    if (!t || t.id === me.id || t.gender !== me.gender || await isBlocked(c, me.id, to)) throw new HttpError(404, 'NOT_FOUND', 'This student is not available.');
    const open = (await c.query("SELECT from_user FROM roommate_requests WHERE status='pending' AND LEAST(from_user,to_user)=LEAST($1::uuid,$2::uuid) AND GREATEST(from_user,to_user)=GREATEST($1::uuid,$2::uuid)", [me.id, to])).rows[0];
    if (open) throw new HttpError(409, open.from_user === me.id ? 'DUPLICATE' : 'INCOMING',
      open.from_user === me.id ? 'You already sent this student a request.' : 'This student already sent you a request. Accept it from Requests.');
    if ((await c.query('SELECT 1 FROM group_members a JOIN group_members b USING (group_id) WHERE a.user_id=$1 AND b.user_id=$2', [me.id, to])).rowCount)
      throw new HttpError(409, 'IN_GROUP', 'You already have a group with this student.');
    if (await slotsUsed(c, me.id) >= MAX_SLOTS) throw slotsFull();
    try {
      return (await c.query('INSERT INTO roommate_requests (from_user,to_user,group_size) VALUES ($1,$2,$3) RETURNING id', [me.id, to, size])).rows[0];
    } catch (e) { if (e.code === '23505') throw new HttpError(409, 'DUPLICATE', 'A request between you two is already pending.'); throw e; }
  });
  await publish('request', [me.id, to]);
  res.status(201).json({ id: created.id });
}));

r.post('/:id/accept', wrap(async (req, res) => {
  const me = req.user;
  const out = await tx(async (c) => {
    const q = (await c.query("SELECT * FROM roommate_requests WHERE id=$1 AND to_user=$2 AND status='pending'", [req.params.id, me.id])).rows[0];
    if (!q) throw new HttpError(404, 'NOT_FOUND', 'This request is no longer available.');
    await lockUsers(c, me.id, q.from_user);
    if (await isBlocked(c, me.id, q.from_user)) throw new HttpError(404, 'NOT_FOUND', 'This request is no longer available.');
    if (await slotsUsed(c, me.id) >= MAX_SLOTS) throw slotsFull();
    await c.query("UPDATE roommate_requests SET status='accepted', responded_at=now() WHERE id=$1", [q.id]);
    const gid = (await c.query('INSERT INTO groups (capacity, owner_id) VALUES ($1,$2) RETURNING id', [q.group_size, q.from_user])).rows[0].id;
    await c.query("INSERT INTO group_members (group_id,user_id,joined_at) VALUES ($1,$2,now()-interval '1 second'),($1,$3,now())", [gid, q.from_user, me.id]); // requester first, so they stay owner
    const seats = q.group_size - 2;
    await addSystemMessage(c, gid, `Request accepted. Say hello and see if you are compatible roommates.${seats > 0 ? ` This group has ${seats} ${seats === 1 ? 'seat' : 'seats'} open for other students.` : ''}`);
    return { groupId: gid, other: q.from_user };
  });
  await publish('group', [me.id, out.other]);
  res.json({ groupId: out.groupId });
}));

const close = (field, status) => wrap(async (req, res) => {
  const { rows } = await query(`UPDATE roommate_requests SET status='${status}', responded_at=now() WHERE id=$1 AND ${field}=$2 AND status='pending' RETURNING from_user, to_user`, [req.params.id, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'This request is no longer available.');
  await publish('request', [rows[0].from_user, rows[0].to_user]);
  res.json({ ok: true });
});
r.post('/:id/decline', close('to_user', 'declined'));
r.post('/:id/cancel', close('from_user', 'cancelled'));

export default r;
