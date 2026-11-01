// PG listings: same gender as the viewer, within the viewer's max distance of their office.
import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';
import { haversineKm } from '../lib/geo.js';
import { requireAuth, requireProfile } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth, requireProfile);
const SHARING = ['single', 'double', 'triple'];

const BEDS_TAKEN = `(SELECT count(*) FROM booking_members bm JOIN bookings b ON b.id=bm.booking_id
                      WHERE b.pg_id=pgs.id AND b.status IN ('pending_partner','confirmed'))::int`;

async function load(me, extraWhere = '', params = []) {
  const mine = (await query('SELECT p.max_distance_km, h.lat, h.lng FROM profiles p JOIN hubs h ON h.id=p.hub_id WHERE p.user_id=$1', [me.id])).rows[0];
  const { rows } = await query(`SELECT pgs.*, ${BEDS_TAKEN} AS taken FROM pgs WHERE gender=$1 ${extraWhere}`, [me.gender, ...params]);
  return rows
    .map((p) => ({ ...p, distanceKm: Math.round(haversineKm(mine.lat, mine.lng, p.lat, p.lng) * 10) / 10, bedsLeft: Math.max(0, p.beds_total - p.taken) }))
    .filter((p) => p.distanceKm <= mine.max_distance_km);
}

const brief = (p) => ({ id: p.id, name: p.name, locality: p.locality, distanceKm: p.distanceKm, bedsLeft: p.bedsLeft,
  rent: { single: p.rent_single, double: p.rent_double, triple: p.rent_triple }, isSample: p.is_sample });
const full = (p) => ({ ...brief(p), depositMonths: p.deposit_months, food: p.food, gateCloses: p.gate_closes ? p.gate_closes.slice(0, 5) : null,
  rules: p.rules, amenities: p.amenities, bedsTotal: p.beds_total });

r.get('/', wrap(async (req, res) => {
  const { sharing, maxRent, meals, noCurfew, sort } = req.query;
  if (sharing && !SHARING.includes(sharing)) throw new HttpError(400, 'VALIDATION', 'Choose single, double or triple.');
  const key = `rent_${sharing || 'double'}`;
  let rows = await load(req.user);
  if (maxRent) rows = rows.filter((p) => p[key] <= Number(maxRent));
  if (meals === '1') rows = rows.filter((p) => p.food !== 'none');
  if (noCurfew === '1') rows = rows.filter((p) => !p.gate_closes);
  rows.sort(sort === 'rent' ? (a, b) => a[key] - b[key] : (a, b) => a.distanceKm - b.distanceKm);
  res.json({ pgs: rows.map(brief) });
}));

r.get('/:id', wrap(async (req, res) => {
  const p = (await load(req.user, 'AND pgs.id=$2', [req.params.id]))[0];
  if (!p) throw new HttpError(404, 'NOT_FOUND', 'PG not found.');
  res.json({ pg: full(p) });
}));

export default r;
