// Group membership rules shared by routes and the cleanup job.
import { addSystemMessage } from './social.js';

/**
 * Remove one person from a group.
 *  - Their roommate picks and checklist ticks go with them.
 *  - If the owner leaves, the longest-standing member becomes owner.
 *  - If fewer than 2 people remain, the group is deleted (its chat is deleted with it, so nothing is stored for a lone person).
 * Returns the ids of everyone who was in the group, so the caller can notify them.
 */
export async function leaveGroup(c, groupId, userId, note) {
  const g = (await c.query('SELECT owner_id, capacity FROM groups WHERE id=$1 FOR UPDATE', [groupId])).rows[0];
  if (!g) return [];
  const ms = (await c.query('SELECT gm.user_id, u.name FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 ORDER BY gm.joined_at, gm.user_id', [groupId])).rows;
  const me = ms.find((m) => m.user_id === userId);
  if (!me) return [];
  const everyone = ms.map((m) => m.user_id);
  await c.query('DELETE FROM group_members WHERE group_id=$1 AND user_id=$2', [groupId, userId]);
  await c.query('DELETE FROM roommate_picks WHERE group_id=$1 AND (from_user=$2 OR to_user=$2)', [groupId, userId]);
  await c.query('DELETE FROM group_agreements WHERE group_id=$1 AND user_id=$2', [groupId, userId]);
  const rest = ms.filter((m) => m.user_id !== userId);
  if (rest.length < 2) { await c.query('DELETE FROM groups WHERE id=$1', [groupId]); return everyone; }
  if (g.owner_id === userId || !g.owner_id) await c.query('UPDATE groups SET owner_id=$2 WHERE id=$1', [groupId, rest[0].user_id]);
  const seats = g.capacity - rest.length;
  await addSystemMessage(c, groupId, note || `${me.name} left the group. ${seats} ${seats === 1 ? 'seat is' : 'seats are'} open.`);
  return everyone;
}

/** Leave every group this person is in. Returns everyone affected. */
export async function leaveAllGroups(c, userId, note) {
  const affected = new Set();
  const gids = (await c.query('SELECT group_id FROM group_members WHERE user_id=$1', [userId])).rows.map((r) => r.group_id);
  for (const gid of gids) (await leaveGroup(c, gid, userId, note)).forEach((x) => affected.add(x));
  return [...affected];
}

/** Date `n` working days (Mon-Fri) after a YYYY-MM-DD date. */
export function addWorkingDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  for (let left = n; left > 0;) { d.setUTCDate(d.getUTCDate() + 1); if (![0, 6].includes(d.getUTCDay())) left--; }
  return d.toISOString().slice(0, 10);
}

/** Ids of the people this student has picked AND who picked them back. */
export async function roommatesOf(c, groupId, userId) {
  return (await c.query(
    `SELECT a.to_user FROM roommate_picks a JOIN roommate_picks b ON b.group_id=a.group_id AND b.from_user=a.to_user AND b.to_user=a.from_user
      WHERE a.group_id=$1 AND a.from_user=$2`, [groupId, userId])).rows.map((r) => r.to_user);
}
