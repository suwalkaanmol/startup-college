// Placement profile: company, office hub, max distance, optional preferences.
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';
import { sanitizeTags } from '../lib/tags.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);
const dist = z.coerce.number().int('Distance must be a whole number.').min(1, 'Distance must be 1-200 km.').max(200, 'Distance must be 1-200 km.');

const shape = (p) => p && ({ company: p.company, hubId: p.hub_id, maxDistanceKm: p.max_distance_km, moveInFrom: p.move_in_from, moveInTo: p.move_in_to, moveInDate: p.move_in_date,
  budget: p.budget, bio: p.bio, tags: p.tags, priorities: p.priorities });

r.get('/', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM profiles WHERE user_id=$1', [req.user.id]);
  res.json({ profile: shape(rows[0]) || null });
}));

const day = (label) => z.string({ required_error: `Choose ${label}.` }).regex(/^\d{4}-\d{2}-\d{2}$/, `Choose ${label}.`)
  .refine((v) => !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v, `Choose ${label}.`);
const todayStr = () => new Date().toISOString().slice(0, 10);
const addYears = (n) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10); };

const schema = z.object({
  moveInFrom: day('the first date you could move in'), moveInTo: day('the last date you could move in'), moveInDate: day('your exact move-in date'),
  company: z.string().trim().min(2, 'Enter your company.').max(80),
  hubId: z.string().min(1, 'Choose your office location.'),
  maxDistanceKm: dist,
  budget: z.coerce.number().int().min(1000, 'Budget must be 1,000-200,000.').max(200000, 'Budget must be 1,000-200,000.').nullish().or(z.literal('').transform(() => null)),
  bio: z.string().trim().max(300, 'About you can be up to 300 characters.').nullish().or(z.literal('').transform(() => null)),
  tags: z.array(z.string()).default([]), priorities: z.array(z.string()).default([]),
}).superRefine((d, ctx) => {
  const bad = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (d.moveInTo < d.moveInFrom) bad('moveInTo', 'The last date must be on or after the first date.');
  else if (d.moveInDate < d.moveInFrom || d.moveInDate > d.moveInTo) bad('moveInDate', 'Your exact move-in date must be inside your window.');
  if (d.moveInDate < todayStr()) bad('moveInDate', 'Choose a move-in date from today onward.');
  if (d.moveInTo > addYears(2)) bad('moveInTo', 'Choose dates within the next 2 years.');
});

r.put('/', validate(schema), wrap(async (req, res) => {
  const d = req.body;
  const { tags, priorities } = sanitizeTags(d.tags, d.priorities);
  if (!(await query('SELECT 1 FROM hubs WHERE id=$1', [d.hubId])).rows[0]) throw new HttpError(400, 'BAD_HUB', 'Choose a valid office location.');
  const { rows } = await query(
    `INSERT INTO profiles (user_id,company,hub_id,max_distance_km,move_in_from,move_in_to,move_in_date,budget,bio,tags,priorities)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (user_id) DO UPDATE SET company=$2,hub_id=$3,max_distance_km=$4,move_in_from=$5,move_in_to=$6,move_in_date=$7,budget=$8,bio=$9,tags=$10,priorities=$11,updated_at=now()
     RETURNING *`, [req.user.id, d.company, d.hubId, d.maxDistanceKm, d.moveInFrom, d.moveInTo, d.moveInDate, d.budget ?? null, d.bio || null, tags, priorities]);
  res.json({ profile: shape(rows[0]) });
}));

r.patch('/distance', validate(z.object({ maxDistanceKm: dist })), wrap(async (req, res) => {
  const { rows } = await query('UPDATE profiles SET max_distance_km=$2, updated_at=now() WHERE user_id=$1 RETURNING *', [req.user.id, req.body.maxDistanceKm]);
  if (!rows[0]) throw new HttpError(409, 'NO_PROFILE', 'Please complete your profile first.');
  res.json({ profile: shape(rows[0]) });
}));

export default r;
