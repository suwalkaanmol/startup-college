// Housekeeping: 5 working days after a confirmed move-in date, the person has moved into their PG,
// so they leave their groups. A group left with fewer than 2 people is deleted along with its chat.
import { tx, query } from './db.js';
import { leaveAllGroups, addWorkingDays } from './lib/groups.js';
import { publish } from './events.js';

export const CLEANUP_AFTER_WORKING_DAYS = 5;

export async function runCleanup(today = new Date().toISOString().slice(0, 10)) {
  const { rows } = await query(
    `SELECT DISTINCT bm.user_id, b.move_in FROM bookings b JOIN booking_members bm ON bm.booking_id=b.id
      WHERE b.status='confirmed' AND b.move_in <= ($1::date - 5)`, [today]); // 5 working days is at least 5 calendar days
  const movedIn = [...new Set(rows.filter((r) => addWorkingDays(r.move_in, CLEANUP_AFTER_WORKING_DAYS) <= today).map((r) => r.user_id))];
  const notify = new Set();
  for (const uid of movedIn) {
    const ids = await tx(async (c) => {
      const name = (await c.query('SELECT name FROM users WHERE id=$1', [uid])).rows[0]?.name || 'A member';
      return leaveAllGroups(c, uid, `${name} has moved into their PG and left the group.`);
    });
    ids.forEach((x) => notify.add(x));
  }
  if (notify.size) await publish('group', [...notify]);
  return movedIn.length;
}

/** Run now and then every hour. */
export function startCleanup() {
  const go = () => runCleanup().catch((e) => console.error('[cleanup]', e.message));
  go();
  setInterval(go, 60 * 60 * 1000).unref();
}
