// Block and report.
import { Router } from 'express';
import { z } from 'zod';
import { tx, query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';
import { sharedActiveBooking } from '../lib/social.js';
import { leaveGroup } from '../lib/groups.js';
import { publish } from '../events.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);
const target = z.object({ userId: z.string().uuid('Invalid student.') });

r.post('/block', validate(target), wrap(async (req, res) => {
  const me = req.user.id, other = req.body.userId;
  if (me === other) throw new HttpError(400, 'SELF', 'You cannot block yourself.');
  const affected = await tx(async (c) => {
    const shared = (await c.query('SELECT a.group_id FROM group_members a JOIN group_members b USING (group_id) WHERE a.user_id=$1 AND b.user_id=$2', [me, other])).rows;
    if (await sharedActiveBooking(c, me, other)) throw new HttpError(409, 'HAS_BOOKING', 'Cancel your shared booking before blocking this student.');
    await c.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [me, other]);
    await c.query("UPDATE roommate_requests SET status='cancelled', responded_at=now() WHERE status='pending' AND ((from_user=$1 AND to_user=$2) OR (from_user=$2 AND to_user=$1))", [me, other]);
    // Join requests between the two (into each other's groups) are cancelled too.
    await c.query(`UPDATE group_join_requests j SET status='cancelled', responded_at=now() WHERE j.status='pending' AND
                   ((j.user_id=$1 AND j.group_id IN (SELECT group_id FROM group_members WHERE user_id=$2)) OR (j.user_id=$2 AND j.group_id IN (SELECT group_id FROM group_members WHERE user_id=$1)))`, [me, other]);
    // You leave every group you share with them (a group left with fewer than 2 people is deleted).
    const ids = new Set([other]);
    for (const g of shared) (await leaveGroup(c, g.group_id, me, 'A member left the group.')).forEach((x) => ids.add(x));
    return [...ids];
  });
  await publish('group', [...new Set([me, ...affected])]);
  await publish('request', [me, other]);
  res.json({ ok: true });
}));

r.post('/report', validate(target.extend({
  reason: z.enum(['fake_profile', 'harassment', 'inappropriate', 'scam', 'other'], { errorMap: () => ({ message: 'Choose a reason.' }) }),
  details: z.string().trim().max(1000, 'Details can be up to 1000 characters.').optional(),
})), wrap(async (req, res) => {
  if (req.body.userId === req.user.id) throw new HttpError(400, 'SELF', 'You cannot report yourself.');
  if (!(await query('SELECT 1 FROM users WHERE id=$1', [req.body.userId])).rowCount) throw new HttpError(404, 'NOT_FOUND', 'Student not found.');
  await query('INSERT INTO reports (reporter_id, reported_id, reason, details) VALUES ($1,$2,$3,$4)', [req.user.id, req.body.userId, req.body.reason, req.body.details || null]);
  res.status(201).json({ ok: true });
}));

export default r;
