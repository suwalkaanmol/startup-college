// Ranked roommate candidates: same gender, verified, not blocked, office within viewer's max distance.
import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';
import { haversineKm } from '../lib/geo.js';
import { matchScore } from '../lib/matching.js';
import { requireAuth, requireProfile } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth, requireProfile);

/** Two students are only listed together when their move-in windows overlap. */
const overlaps = (a, b) => !!(a.move_in_from && b.move_in_from && a.move_in_from <= b.move_in_to && b.move_in_from <= a.move_in_to);
const dayGap = (a, b) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5;

async function candidates(me) {
  const mine = (await query('SELECT p.*, h.lat, h.lng FROM profiles p JOIN hubs h ON h.id=p.hub_id WHERE p.user_id=$1', [me.id])).rows[0];
  const { rows } = await query(
    `SELECT u.id, u.name, p.company, p.tags, p.priorities, p.bio, p.budget, p.move_in_from, p.move_in_to, p.move_in_date, h.city, h.area, h.lat, h.lng
       FROM users u JOIN profiles p ON p.user_id=u.id JOIN hubs h ON h.id=p.hub_id
      WHERE u.gender=$1 AND u.email_verified_at IS NOT NULL AND u.id<>$2
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$2))`,
    [me.gender, me.id]);
  const rel = new Map();
  for (const q of (await query("SELECT id,from_user,to_user FROM roommate_requests WHERE status='pending' AND (from_user=$1 OR to_user=$1)", [me.id])).rows)
    rel.set(q.from_user === me.id ? q.to_user : q.from_user, { type: q.from_user === me.id ? 'outgoing' : 'incoming', requestId: q.id });
  for (const g of (await query('SELECT b.user_id, a.group_id FROM group_members a JOIN group_members b ON b.group_id=a.group_id AND b.user_id<>a.user_id WHERE a.user_id=$1', [me.id])).rows)
    rel.set(g.user_id, { type: 'group', groupId: g.group_id });
  return rows
    .map((c) => ({ ...c, distanceKm: haversineKm(mine.lat, mine.lng, c.lat, c.lng), score: matchScore(mine, c), relation: rel.get(c.id) || { type: 'none' } }))
    .filter((c) => c.distanceKm <= mine.max_distance_km)
    .filter((c) => c.relation.type !== 'none' || overlaps(mine, c)) // people you already deal with stay visible
    .map((c) => ({ ...c, distanceKm: Math.round(c.distanceKm * 10) / 10, sameCompany: c.company.toLowerCase() === mine.company.toLowerCase(),
      shared: c.tags.filter((t) => mine.tags.includes(t)), dateGap: dayGap(c.move_in_date || mine.move_in_date, mine.move_in_date) }));
}

const list = (c) => ({ id: c.id, name: c.name, score: c.score, distanceKm: c.distanceKm, sameCompany: c.sameCompany, relation: c.relation, moveInDate: c.move_in_date });
const detail = (c) => ({ ...list(c), company: c.company, office: `${c.area}, ${c.city}`, bio: c.bio, budget: c.budget, moveInFrom: c.move_in_from, moveInTo: c.move_in_to, tags: c.tags, priorities: c.priorities, shared: c.shared });

r.get('/', wrap(async (req, res) => {
  let rows = await candidates(req.user);
  if (req.query.sameCompany === '1') rows = rows.filter((c) => c.sameCompany);
  const byDist = (a, b) => a.distanceKm - b.distanceKm;
  rows.sort(req.query.sort === 'nearest' || rows.every((c) => c.score === null) ? byDist : (a, b) => b.score - a.score || a.dateGap - b.dateGap || byDist(a, b));
  res.json({ matches: rows.map(list) });
}));

r.get('/:id', wrap(async (req, res) => {
  const c = (await candidates(req.user)).find((x) => x.id === req.params.id);
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'This student is not available.');
  res.json({ match: detail(c) });
}));

export default r;
