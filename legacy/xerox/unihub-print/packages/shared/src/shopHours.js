// Open/closed logic, evaluated in Indian Standard Time (UTC+5:30).
const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** IST calendar date (YYYY-MM-DD) and minutes since midnight for a Date. */
export function istParts(now) {
  const ist = new Date(now.getTime() + 330 * 60000);
  return { day: ist.toISOString().slice(0, 10), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

/** shop: { override: 'open'|'closed'|null, closedDate: 'YYYY-MM-DD'|null, openTime, closeTime }.
 *  Priority: manual override > "closed today" > daily hours (overnight windows supported). */
export function isShopOpen(shop, now = new Date()) {
  if (shop.override === 'open') return true;
  if (shop.override === 'closed') return false;
  const { day, minutes } = istParts(now);
  if (shop.closedDate === day) return false;
  const open = toMinutes(shop.openTime), close = toMinutes(shop.closeTime);
  return open <= close ? minutes >= open && minutes < close : minutes >= open || minutes < close;
}
