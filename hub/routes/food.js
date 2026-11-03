// Food: four canteens, each with its own database (menu and orders). Students compare a dish across canteens,
// order with a pickup time, pay the canteen directly and collect with a token. Owners run the board, menu and history.
import { HttpError, readJson, need, today } from '../lib/http.js';
import { takePayment, refund } from '../lib/pay.js';
import { receiptCode } from '../lib/receipt.js';

const FLOW = { PLACED: ['READY', 'CANCELLED'], READY: ['COLLECTED'], COLLECTED: [], CANCELLED: [] };
const ACTIVE = ['PLACED', 'READY'];
const TOKEN_VALID_HOURS = 2; // after collection the token stays visible this long, then expires
const CANCEL_MINUTES = 2; // students can cancel only right after ordering, before the kitchen starts
const MAX_AHEAD_MIN = 60; // furthest pickup time a student can choose
const MIN = 60e3;

// Today's date in India for a Date.
const istDay = (d) => today(d);
// "HH:MM" today in India -> Date
function istTime(hhmm, now = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const base = new Date(`${istDay(now)}T00:00:00+05:30`);
  return new Date(base.getTime() + (h * 60 + m) * MIN);
}

export default function food(r, { store, places, live, cfg }) {
  const db = (cid) => places.get('food', cid);
  const canteen = (id) => { const c = store.get('canteens', id); if (!c) throw new HttpError(404, 'NOT_FOUND', 'That canteen doesn’t exist.'); return c; };
  const canteenOut = (c) => ({ id: c.id, name: c.name, place: c.place, open: c.open, upi: c.upi || '', dishes: db(c.id).count('menu') });
  const forStaff = (s, cid) => { if (s.role !== 'admin' && !(s.role === 'canteen' && s.place === cid)) throw new HttpError(403, 'FORBIDDEN', 'This login is for a different canteen.'); };
  const staffCanteen = (staff, url) => { const cid = staff.role === 'admin' ? (url.searchParams.get('canteen') || store.list('canteens')[0]?.id) : staff.place; forStaff(staff, cid); return canteen(cid); };

  // Daily stock: an item with a daily limit refills each morning.
  const fresh = (d, m) => (m.dailyQty != null && m.qtyDay !== today() ? d.patch('menu', m.id, { qtyLeft: m.dailyQty, qtyDay: today() }) : m);
  const itemOut = (c, m) => ({
    id: m.id, canteenId: c.id, canteenName: c.name, name: m.name, category: m.category, price: m.price, veg: m.veg, prepMins: m.prepMins,
    available: Boolean(m.available) && (m.qtyLeft == null || m.qtyLeft > 0), qtyLeft: m.qtyLeft, dailyQty: m.dailyQty,
  });
  const menuOf = (c) => { const d = db(c.id); return d.list('menu').map((m) => itemOut(c, fresh(d, m))).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)); };

  const studentView = (o) => {
    const expired = o.status === 'COLLECTED' && o.collectedAt && Date.now() - new Date(o.collectedAt).getTime() > TOKEN_VALID_HOURS * 3600e3;
    const canCancel = o.status === 'PLACED' && Date.now() - new Date(o.createdAt).getTime() < CANCEL_MINUTES * MIN;
    return { ...o, expired, canCancel, receipt: receiptCode(cfg.jwtSecret, 'food', o.canteenId, o), placeLine: store.get('canteens', o.canteenId)?.place || '', validUntil: o.collectedAt ? new Date(new Date(o.collectedAt).getTime() + TOKEN_VALID_HOURS * 3600e3).toISOString() : null };
  };
  const pub = (o) => {
    live.publish(`food:c:${o.canteenId}`, { id: o.id, status: o.status, token: o.token });
    live.publish(`food:u:${o.studentId}`, { id: o.id, status: o.status, token: o.token, canteen: o.canteenName });
  };
  const pubMenu = (cid) => live.publish(`food:menu:${cid}`, {});
  const findOrder = (cid, id) => { const o = db(cid).get('orders', id); if (!o) throw new HttpError(404, 'NOT_FOUND', 'Order not found.'); return o; };
  const restock = (d, o) => { for (const l of o.items) { const m = d.get('menu', l.menuId); if (m && m.qtyLeft != null) d.patch('menu', m.id, { qtyLeft: m.qtyLeft + l.qty }); } };

  // ---------- students ----------
  r.get('/api/food/canteens', 'student', () => ({ canteens: store.list('canteens').map(canteenOut).sort((a, b) => a.name.localeCompare(b.name)) }));

  // Every dish in every canteen, so students can search once and compare prices and waiting times.
  r.get('/api/food/dishes', 'student', () => ({
    canteens: store.list('canteens').map(canteenOut).sort((a, b) => a.name.localeCompare(b.name)),
    dishes: store.list('canteens').flatMap(menuOf),
  }));

  r.get('/api/food/canteens/:id/menu', 'student', ({ params }) => { const c = canteen(params.id); return { canteen: canteenOut(c), items: menuOf(c) }; });

  r.post('/api/food/orders', 'student', async ({ req, user }) => {
    const b = await readJson(req);
    const c = canteen(String(b.canteenId || ''));
    if (!c.open) throw new HttpError(409, 'CLOSED', `${c.name} isn’t taking orders right now.`);
    if (!Array.isArray(b.items) || !b.items.length) throw new HttpError(400, 'EMPTY', 'Your cart is empty.');
    if (b.items.length > 30) throw new HttpError(400, 'INVALID', 'That’s too many different items for one order.');
    const d = db(c.id);
    const lines = []; let total = 0, prep = 0;
    const want = new Map();
    for (const it of b.items) {
      const m0 = d.get('menu', String(it.id || ''));
      if (!m0) throw new HttpError(400, 'INVALID', 'One of the items is no longer on the menu. Refresh and try again.');
      const m = fresh(d, m0);
      const qty = need.int(it.qty, 'Quantity', { min: 1, max: 20 });
      want.set(m.id, (want.get(m.id) || 0) + qty);
      if (!m.available) throw new HttpError(409, 'OUT_OF_STOCK', `${m.name} isn’t available right now. Remove it to continue.`);
      if (m.qtyLeft != null && m.qtyLeft < want.get(m.id)) throw new HttpError(409, 'OUT_OF_STOCK', m.qtyLeft ? `Only ${m.qtyLeft} ${m.name} left. Lower the quantity to continue.` : `${m.name} just sold out. Remove it to continue.`);
      lines.push({ menuId: m.id, name: m.name, price: m.price, qty, veg: m.veg, prepMins: m.prepMins });
      total += m.price * qty; prep = Math.max(prep, m.prepMins);
    }
    const active = d.list('orders', (o) => o.studentId === user.id && ACTIVE.includes(o.status));
    if (active.length >= 3) throw new HttpError(429, 'TOO_MANY', `You already have 3 orders in progress at ${c.name}. Collect one first.`);

    // Pickup time: no earlier than the longest item takes, no later than an hour ahead.
    const now = new Date();
    const earliest = new Date(now.getTime() + prep * MIN);
    let pickup = earliest;
    if (b.pickupAt) {
      const t = /^\d{2}:\d{2}$/.test(b.pickupAt) ? istTime(need.time(b.pickupAt, 'Pickup time'), now) : new Date(b.pickupAt);
      if (isNaN(t)) throw new HttpError(400, 'INVALID', 'Pick a pickup time.');
      pickup = t;
    }
    if (pickup.getTime() < earliest.getTime() - 2 * MIN) throw new HttpError(400, 'TOO_EARLY', `This order needs about ${prep} minutes. Pick ${earliest.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })} or later.`);
    if (pickup.getTime() > now.getTime() + (Math.max(MAX_AHEAD_MIN, prep + 30) + 2) * MIN) throw new HttpError(400, 'TOO_LATE', 'You can choose a pickup time up to 1 hour from now.');
    const mode = need.oneOf(b.mode || 'takeaway', 'Dine-in or take-away', ['takeaway', 'dinein']);

    const payment = takePayment(b.pay, total, { name: c.name, upi: c.upi });
    for (const [id, q] of want) { const m = d.get('menu', id); if (m.qtyLeft != null) d.patch('menu', id, { qtyLeft: m.qtyLeft - q }); }
    const day = today();
    const o = d.put('orders', {
      canteenId: c.id, canteenName: c.name, studentId: user.id, studentName: user.name, phone: user.phone, regNo: user.regNo,
      items: lines.map((l) => ({ ...l, startBy: new Date(pickup.getTime() - l.prepMins * MIN).toISOString() })),
      total, prepMins: prep, pickupAt: pickup.toISOString(), mode, note: String(b.note || '').trim().slice(0, 140),
      token: `${c.prefix || 'F'}${d.next(`token:${day}`)}`, day, status: 'PLACED', payment,
    });
    pub(o); pubMenu(c.id);
    return { order: studentView(o) };
  });

  const mine = (uid) => store.list('canteens').flatMap((c) => db(c.id).list('orders', (o) => o.studentId === uid));
  r.get('/api/food/orders/mine', 'student', ({ user }) => ({
    orders: mine(user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60).map(studentView),
  }));

  r.post('/api/food/orders/:id/cancel', 'student', ({ params, user }) => {
    const o = mine(user.id).find((x) => x.id === params.id);
    if (!o) throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
    if (!studentView(o).canCancel) throw new HttpError(409, 'TOO_LATE', `Orders can be cancelled only in the first ${CANCEL_MINUTES} minutes, before the kitchen starts. Ask at the counter.`);
    const d = db(o.canteenId); restock(d, o);
    pub(d.patch('orders', o.id, { status: 'CANCELLED', cancelledBy: 'student', payment: refund(o.payment) })); pubMenu(o.canteenId);
    return { ok: true };
  });

  // ---------- canteen owners ----------
  r.get('/api/food/staff/board', 'staff', ({ staff, url }) => {
    const c = staffCanteen(staff, url); const d = db(c.id); const day = today();
    const orders = d.list('orders', (o) => o.day === day || ACTIVE.includes(o.status)).sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
    const counts = { pending: 0, ready: 0, collected: 0 };
    for (const o of orders) { if (o.status === 'PLACED') counts.pending++; else if (o.status === 'READY') counts.ready++; else if (o.status === 'COLLECTED' && o.day === day) counts.collected++; }
    return { canteen: canteenOut(c), orders, counts, revenueToday: orders.filter((o) => o.day === day && o.status !== 'CANCELLED').reduce((n, o) => n + o.total, 0) };
  });

  r.post('/api/food/staff/orders/:id/status', 'staff', async ({ req, params, staff, url }) => {
    const { status } = await readJson(req);
    const c = staffCanteen(staff, url); const d = db(c.id); const o = findOrder(c.id, params.id);
    if (!FLOW[o.status]?.includes(status)) throw new HttpError(409, 'BAD_STEP', `An order that is ${o.status.toLowerCase()} can’t move to ${String(status).toLowerCase()}.`);
    const patch = { status };
    if (status === 'READY') patch.readyAt = new Date().toISOString();
    if (status === 'COLLECTED') patch.collectedAt = new Date().toISOString();
    if (status === 'CANCELLED') { patch.cancelledBy = 'canteen'; patch.payment = refund(o.payment); restock(d, o); pubMenu(c.id); }
    const u = d.patch('orders', o.id, patch); pub(u);
    return { order: u };
  });

  // Hand over at the counter: type the token the student shows.
  r.post('/api/food/staff/verify', 'staff', async ({ req, staff, url }) => {
    const c = staffCanteen(staff, url); const d = db(c.id);
    const token = String((await readJson(req)).token || '').trim().toUpperCase();
    const o = d.list('orders', (x) => x.token === token && (x.day === today() || ACTIVE.includes(x.status))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!o) throw new HttpError(404, 'NOT_FOUND', `No order with token ${token} at ${c.name}.`);
    if (o.status === 'COLLECTED') throw new HttpError(409, 'DONE', `${token} was already collected at ${new Date(o.collectedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.`);
    if (o.status === 'CANCELLED') throw new HttpError(409, 'CANCELLED', `${token} was cancelled.`);
    if (o.status !== 'READY') throw new HttpError(409, 'NOT_READY', `${token} isn’t marked ready yet. Tap Done when the food is ready.`);
    const u = d.patch('orders', o.id, { status: 'COLLECTED', collectedAt: new Date().toISOString() }); pub(u);
    return { order: u };
  });

  r.get('/api/food/staff/menu', 'staff', ({ staff, url }) => { const c = staffCanteen(staff, url); return { canteen: canteenOut(c), items: menuOf(c) }; });

  const menuInput = (b, cur = {}) => {
    const out = {};
    if ('name' in b || !cur.id) out.name = need.str(b.name, 'Name', { max: 60 });
    if ('category' in b || !cur.id) out.category = need.str(b.category || 'General', 'Category', { max: 30 });
    if ('price' in b || !cur.id) out.price = need.int(b.price, 'Price', { min: 0, max: 5000 });
    if ('veg' in b || !cur.id) out.veg = b.veg !== false;
    if ('prepMins' in b || !cur.id) out.prepMins = need.int(b.prepMins ?? 15, 'Preparation time', { min: 1, max: 120 });
    if ('available' in b) out.available = Boolean(b.available);
    if ('dailyQty' in b) out.dailyQty = b.dailyQty === '' || b.dailyQty == null ? null : need.int(b.dailyQty, 'Daily quantity', { min: 0, max: 5000 });
    if ('qtyLeft' in b) out.qtyLeft = b.qtyLeft === '' || b.qtyLeft == null ? null : need.int(b.qtyLeft, 'Quantity left', { min: 0, max: 5000 });
    if ('dailyQty' in out && !('qtyLeft' in out)) out.qtyLeft = out.dailyQty;
    if ('qtyLeft' in out || 'dailyQty' in out) out.qtyDay = today();
    return out;
  };
  r.post('/api/food/staff/menu', 'staff', async ({ req, staff, url }) => {
    const c = staffCanteen(staff, url);
    const m = db(c.id).put('menu', { available: true, dailyQty: null, qtyLeft: null, qtyDay: '', ...menuInput(await readJson(req)) });
    pubMenu(c.id); return { item: itemOut(c, m) };
  });
  r.put('/api/food/staff/menu/:id', 'staff', async ({ req, params, staff, url }) => {
    const c = staffCanteen(staff, url); const d = db(c.id); const m = d.get('menu', params.id);
    if (!m) throw new HttpError(404, 'NOT_FOUND', 'That item isn’t on the menu.');
    const u = d.patch('menu', m.id, menuInput(await readJson(req), m)); pubMenu(c.id);
    return { item: itemOut(c, u) };
  });
  r.del('/api/food/staff/menu/:id', 'staff', ({ params, staff, url }) => {
    const c = staffCanteen(staff, url); if (!db(c.id).remove('menu', params.id)) throw new HttpError(404, 'NOT_FOUND', 'That item isn’t on the menu.');
    pubMenu(c.id); return { ok: true };
  });

  r.put('/api/food/staff/canteen', 'staff', async ({ req, staff, url }) => {
    const c = staffCanteen(staff, url); const b = await readJson(req); const patch = {};
    if ('open' in b) patch.open = Boolean(b.open);
    if ('upi' in b) { const u = String(b.upi || '').trim(); if (u && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(u)) throw new HttpError(400, 'INVALID', 'Enter a UPI ID like kcfoods@okaxis.'); patch.upi = u; }
    if ('place' in b) patch.place = String(b.place || '').trim().slice(0, 60);
    const u = store.patch('canteens', c.id, patch); pubMenu(c.id);
    return { canteen: canteenOut(u) };
  });

  // Payments and sales between two dates, by day and by item, plus what students order most and when.
  r.get('/api/food/staff/history', 'staff', ({ staff, url }) => {
    const c = staffCanteen(staff, url); const d = db(c.id);
    const from = need.date(url.searchParams.get('from') || today(), 'From'); const to = need.date(url.searchParams.get('to') || today(), 'To');
    if (from > to) throw new HttpError(400, 'INVALID', '“From” must be on or before “To”.');
    const orders = d.list('orders', (o) => o.day >= from && o.day <= to).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const paid = orders.filter((o) => o.status !== 'CANCELLED');
    const byDay = {}, items = {}, hours = Array(24).fill(0);
    for (const o of paid) {
      (byDay[o.day] ||= { day: o.day, orders: 0, revenue: 0 }); byDay[o.day].orders++; byDay[o.day].revenue += o.total;
      hours[Number(new Date(o.createdAt).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })) % 24]++;
      for (const l of o.items) {
        const it = (items[l.name] ||= { name: l.name, qty: 0, revenue: 0, byDay: {} });
        it.qty += l.qty; it.revenue += l.qty * l.price; it.byDay[o.day] = (it.byDay[o.day] || 0) + l.qty;
      }
    }
    // Expected orders today: the average of the same weekday over the last four weeks.
    const sameDays = [7, 14, 21, 28].map((n) => today(new Date(Date.now() - n * 86400e3)));
    const past = sameDays.map((day) => d.list('orders', (o) => o.day === day && o.status !== 'CANCELLED').length);
    const expected = Math.round(past.reduce((a, b) => a + b, 0) / past.length);
    return {
      canteen: canteenOut(c), from, to,
      totals: { orders: paid.length, revenue: paid.reduce((n, o) => n + o.total, 0), cancelled: orders.length - paid.length, students: new Set(paid.map((o) => o.studentId)).size },
      byDay: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)),
      items: Object.values(items).sort((a, b) => b.qty - a.qty),
      hours, forecast: { expected, weeksWithData: past.filter(Boolean).length },
      orders: orders.slice(0, 300),
    };
  });

  return {
    topics(t, { user, staff }) {
      let m;
      if ((m = t.match(/^food:u:(.+)$/))) return user && user.id === m[1];
      if ((m = t.match(/^food:c:(.+)$/))) return staff && (staff.role === 'admin' || (staff.role === 'canteen' && staff.place === m[1]));
      if ((m = t.match(/^food:menu:(.+)$/))) return Boolean(user || staff);
      return false;
    },
    // For /verify: finds the order a slip's code belongs to.
    findReceipt: (code) => { for (const c of store.list('canteens')) for (const o of db(c.id).list('orders')) if (receiptCode(cfg.jwtSecret, 'food', c.id, o) === code) return { kind: 'Food', place: c.name, o, lines: o.items.map((i) => `${i.qty}× ${i.name}`) }; return null; },
    studentOrders: (uid) => mine(uid).map((o) => ({ source: 'food', id: o.id, title: o.canteenName, token: o.token, status: o.status, amount: o.total, at: o.createdAt, detail: o.items.map((i) => `${i.qty}× ${i.name}`).join(', ') })),
    forgetStudent() { /* orders are kept for the canteen's accounts */ },
    count: () => store.list('canteens').reduce((n, c) => n + db(c.id).count('orders'), 0),
  };
}
