// Reservations (no payment taken) and the credits earned when a booking is confirmed.
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { tx, query } from '../db.js';
import { HttpError, wrap } from '../lib/http.js';
import { haversineKm } from '../lib/geo.js';
import { lockUsers, addSystemMessage } from '../lib/social.js';
import { roommatesOf } from '../lib/groups.js';
import { publish } from '../events.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireProfile } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth, requireProfile);
const ACTIVE = "('pending_partner','confirmed')";
const newId = () => 'PM-' + Array.from(crypto.randomBytes(6), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
const hasActive = async (c, uid) => (await c.query(`SELECT 1 FROM booking_members bm JOIN bookings b ON b.id=bm.booking_id WHERE bm.user_id=$1 AND b.status IN ${ACTIVE}`, [uid])).rowCount > 0;
const bedsLeft = async (c, pg) => pg.beds_total - (await c.query(`SELECT count(*)::int n FROM booking_members bm JOIN bookings b ON b.id=bm.booking_id WHERE b.pg_id=$1 AND b.status IN ${ACTIVE}`, [pg.id])).rows[0].n;

/** Credits go to EVERY member, only when a booking becomes confirmed. */
async function award(c, bookingId, userIds) {
  for (const u of userIds) await c.query('INSERT INTO credit_ledger (user_id,booking_id,delta,reason) VALUES ($1,$2,$3,$4)', [u, bookingId, config.creditsPerBooking, `Booking ${bookingId} confirmed`]);
}

/** Cancel an active booking; reverses any credits it earned. Returns the member ids. */
export async function cancelBooking(c, bookingId, note) {
  const b = (await c.query('UPDATE bookings SET status=\'cancelled\', closed_at=now() WHERE id=$1 AND status IN (\'pending_partner\',\'confirmed\') RETURNING *', [bookingId])).rows[0];
  if (!b) throw new HttpError(404, 'NOT_FOUND', 'This booking is no longer active.');
  await c.query(`INSERT INTO credit_ledger (user_id,booking_id,delta,reason)
                 SELECT user_id, booking_id, -SUM(delta), $2 FROM credit_ledger WHERE booking_id=$1 GROUP BY user_id, booking_id HAVING SUM(delta) > 0`, [bookingId, `Booking ${bookingId} cancelled`]);
  if (b.group_id) await addSystemMessage(c, b.group_id, note);
  return (await c.query('SELECT user_id FROM booking_members WHERE booking_id=$1', [bookingId])).rows.map((m) => m.user_id);
}

const createSchema = z.object({
  pgId: z.string().min(1), sharing: z.enum(['single', 'double', 'triple']), groupId: z.string().uuid().nullish(),
  withUserIds: z.array(z.string().uuid()).max(2, 'You can book for up to 3 people.').optional(), // roommates (from the group) to book with
  moveIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a move-in date.'),
});

r.post('/', validate(createSchema), wrap(async (req, res) => {
  const me = req.user, d = req.body;
  const today = new Date().toISOString().slice(0, 10);
  const max = new Date(); max.setUTCMonth(max.getUTCMonth() + 12);
  if (Number.isNaN(Date.parse(d.moveIn)) || d.moveIn < today || d.moveIn > max.toISOString().slice(0, 10)) throw new HttpError(400, 'BAD_DATE', 'Move-in must be between today and 12 months from now.');
  const out = await tx(async (c) => {
    let partners = [];
    if (d.groupId) {
      const ms = (await c.query('SELECT user_id FROM group_members WHERE group_id=$1', [d.groupId])).rows;
      if (!ms.some((m) => m.user_id === me.id)) throw new HttpError(404, 'NOT_FOUND', 'Group not found.');
      const mutual = await roommatesOf(c, d.groupId, me.id); // people who picked you and whom you picked
      partners = [...new Set(d.withUserIds ?? mutual)];
      if (!partners.length || partners.some((p) => !mutual.includes(p))) throw new HttpError(409, 'NOT_CONFIRMED', 'You can only book with roommates who picked you and whom you picked.');
      if (partners.length > 2) throw new HttpError(400, 'TOO_MANY', 'You can book for up to 3 people.');
      if (d.sharing === 'single' || (partners.length === 2 && d.sharing === 'double')) throw new HttpError(400, 'BAD_SHARING', partners.length === 2 ? 'Three roommates need a triple room.' : 'Roommates need a double or triple room.');
    }
    await lockUsers(c, me.id, ...partners);
    const pg = (await c.query('SELECT * FROM pgs WHERE id=$1 FOR UPDATE', [d.pgId])).rows[0]; // lock: no overbooking
    const mine = (await c.query('SELECT p.max_distance_km, h.lat, h.lng FROM profiles p JOIN hubs h ON h.id=p.hub_id WHERE p.user_id=$1', [me.id])).rows[0];
    if (!pg || pg.gender !== me.gender || haversineKm(mine.lat, mine.lng, pg.lat, pg.lng) > mine.max_distance_km) throw new HttpError(404, 'NOT_FOUND', 'PG not found.');
    for (const u of [me.id, ...partners]) if (await hasActive(c, u)) throw new HttpError(409, 'ACTIVE_BOOKING', u === me.id ? 'You already have an active booking. Cancel it first.' : 'A roommate already has an active booking.');
    const people = 1 + partners.length;
    if (await bedsLeft(c, pg) < people) throw new HttpError(409, 'NO_BEDS', 'Not enough beds left in this PG.');
    const rent = pg[`rent_${d.sharing}`], id = newId(), solo = !partners.length;
    await c.query('INSERT INTO bookings (id,pg_id,created_by,group_id,sharing,move_in,rent_per_bed,deposit_per_bed,status,confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, pg.id, me.id, d.groupId || null, d.sharing, d.moveIn, rent, rent * pg.deposit_months, solo ? 'confirmed' : 'pending_partner', solo ? new Date() : null]);
    await c.query('INSERT INTO booking_members (booking_id,user_id,accepted_at) VALUES ($1,$2,now())', [id, me.id]);
    if (partners.length) {
      for (const p of partners) await c.query('INSERT INTO booking_members (booking_id,user_id) VALUES ($1,$2)', [id, p]);
      await addSystemMessage(c, d.groupId, `${me.name} booked ${pg.name} for ${people} people. Each roommate accepts it in My Bookings.`);
    } else await award(c, id, [me.id]);
    return { id, ids: [me.id, ...partners], status: solo ? 'confirmed' : 'pending_partner' };
  });
  await publish('booking', out.ids);
  res.status(201).json({ id: out.id, status: out.status });
}));

r.get('/', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT b.*, pg.name AS pg_name, pg.locality, me.accepted_at AS my_accepted,
            (SELECT json_agg(json_build_object('id',u.id,'name',u.name) ORDER BY u.name) FROM booking_members m JOIN users u ON u.id=m.user_id WHERE m.booking_id=b.id) AS members
       FROM bookings b JOIN pgs pg ON pg.id=b.pg_id JOIN booking_members me ON me.booking_id=b.id AND me.user_id=$1 ORDER BY b.created_at DESC`, [req.user.id]);
  res.json({ bookings: rows.map((b) => ({ id: b.id, pgName: b.pg_name, locality: b.locality, sharing: b.sharing, moveIn: b.move_in,
    rentPerBed: b.rent_per_bed, depositPerBed: b.deposit_per_bed, status: b.status, members: b.members, awaitingMe: b.status === 'pending_partner' && !b.my_accepted, createdAt: b.created_at })) });
}));

r.get('/credits', wrap(async (req, res) => {
  const { rows } = await query('SELECT delta, reason, created_at, booking_id FROM credit_ledger WHERE user_id=$1 ORDER BY id DESC', [req.user.id]);
  res.json({ balance: rows.reduce((s, x) => s + x.delta, 0), history: rows.map((x) => ({ delta: x.delta, reason: x.reason, createdAt: x.created_at, bookingId: x.booking_id })) });
}));

r.post('/:id/accept', wrap(async (req, res) => {
  const ids = await tx(async (c) => {
    const b = (await c.query("SELECT b.* FROM bookings b JOIN booking_members m ON m.booking_id=b.id WHERE b.id=$1 AND m.user_id=$2 AND m.accepted_at IS NULL AND b.status='pending_partner' FOR UPDATE OF b", [req.params.id, req.user.id])).rows[0];
    if (!b) throw new HttpError(404, 'NOT_FOUND', 'This booking is no longer waiting for you.');
    await c.query('UPDATE booking_members SET accepted_at=now() WHERE booking_id=$1 AND user_id=$2', [b.id, req.user.id]);
    const members = (await c.query('SELECT user_id, accepted_at FROM booking_members WHERE booking_id=$1', [b.id])).rows;
    if (members.every((m) => m.accepted_at || m.user_id === req.user.id)) { // the last roommate said yes
      await c.query("UPDATE bookings SET status='confirmed', confirmed_at=now() WHERE id=$1", [b.id]);
      await award(c, b.id, members.map((m) => m.user_id)); // everyone on the booking earns
      if (b.group_id) await addSystemMessage(c, b.group_id, `Booking ${b.id} is confirmed. Pay the PG at move-in.`);
    }
    return members.map((m) => m.user_id);
  });
  await publish('booking', ids);
  res.json({ ok: true });
}));

r.post('/:id/decline', wrap(async (req, res) => {
  const ids = await tx(async (c) => {
    const b = (await c.query("SELECT b.* FROM bookings b JOIN booking_members m ON m.booking_id=b.id WHERE b.id=$1 AND m.user_id=$2 AND m.accepted_at IS NULL AND b.status='pending_partner' FOR UPDATE OF b", [req.params.id, req.user.id])).rows[0];
    if (!b) throw new HttpError(404, 'NOT_FOUND', 'This booking is no longer waiting for you.');
    await c.query("UPDATE bookings SET status='declined', closed_at=now() WHERE id=$1", [b.id]);
    if (b.group_id) await addSystemMessage(c, b.group_id, `Booking ${b.id} was declined.`);
    return (await c.query('SELECT user_id FROM booking_members WHERE booking_id=$1', [b.id])).rows.map((m) => m.user_id);
  });
  await publish('booking', ids);
  res.json({ ok: true });
}));

r.post('/:id/cancel', wrap(async (req, res) => {
  const ids = await tx(async (c) => {
    if (!(await c.query('SELECT 1 FROM booking_members WHERE booking_id=$1 AND user_id=$2', [req.params.id, req.user.id])).rowCount) throw new HttpError(404, 'NOT_FOUND', 'Booking not found.');
    return cancelBooking(c, req.params.id, `Booking ${req.params.id} was cancelled.`);
  });
  await publish('booking', ids);
  res.json({ ok: true });
}));

export default r;
