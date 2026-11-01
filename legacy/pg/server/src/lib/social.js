// Shared helpers for requests, groups and safety.
export const MAX_SLOTS = 3;        // most groups (plus pending requests) one student can have at once
export const MAX_GROUP_SIZE = 6;   // biggest group a student can choose (matches the DB check)

/** Serialise concurrent work per user (double-clicks). Lock several users in a stable order to avoid deadlocks. */
export async function lockUsers(c, ...ids) {
  for (const id of [...new Set(ids)].sort()) await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [id]);
}

/** Slots used = groups you are in + pending requests you sent + pending join requests you sent. */
export async function slotsUsed(c, userId) {
  const { rows } = await c.query(
    `SELECT (SELECT count(*) FROM group_members WHERE user_id=$1)::int
          + (SELECT count(*) FROM roommate_requests WHERE from_user=$1 AND status='pending')::int
          + (SELECT count(*) FROM group_join_requests WHERE user_id=$1 AND status='pending')::int AS n`, [userId]);
  return rows[0].n;
}

export const isBlocked = async (c, a, b) =>
  (await c.query('SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [a, b])).rowCount > 0;

/** True when two students are on the same pending or confirmed booking. */
export const sharedActiveBooking = async (c, a, b) =>
  (await c.query(`SELECT 1 FROM bookings bk JOIN booking_members x ON x.booking_id=bk.id AND x.user_id=$1
                  JOIN booking_members y ON y.booking_id=bk.id AND y.user_id=$2
                  WHERE bk.status IN ('pending_partner','confirmed')`, [a, b])).rowCount > 0;

/** True when this student is on an active booking that was made from this group. */
export const userHasGroupBooking = async (c, groupId, userId) =>
  (await c.query(`SELECT 1 FROM bookings bk JOIN booking_members m ON m.booking_id=bk.id AND m.user_id=$2
                  WHERE bk.group_id=$1 AND bk.status IN ('pending_partner','confirmed')`, [groupId, userId])).rowCount > 0;

export const addSystemMessage = (c, groupId, body) =>
  c.query('INSERT INTO messages (group_id, sender_id, body) VALUES ($1, NULL, $2)', [groupId, body]);
