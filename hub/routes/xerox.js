// Xerox: PDF uploads, print options, server-side pricing (the Xerox team's rules), tokens and the shop queue.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError, readJson, readBody, need, today } from '../lib/http.js';
import { takePayment, refund } from '../lib/pay.js';

const FLOW = { QUEUED: ['PRINTING', 'CANCELLED'], PRINTING: ['READY', 'CANCELLED'], READY: ['COLLECTED'], COLLECTED: [], CANCELLED: [] };
const ACTIVE = ['QUEUED', 'PRINTING', 'READY'];
const MAX_FILE = 25 * 1024 * 1024;
const KEEP_FILES_DAYS = 3;

// Counts pages in a PDF without a library. Works for most PDFs; when a file hides its page tree
// (compressed object streams) it returns 0 and the student types the page count.
export function countPdfPages(buf) {
  const s = buf.toString('latin1');
  if (!s.startsWith('%PDF')) return -1;
  const counts = [...s.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map((m) => Number(m[1] || m[2]));
  if (counts.length) return Math.max(...counts);
  const pages = s.match(/\/Type\s*\/Page(?![s\w])/g);
  return pages ? pages.length : 0;
}

// Same rules as the Xerox team's pricing.js / place_order(): sheets per file, then rate by colour and sides, plus spiral.
export function priceFile(f, rates) {
  const printed = (f.to - f.from + 1) * f.copies;
  const sheets = f.sides === 'double' ? Math.ceil(printed / 2) : printed;
  const rate = rates[(f.color === 'bw' ? 'bw' : 'color') + (f.sides === 'single' ? 'Single' : 'Double')];
  return { sheets, cost: sheets * rate + (f.spiral ? rates.spiral : 0) };
}

export default function xerox(r, { store, live }) {
  const dir = path.join(store.dir, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const shop = (id) => { const s = store.get('shops', id); if (!s) throw new HttpError(404, 'NOT_FOUND', 'That shop doesn’t exist.'); return s; };
  const forStaff = (st, sid) => { if (st.role !== 'admin' && !(st.role === 'xerox' && st.place === sid)) throw new HttpError(403, 'FORBIDDEN', 'This login is for a different shop.'); };
  const pubOrder = (o) => { live.publish(`xerox:s:${o.shopId}`, { id: o.id, status: o.status }); live.publish(`xerox:u:${o.studentId}`, { id: o.id, status: o.status, token: o.token }); };
  const shopOut = (s) => ({ id: s.id, name: s.name, grp: s.grp, open: s.open, rates: s.rates });

  // Old uploads are deleted after a few days: students' documents shouldn't sit on the server.
  const sweep = () => {
    const cutoff = Date.now() - KEEP_FILES_DAYS * 86400e3;
    for (const f of store.list('xeroxFiles', (x) => new Date(x.createdAt).getTime() < cutoff)) {
      fs.rm(path.join(dir, f.id + '.pdf'), { force: true }, () => {}); store.remove('xeroxFiles', f.id);
    }
  };
  setInterval(sweep, 3600e3).unref();

  // ---------- students ----------
  r.get('/api/xerox/shops', 'student', () => ({ shops: store.list('shops').map(shopOut) }));

  r.post('/api/xerox/files', 'student', async ({ req, user }) => {
    if (!/application\/pdf/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'PDF_ONLY', 'Only PDF files can be printed. Save your document as PDF first.');
    const recent = store.list('xeroxFiles', (f) => f.studentId === user.id && Date.now() - new Date(f.createdAt).getTime() < 86400e3);
    if (recent.length >= 40) throw new HttpError(429, 'TOO_MANY', 'You’ve uploaded 40 files today. Try again tomorrow.');
    const buf = await readBody(req, MAX_FILE);
    const pages = countPdfPages(buf);
    if (pages < 0) throw new HttpError(400, 'NOT_PDF', 'That file isn’t a valid PDF.');
    let name = 'document.pdf';
    try { name = decodeURIComponent(String(req.headers['x-filename'] || name)); } catch { /* keep default */ }
    name = name.replace(/[\\/\r\n"]/g, '_').slice(0, 120) || 'document.pdf';
    const id = crypto.randomUUID();
    await fs.promises.writeFile(path.join(dir, id + '.pdf'), buf);
    const f = store.put('xeroxFiles', { id, studentId: user.id, name, size: buf.length, pages });
    return { file: { id: f.id, name: f.name, pages: f.pages, size: f.size } };
  });

  const readFiles = (list, user, s) => {
    if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'EMPTY', 'Add at least one PDF.');
    if (list.length > 10) throw new HttpError(400, 'INVALID', 'Up to 10 files per order.');
    return list.map((x, i) => {
      const f = store.get('xeroxFiles', String(x.fileId || ''));
      if (!f || f.studentId !== user.id) throw new HttpError(400, 'INVALID', `File ${i + 1} is no longer available. Upload it again.`);
      const pages = f.pages > 0 ? f.pages : need.int(x.pages, `Pages in ${f.name}`, { min: 1, max: 2000 });
      const from = need.int(x.from ?? 1, `First page of ${f.name}`, { min: 1, max: pages });
      const to = need.int(x.to ?? pages, `Last page of ${f.name}`, { min: from, max: pages });
      const line = {
        fileId: f.id, name: f.name, pages, from, to,
        copies: need.int(x.copies ?? 1, `Copies of ${f.name}`, { min: 1, max: 50 }),
        color: need.oneOf(x.color || 'bw', 'Colour', ['bw', 'color']),
        sides: need.oneOf(x.sides || 'single', 'Sides', ['single', 'double']),
        spiral: Boolean(x.spiral),
      };
      return { ...line, ...priceFile(line, s.rates) };
    });
  };

  r.post('/api/xerox/quote', 'student', async ({ req, user }) => {
    const b = await readJson(req); const s = shop(String(b.shopId || ''));
    const files = readFiles(b.files, user, s);
    return { files, total: files.reduce((n, f) => n + f.cost, 0) };
  });

  r.post('/api/xerox/orders', 'student', async ({ req, user }) => {
    const b = await readJson(req); const s = shop(String(b.shopId || ''));
    if (!s.open) throw new HttpError(409, 'CLOSED', `${s.name} is closed right now. Pick another shop.`);
    const files = readFiles(b.files, user, s);
    const active = store.list('xeroxOrders', (o) => o.studentId === user.id && ACTIVE.includes(o.status));
    if (active.length >= 3) throw new HttpError(429, 'TOO_MANY', 'You already have 3 print orders in progress. Collect one first.');
    const payment = takePayment(b.pay, files.reduce((n, f) => n + f.cost, 0));
    const day = today();
    const o = store.put('xeroxOrders', {
      shopId: s.id, shopName: s.name, studentId: user.id, studentName: user.name, phone: user.phone, regNo: user.regNo,
      files, total: files.reduce((n, f) => n + f.cost, 0), token: `${s.prefix}${store.next(`xerox:${s.id}:${day}`)}`, day,
      status: 'QUEUED', payment, note: String(b.note || '').trim().slice(0, 200),
    });
    pubOrder(o);
    return { order: o };
  });

  r.get('/api/xerox/orders/mine', 'student', ({ user }) => ({
    orders: store.list('xeroxOrders', (o) => o.studentId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50),
  }));

  r.post('/api/xerox/orders/:id/cancel', 'student', ({ params, user }) => {
    const o = store.get('xeroxOrders', params.id);
    if (!o || o.studentId !== user.id) throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
    if (o.status !== 'QUEUED') throw new HttpError(409, 'TOO_LATE', 'The shop has started printing, so it can’t be cancelled here.');
    pubOrder(store.patch('xeroxOrders', o.id, { status: 'CANCELLED', cancelledBy: 'student', payment: refund(o.payment) }));
    return { ok: true };
  });

  // ---------- shop staff ----------
  r.get('/api/xerox/staff/queue', 'staff', ({ staff, url }) => {
    const sid = staff.role === 'admin' ? (url.searchParams.get('shop') || 'prp') : staff.place;
    forStaff(staff, sid);
    const s = shop(sid); const day = today();
    const orders = store.list('xeroxOrders', (o) => o.shopId === sid && (o.day === day || ACTIVE.includes(o.status))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const done = orders.filter((o) => o.status === 'COLLECTED');
    return { shop: shopOut(s), orders, stats: { today: orders.filter((o) => o.day === day && o.status !== 'CANCELLED').length, collected: done.length, revenue: done.reduce((n, o) => n + o.total, 0) } };
  });

  r.post('/api/xerox/staff/orders/:id/status', 'staff', async ({ req, params, staff }) => {
    const { status } = await readJson(req);
    const o = store.get('xeroxOrders', params.id); if (!o) throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
    forStaff(staff, o.shopId);
    if (!FLOW[o.status]?.includes(status)) throw new HttpError(409, 'BAD_STEP', `An order that is ${o.status.toLowerCase()} can’t move to ${String(status).toLowerCase()}.`);
    const u = store.patch('xeroxOrders', o.id, { status, ...(status === 'CANCELLED' ? { cancelledBy: 'shop', payment: refund(o.payment) } : {}) }); pubOrder(u);
    return { order: u };
  });

  r.put('/api/xerox/staff/shop', 'staff', async ({ req, staff, url }) => {
    const sid = staff.role === 'admin' ? (url.searchParams.get('shop') || 'prp') : staff.place;
    forStaff(staff, sid);
    const b = await readJson(req); const s = shop(sid); const patch = {};
    if ('open' in b) patch.open = Boolean(b.open);
    if (b.rates) {
      patch.rates = {};
      for (const k of ['bwSingle', 'bwDouble', 'colorSingle', 'colorDouble', 'spiral']) patch.rates[k] = need.int(b.rates[k] ?? s.rates[k], 'Price', { min: 0, max: 500 });
    }
    return { shop: shopOut(store.patch('shops', sid, patch)) };
  });

  // Files: the owning student, or staff of the shop an order for it went to.
  r.get('/api/xerox/files/:id', 'any', ({ params, user, staff, res }) => {
    const f = store.get('xeroxFiles', params.id); if (!f) throw new HttpError(404, 'NOT_FOUND', 'This file has been deleted (files are kept for 3 days).');
    let ok = user && f.studentId === user.id;
    if (!ok && staff) ok = staff.role === 'admin' || store.list('xeroxOrders', (o) => o.shopId === staff.place && o.files.some((x) => x.fileId === f.id)).length > 0;
    if (!ok) throw new HttpError(403, 'FORBIDDEN', 'You can’t open this file.');
    const p = path.join(dir, f.id + '.pdf');
    if (!fs.existsSync(p)) throw new HttpError(404, 'NOT_FOUND', 'This file has been deleted.');
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(f.name)}"`, 'Cache-Control': 'private, no-store' });
    fs.createReadStream(p).pipe(res);
    return r.HANDLED;
  });

  return {
    topics(t, { user, staff }) {
      let m;
      if ((m = t.match(/^xerox:u:(.+)$/))) return user && user.id === m[1];
      if ((m = t.match(/^xerox:s:(.+)$/))) return staff && (staff.role === 'admin' || (staff.role === 'xerox' && staff.place === m[1]));
      return false;
    },
    sweep,
  };
}
