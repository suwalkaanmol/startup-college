// Data rights: export everything, delete the account.
import { Router } from 'express';
import { z } from 'zod';
import { COOKIE, requireAuth } from '../middleware/auth.js';
import { tx, query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { cancelBooking } from './bookings.js';
import { leaveAllGroups } from '../lib/groups.js';
import { publish } from '../events.js';

const r = Router();
r.use(requireAuth);

r.get('/export', wrap(async (req, res) => {
  const id = req.user.id, q = async (sql) => (await query(sql, [id])).rows;
  const data = {
    exportedAt: new Date().toISOString(),
    account: (await q('SELECT id,reg_no,email,name,gender,email_verified_at,terms_version,terms_accepted_at,created_at FROM users WHERE id=$1'))[0],
    profile: (await q('SELECT * FROM profiles WHERE user_id=$1'))[0] || null,
    requests: await q('SELECT * FROM roommate_requests WHERE from_user=$1 OR to_user=$1'),
    groups: await q('SELECT g.id, g.capacity, g.created_at, gm.joined_at FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=$1'),
    roommatePicks: await q('SELECT * FROM roommate_picks WHERE from_user=$1 OR to_user=$1'),
    joinRequests: await q('SELECT * FROM group_join_requests WHERE user_id=$1'),
    messages: await q('SELECT m.* FROM messages m JOIN group_members gm ON gm.group_id=m.group_id WHERE gm.user_id=$1 ORDER BY m.id'),
    blocks: await q('SELECT * FROM blocks WHERE blocker_id=$1'),
    reportsFiled: await q('SELECT * FROM reports WHERE reporter_id=$1'),
    bookings: await q('SELECT b.* FROM bookings b JOIN booking_members m ON m.booking_id=b.id WHERE m.user_id=$1'),
    credits: await q('SELECT * FROM credit_ledger WHERE user_id=$1 ORDER BY id'),
  };
  res.set('Content-Disposition', 'attachment; filename="placemate-my-data.json"').json(data);
}));

r.delete('/', validate(z.object({ confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm.' }) }) })), wrap(async (req, res) => {
  const notify = await tx(async (c) => {
    const others = new Set();
    const active = (await c.query("SELECT b.id FROM bookings b JOIN booking_members m ON m.booking_id=b.id WHERE m.user_id=$1 AND b.status IN ('pending_partner','confirmed')", [req.user.id])).rows;
    // Cancelling reverses credits for everyone on the booking, partners included.
    for (const b of active) (await cancelBooking(c, b.id, 'This booking was cancelled because a member deleted their account.')).forEach((x) => others.add(x));
    // Leave every group: other members keep theirs, and a group left with fewer than 2 people is deleted with its chat.
    (await leaveAllGroups(c, req.user.id, 'A member deleted their account and left the group.')).forEach((x) => others.add(x));
    others.delete(req.user.id);
    await c.query('DELETE FROM users WHERE id=$1', [req.user.id]); // cascades all remaining personal data
    return [...others];
  });
  if (notify.length) { await publish('group', notify); await publish('booking', notify); await publish('request', notify); }
  res.clearCookie(COOKIE, { path: '/' }).json({ ok: true });
}));

export default r;
