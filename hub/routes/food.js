// Food: canteen menus, student orders with daily tokens, and the canteen staff board.
import { HttpError, readJson, need, today } from '../lib/http.js';
import { takePayment, refund } from '../lib/pay.js';

const FLOW = { PLACED: ['PREPARING', 'CANCELLED'], PREPARING: ['READY', 'CANCELLED'], READY: ['COMPLETED'], COMPLETED: [], CANCELLED: [] };
const ACTIVE = ['PLACED', 'PREPARING', 'READY'];
const CATEGORIES = ['Breakfast', 'Meals', 'Snacks', 'Drinks', 'Desserts', 'Specials'];

export default function food(r, { store, live }) {
  const canteen = (id) => { const c = store.get('canteens', id); if (!c) throw new HttpError(404, 'NOT_FOUND', 'That canteen doesn’t exist.'); return c; };
  const pubOrder = (o) => {
    live.publish(`food:c:${o.canteenId}`, { id: o.id, status: o.status });
    live.publish(`food:u:${o.studentId}`, { id: o.id, status: o.status, token: o.token });
  };
  const forStaff = (s, cid) => { if (s.role !== 'admin' && !(s.role === 'canteen' && s.place === cid)) throw new HttpError(403, 'FORBIDDEN', 'This login is for a different canteen.'); };

  // ---------- students ----------
  r.get('/api/food/canteens', 'student', () => ({
    canteens: store.list('canteens').sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ id: c.id, name: c.name, place: c.place, open: c.open, sampleMenu: c.sampleMenu })),
  }));

  r.get('/api/food/canteens/:id/menu', 'student', ({ params }) => {
    const c = canteen(params.id);
    const items = store.list('menu', (m) => m.canteenId === c.id).sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
    return { canteen: { id: c.id, name: c.name, place: c.place, open: c.open, sampleMenu: c.sampleMenu }, items };
  });

  r.post('/api/food/orders', 'student', async ({ req, user }) => {
    const body = await readJson(req);
    const c = canteen(String(body.canteenId || ''));
    if (!c.open) throw new HttpError(409, 'CLOSED', `${c.name} isn’t taking orders right now.`);
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'EMPTY', 'Your cart is empty.');
    if (body.items.length > 30) throw new HttpError(400, 'INVALID', 'That’s too many different items for one order.');
    const lines = []; let total = 0;
    for (const it of body.items) {
      const m = store.get('menu', String(it.id || ''));
      if (!m || m.canteenId !== c.id) throw new HttpError(400, 'INVALID', 'One of the items is no longer on the menu. Refresh and try again.');
      if (!m.inStock) throw new HttpError(409, 'OUT_OF_STOCK', `${m.name} just went out of stock. Remove it to continue.`);
      const qty = need.int(it.qty, 'Quantity', { min: 1, max: 20 });
      lines.push({ menuId: m.id, name: m.name, price: m.price, qty, veg: m.veg }); total += m.price * qty;
    }
    const open = store.list('foodOrders', (o) => o.studentId === user.id && ACTIVE.includes(o.status));
    if (open.length >= 3) throw new HttpError(429, 'TOO_MANY', 'You already have 3 orders in progress. Collect one first.');
    const payment = takePayment(body.pay, total);
    const day = today();
    const token = `${c.prefix || 'F'}${store.next(`food:${c.id}:${day}`)}`;
    const note = String(body.note || '').trim().slice(0, 140);
    const o = store.put('foodOrders', {
      canteenId: c.id, canteenName: c.name, studentId: user.id, studentName: user.name, phone: user.phone, regNo: user.regNo,
      items: lines, total, token, day, status: 'PLACED', note, payment,
    });
    pubOrder(o);
    return { order: o };
  });

  r.get('/api/food/orders/mine', 'student', ({ user }) => ({
    orders: store.list('foodOrders', (o) => o.studentId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50),
  }));

  r.post('/api/food/orders/:id/cancel', 'student', ({ params, user }) => {
    const o = store.get('foodOrders', params.id);
    if (!o || o.studentId !== user.id) throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
    if (o.status !== 'PLACED') throw new HttpError(409, 'TOO_LATE', 'The kitchen has started this order, so it can’t be cancelled here. Ask at the counter.');
    pubOrder(store.patch('foodOrders', o.id, { status: 'CANCELLED', cancelledBy: 'student', payment: refund(o.payment) }));
    return { ok: true };
  });

  // ---------- canteen staff ----------
  r.get('/api/food/staff/board', 'staff', ({ staff, url }) => {
    const cid = staff.role === 'admin' ? (url.searchParams.get('canteen') || 'foodys') : staff.place;
    forStaff(staff, cid);
    const c = canteen(cid);
    const day = today();
    const orders = store.list('foodOrders', (o) => o.canteenId === cid && (o.day === day || ACTIVE.includes(o.status))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const done = orders.filter((o) => o.status === 'COMPLETED');
    return {
      canteen: c, orders,
      stats: { today: orders.filter((o) => o.day === day && o.status !== 'CANCELLED').length, completed: done.length, revenue: done.reduce((n, o) => n + o.total, 0) },
    };
  });

  r.post('/api/food/staff/orders/:id/status', 'staff', async ({ req, params, staff }) => {
    const { status } = await readJson(req);
    const o = store.get('foodOrders', params.id); if (!o) throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
    forStaff(staff, o.canteenId);
    if (!FLOW[o.status]?.includes(status)) throw new HttpError(409, 'BAD_STEP', `An order that is ${o.status.toLowerCase()} can’t move to ${String(status).toLowerCase()}.`);
    const u = store.patch('foodOrders', o.id, { status, ...(status === 'CANCELLED' ? { cancelledBy: 'canteen', payment: refund(o.payment) } : {}) });
    pubOrder(u);
    return { order: u };
  });

  r.post('/api/food/staff/verify', 'staff', async ({ req, staff, url }) => {
    const { token } = await readJson(req);
    const cid = staff.role === 'admin' ? (url.searchParams.get('canteen') || 'foodys') : staff.place;
    forStaff(staff, cid);
    const t = String(token || '').trim().toUpperCase();
    const o = store.list('foodOrders', (x) => x.canteenId === cid && x.day === today() && x.token === t)[0];
    if (!o) throw new HttpError(404, 'NOT_FOUND', `No order with token ${t || '—'} today.`);
    if (o.status !== 'READY') throw new HttpError(409, 'NOT_READY', `Token ${t} is ${o.status.toLowerCase()}, not ready yet.`);
    const u = store.patch('foodOrders', o.id, { status: 'COMPLETED' }); pubOrder(u);
    return { order: u };
  });

  r.get('/api/food/staff/menu', 'staff', ({ staff, url }) => {
    const cid = staff.role === 'admin' ? (url.searchParams.get('canteen') || 'foodys') : staff.place;
    forStaff(staff, cid);
    return { items: store.list('menu', (m) => m.canteenId === cid).sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name)) };
  });

  const menuInput = (b) => ({
    name: need.str(b.name, 'Name', { max: 60 }),
    category: need.oneOf(b.category, 'Category', CATEGORIES),
    price: need.int(b.price, 'Price', { min: 1, max: 5000 }),
    prepMins: need.int(b.prepMins ?? 10, 'Prep time', { min: 1, max: 120 }),
    veg: Boolean(b.veg), inStock: b.inStock !== false,
  });
  r.post('/api/food/staff/menu', 'staff', async ({ req, staff, url }) => {
    const cid = staff.role === 'admin' ? (url.searchParams.get('canteen') || 'foodys') : staff.place;
    forStaff(staff, cid);
    const m = store.put('menu', { canteenId: cid, ...menuInput(await readJson(req)) });
    store.patch('canteens', cid, { sampleMenu: false });
    live.publish(`food:menu:${cid}`, {}); return { item: m };
  });
  r.put('/api/food/staff/menu/:id', 'staff', async ({ req, params, staff }) => {
    const m = store.get('menu', params.id); if (!m) throw new HttpError(404, 'NOT_FOUND', 'Item not found.');
    forStaff(staff, m.canteenId);
    const b = await readJson(req);
    const patch = Object.keys(b).length === 1 && 'inStock' in b ? { inStock: Boolean(b.inStock) } : menuInput({ ...m, ...b });
    const u = store.patch('menu', m.id, patch);
    if (!('inStock' in b && Object.keys(b).length === 1)) store.patch('canteens', m.canteenId, { sampleMenu: false });
    live.publish(`food:menu:${m.canteenId}`, {}); return { item: u };
  });
  r.del('/api/food/staff/menu/:id', 'staff', ({ params, staff }) => {
    const m = store.get('menu', params.id); if (!m) throw new HttpError(404, 'NOT_FOUND', 'Item not found.');
    forStaff(staff, m.canteenId); store.remove('menu', m.id); store.patch('canteens', m.canteenId, { sampleMenu: false });
    live.publish(`food:menu:${m.canteenId}`, {}); return { ok: true };
  });
  r.put('/api/food/staff/canteen', 'staff', async ({ req, staff, url }) => {
    const cid = staff.role === 'admin' ? (url.searchParams.get('canteen') || 'foodys') : staff.place;
    forStaff(staff, cid);
    const b = await readJson(req);
    const c = store.patch('canteens', cid, { open: Boolean(b.open) });
    live.publish(`food:menu:${cid}`, {}); return { canteen: c };
  });

  // live topics this module allows
  return {
    topics(t, { user, staff }) {
      let m;
      if ((m = t.match(/^food:u:(.+)$/))) return user && user.id === m[1];
      if ((m = t.match(/^food:c:(.+)$/))) return staff && (staff.role === 'admin' || (staff.role === 'canteen' && staff.place === m[1]));
      if (/^food:menu:/.test(t)) return Boolean(user || staff);
      return false;
    },
    categories: CATEGORIES,
  };
}
