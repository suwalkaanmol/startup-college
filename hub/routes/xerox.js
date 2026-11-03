// Xerox: each shop has its own database (files, orders, chats). Students upload PDF, Word, PowerPoint or images,
// choose pages and print options, pay the shop, and collect with a token. Shops work through the queue and chat.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError, readJson, readBody, need, today } from '../lib/http.js';
import { takePayment, refund } from '../lib/pay.js';
import { readZipEntry } from '../lib/zip.js';
import { receiptCode } from '../lib/receipt.js';

const FLOW = { QUEUED: ['PRINTING', 'READY', 'CANCELLED'], PRINTING: ['READY', 'CANCELLED'], READY: ['COLLECTED'], COLLECTED: [], CANCELLED: [] };
const ACTIVE = ['QUEUED', 'PRINTING', 'READY'];
const MAX_FILE = 25 * 1024 * 1024;
const KEEP_FILES_DAYS = 3;
export const NUP = [1, 2, 3, 4, 6];
export const RATE_KEYS = ['bwSingle', 'bwDouble', 'colorSingle', 'colorDouble', 'a3BwSingle', 'a3BwDouble', 'a3ColorSingle', 'a3ColorDouble', 'spiral', 'staple'];

const TYPES = {
  'application/pdf': { kind: 'pdf', ext: 'pdf' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'docx', ext: 'docx' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { kind: 'pptx', ext: 'pptx' },
  'image/jpeg': { kind: 'image', ext: 'jpg' }, 'image/png': { kind: 'image', ext: 'png' }, 'image/webp': { kind: 'image', ext: 'webp' },
};

// Counts pages in a PDF without a library. When a file hides its page tree (compressed object streams)
// it returns 0 and the count from the student's browser (or the student) is used instead.
export function countPdfPages(buf) {
  const s = buf.toString('latin1');
  if (!s.startsWith('%PDF')) return -1;
  const counts = [...s.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map((m) => Number(m[1] || m[2]));
  if (counts.length) return Math.max(...counts);
  const pages = s.match(/\/Type\s*\/Page(?![s\w])/g);
  return pages ? pages.length : 0;
}

// Checks a file really is what it says and counts its pages (Word: <Pages>, PowerPoint: <Slides>, image: 1).
export function inspectFile(buf, kind) {
  const head = buf.subarray(0, 12).toString('latin1');
  if (kind === 'pdf') { const n = countPdfPages(buf); if (n < 0) return null; return { pages: n }; }
  if (kind === 'image') {
    const ok = head.startsWith('\x89PNG') || (buf[0] === 0xff && buf[1] === 0xd8) || (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP');
    return ok ? { pages: 1 } : null;
  }
  if (!head.startsWith('PK')) return null;
  const main = kind === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml';
  try {
    if (!readZipEntry(buf, main)) return null;
    const app = readZipEntry(buf, 'docProps/app.xml')?.toString('utf8') || '';
    const m = app.match(kind === 'docx' ? /<Pages>(\d+)<\/Pages>/ : /<Slides>(\d+)<\/Slides>/);
    return { pages: m ? Number(m[1]) : 0 };
  } catch { return null; }
}

// Price of one file: chosen pages, N pages per side, one or both sides, copies, paper size, binding per copy.
export function priceFile(f, rates) {
  const selected = f.ranges.reduce((n, r) => n + (r.to - r.from + 1), 0);
  const faces = Math.ceil(selected / f.nup);
  const perCopy = f.sides === 'double' ? Math.ceil(faces / 2) : faces;
  const sheets = perCopy * f.copies;
  const key = (f.size === 'A3' ? 'a3' : '') + (f.color === 'bw' ? (f.size === 'A3' ? 'Bw' : 'bw') : (f.size === 'A3' ? 'Color' : 'color')) + (f.sides === 'single' ? 'Single' : 'Double');
  const binding = f.binding === 'spiral' ? rates.spiral : f.binding === 'staple' ? rates.staple : 0;
  return { selected, sheets, cost: sheets * rates[key] + binding * f.copies };
}

export default function xerox(r, { store, places, live, cfg }) {
  const withReceipt = (o) => ({ ...o, receipt: receiptCode(cfg.jwtSecret, 'xerox', o.shopId, o) });
  const db = (sid) => places.get('xerox', sid);
  const filesDir = (sid) => { const d = places.dir('xerox', sid) + '-uploads'; fs.mkdirSync(d, { recursive: true }); return d; };
  const shop = (id) => { const s = store.get('shops', id); if (!s) throw new HttpError(404, 'NOT_FOUND', 'That shop doesn’t exist.'); return s; };
  const shopOut = (s) => ({ id: s.id, name: s.name, grp: s.grp, open: s.open, upi: s.upi || '', rates: s.rates });
  const forStaff = (st, sid) => { if (st.role !== 'admin' && !(st.role === 'xerox' && st.place === sid)) throw new HttpError(403, 'FORBIDDEN', 'This login is for a different shop.'); };
  const staffShop = (staff, url) => { const sid = staff.role === 'admin' ? (url.searchParams.get('shop') || 'prp') : staff.place; forStaff(staff, sid); return shop(sid); };
  const pub = (o) => { live.publish(`xerox:s:${o.shopId}`, { id: o.id, status: o.status }); live.publish(`xerox:u:${o.studentId}`, { id: o.id, status: o.status, token: o.token, shop: o.shopName }); };
  const fileOut = (f) => ({ id: f.id, shopId: f.shopId, name: f.name, kind: f.kind, size: f.size, pages: f.pages, pagesKnown: f.pagesKnown });

  // Students' documents are deleted after a few days.
  const sweep = () => {
    const cutoff = Date.now() - KEEP_FILES_DAYS * 86400e3;
    for (const s of store.list('shops')) {
      const d = db(s.id);
      for (const f of d.list('files', (x) => new Date(x.createdAt).getTime() < cutoff)) { fs.rm(path.join(filesDir(s.id), `${f.id}.${f.ext}`), { force: true }, () => {}); d.remove('files', f.id); }
    }
  };
  setInterval(sweep, 3600e3).unref();

  // ---------- students ----------
  r.get('/api/xerox/shops', 'student', () => ({ shops: store.list('shops').map(shopOut) }));

  r.post('/api/xerox/shops/:sid/files', 'student', async ({ req, params, user }) => {
    const s = shop(params.sid); const d = db(s.id);
    const type = TYPES[String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()];
    if (!type) throw new HttpError(415, 'TYPE', 'Upload a PDF, Word (.docx), PowerPoint (.pptx) or an image (JPG, PNG).');
    if (d.list('files', (f) => f.studentId === user.id && Date.now() - new Date(f.createdAt).getTime() < 86400e3).length >= 40) throw new HttpError(429, 'TOO_MANY', 'You’ve uploaded 40 files to this shop today. Try again tomorrow.');
    const buf = await readBody(req, MAX_FILE);
    const info = inspectFile(buf, type.kind);
    if (!info) throw new HttpError(400, 'BAD_FILE', `That file isn’t a valid ${type.kind === 'image' ? 'image' : type.kind.toUpperCase()}.`);
    let pages = info.pages;
    const hinted = Number(req.headers['x-pages']);
    if (!pages && Number.isInteger(hinted) && hinted > 0 && hinted <= 2000 && type.kind === 'pdf') pages = hinted; // counted by pdf.js in the browser
    let name = `document.${type.ext}`;
    try { name = decodeURIComponent(String(req.headers['x-filename'] || name)); } catch { /* keep default */ }
    name = name.replace(/[\\/\r\n"]/g, '_').slice(0, 120) || `document.${type.ext}`;
    const id = crypto.randomUUID();
    await fs.promises.writeFile(path.join(filesDir(s.id), `${id}.${type.ext}`), buf);
    const f = d.put('files', { id, shopId: s.id, studentId: user.id, name, kind: type.kind, ext: type.ext, mime: Object.keys(TYPES).find((k) => TYPES[k] === type), size: buf.length, pages, pagesKnown: pages > 0 });
    return { file: fileOut(f) };
  });

  r.del('/api/xerox/shops/:sid/files/:id', 'student', ({ params, user }) => {
    const d = db(shop(params.sid).id); const f = d.get('files', params.id);
    if (!f || f.studentId !== user.id) throw new HttpError(404, 'NOT_FOUND', 'File not found.');
    if (d.list('orders', (o) => o.files.some((x) => x.fileId === f.id) && ACTIVE.includes(o.status)).length) return { ok: true }; // still needed by an order
    fs.rm(path.join(filesDir(params.sid), `${f.id}.${f.ext}`), { force: true }, () => {}); d.remove('files', f.id);
    return { ok: true };
  });

  const readFiles = (list, user, s) => {
    if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'EMPTY', 'Add at least one file.');
    if (list.length > 10) throw new HttpError(400, 'INVALID', 'Up to 10 files per order.');
    const d = db(s.id);
    return list.map((x, i) => {
      const f = d.get('files', String(x.fileId || ''));
      if (!f || f.studentId !== user.id) throw new HttpError(400, 'INVALID', `File ${i + 1} is no longer available. Upload it again.`);
      const pages = f.pagesKnown ? f.pages : need.int(x.pages, `Number of pages in ${f.name}`, { min: 1, max: 2000 });
      const rs = Array.isArray(x.ranges) && x.ranges.length ? x.ranges : [{ from: 1, to: pages }];
      if (rs.length > 10) throw new HttpError(400, 'INVALID', `Use up to 10 page ranges for ${f.name}.`);
      const ranges = rs.map((rg, j) => {
        const from = need.int(rg.from, `Range ${j + 1} start in ${f.name}`, { min: 1, max: pages });
        return { from, to: need.int(rg.to, `Range ${j + 1} end in ${f.name}`, { min: from, max: pages }) };
      });
      const line = {
        fileId: f.id, name: f.name, kind: f.kind, pages, ranges,
        copies: need.int(x.copies ?? 1, `Copies of ${f.name}`, { min: 1, max: 50 }),
        color: need.oneOf(x.color || 'bw', 'Colour', ['bw', 'color']),
        sides: need.oneOf(x.sides || 'single', 'Sides', ['single', 'double']),
        size: need.oneOf(x.size || 'A4', 'Paper size', ['A4', 'A3']),
        nup: need.oneOf(Number(x.nup || 1), 'Pages per side', NUP),
        arrangement: need.oneOf(x.arrangement || 'horizontal', 'Page arrangement', ['horizontal', 'vertical']),
        binding: need.oneOf(x.binding || 'none', 'Binding', ['none', 'spiral', 'staple']),
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
    const b = await readJson(req); const s = shop(String(b.shopId || '')); const d = db(s.id);
    if (!s.open) throw new HttpError(409, 'CLOSED', `${s.name} is closed right now. Pick another shop.`);
    if (!b.agree) throw new HttpError(400, 'AGREE', 'Agree to the terms and to your files being sent to the shop for printing.');
    const files = readFiles(b.files, user, s);
    if (d.list('orders', (o) => o.studentId === user.id && ACTIVE.includes(o.status)).length >= 3) throw new HttpError(429, 'TOO_MANY', `You already have 3 print orders in progress at ${s.name}. Collect one first.`);
    const total = files.reduce((n, f) => n + f.cost, 0);
    const payment = takePayment(b.pay, total, { name: s.name, upi: s.upi });
    const day = today();
    const o = d.put('orders', {
      shopId: s.id, shopName: s.name, studentId: user.id, studentName: user.name, phone: user.phone, regNo: user.regNo,
      files, total, token: `${s.prefix}${d.next(`token:${day}`)}`, day, status: 'QUEUED', payment, note: String(b.note || '').trim().slice(0, 200),
    });
    pub(o);
    return { order: withReceipt(o) };
  });

  const mine = (uid) => store.list('shops').flatMap((s) => db(s.id).list('orders', (o) => o.studentId === uid));
  r.get('/api/xerox/orders/mine', 'student', ({ user }) => ({ orders: mine(user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60).map(withReceipt) }));

  r.post('/api/xerox/orders/:id/cancel', 'student', ({ params, user }) => {
    const o = mine(user.id).find((x) => x.id === params.id);
    if (!o) throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
    if (o.status !== 'QUEUED') throw new HttpError(409, 'TOO_LATE', 'The shop has started printing, so it can’t be cancelled here.');
    pub(db(o.shopId).patch('orders', o.id, { status: 'CANCELLED', cancelledBy: 'student', payment: refund(o.payment) }));
    return { ok: true };
  });

  // Chat with a shop: one thread per student per shop. Only the student and that shop can read it.
  const thread = (sid, uid) => db(sid).list('messages', (m) => m.studentId === uid).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-200);
  const pubChat = (sid, uid) => { live.publish(`xerox:chat:${sid}:${uid}`, {}); live.publish(`xerox:s:${sid}`, { chat: true }); };
  r.get('/api/xerox/shops/:sid/chat', 'student', ({ params, user }) => {
    const s = shop(params.sid); const d = db(s.id);
    for (const m of d.list('messages', (x) => x.studentId === user.id && x.from === 'shop' && !x.seen)) d.patch('messages', m.id, { seen: true });
    return { shop: shopOut(s), messages: thread(s.id, user.id) };
  });
  r.post('/api/xerox/shops/:sid/chat', 'student', async ({ req, params, user }) => {
    const s = shop(params.sid); const text = need.str((await readJson(req)).text, 'Message', { max: 500 });
    const last = mine(user.id).filter((o) => o.shopId === s.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    db(s.id).put('messages', { studentId: user.id, studentName: user.name, token: last?.token || '', from: 'student', text, seen: false });
    pubChat(s.id, user.id); return { messages: thread(s.id, user.id) };
  });

  // ---------- shop owners ----------
  r.get('/api/xerox/staff/queue', 'staff', ({ staff, url }) => {
    const s = staffShop(staff, url); const d = db(s.id); const day = today();
    const orders = d.list('orders', (o) => o.day === day || ACTIVE.includes(o.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const done = orders.filter((o) => o.status === 'COLLECTED' && o.day === day);
    const unread = d.list('messages', (m) => m.from === 'student' && !m.seen).length;
    return { shop: shopOut(s), orders, unread, stats: { today: orders.filter((o) => o.day === day && o.status !== 'CANCELLED').length, waiting: orders.filter((o) => o.status === 'QUEUED').length, collected: done.length, revenue: orders.filter((o) => o.day === day && o.status !== 'CANCELLED').reduce((n, o) => n + o.total, 0) } };
  });

  r.post('/api/xerox/staff/orders/:id/status', 'staff', async ({ req, params, staff, url }) => {
    const { status } = await readJson(req);
    const s = staffShop(staff, url); const d = db(s.id); const o = d.get('orders', params.id);
    if (!o) throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
    if (!FLOW[o.status]?.includes(status)) throw new HttpError(409, 'BAD_STEP', `An order that is ${o.status.toLowerCase()} can’t move to ${String(status).toLowerCase()}.`);
    const patch = { status, [`${status.toLowerCase()}At`]: new Date().toISOString() };
    if (status === 'CANCELLED') Object.assign(patch, { cancelledBy: 'shop', payment: refund(o.payment) });
    const u = d.patch('orders', o.id, patch); pub(u);
    return { order: u };
  });

  r.post('/api/xerox/staff/verify', 'staff', async ({ req, staff, url }) => {
    const s = staffShop(staff, url); const d = db(s.id);
    const token = String((await readJson(req)).token || '').trim().toUpperCase();
    const o = d.list('orders', (x) => x.token === token && (x.day === today() || ACTIVE.includes(x.status))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!o) throw new HttpError(404, 'NOT_FOUND', `No order with token ${token} at ${s.name}.`);
    if (o.status === 'COLLECTED') throw new HttpError(409, 'DONE', `${token} was already collected.`);
    if (o.status === 'CANCELLED') throw new HttpError(409, 'CANCELLED', `${token} was cancelled.`);
    if (o.status !== 'READY') throw new HttpError(409, 'NOT_READY', `${token} isn’t marked completed yet.`);
    const u = d.patch('orders', o.id, { status: 'COLLECTED', collectedAt: new Date().toISOString() }); pub(u);
    return { order: u };
  });

  r.put('/api/xerox/staff/shop', 'staff', async ({ req, staff, url }) => {
    const s = staffShop(staff, url); const b = await readJson(req); const patch = {};
    if ('open' in b) patch.open = Boolean(b.open);
    if ('upi' in b) { const u = String(b.upi || '').trim(); if (u && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(u)) throw new HttpError(400, 'INVALID', 'Enter a UPI ID like ttxerox@okaxis.'); patch.upi = u; }
    if (b.rates) { patch.rates = {}; for (const k of RATE_KEYS) patch.rates[k] = need.int(b.rates[k] ?? s.rates[k], 'Price', { min: 0, max: 1000 }); }
    return { shop: shopOut(store.patch('shops', s.id, patch)) };
  });

  r.get('/api/xerox/staff/chats', 'staff', ({ staff, url }) => {
    const s = staffShop(staff, url); const by = new Map();
    for (const m of db(s.id).list('messages').sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const t = by.get(m.studentId) || { studentId: m.studentId, name: m.studentName, token: '', last: '', at: '', unread: 0 };
      if (m.token) t.token = m.token; t.last = m.text; t.at = m.createdAt; if (m.from === 'student' && !m.seen) t.unread++;
      by.set(m.studentId, t);
    }
    return { threads: [...by.values()].sort((a, b) => b.at.localeCompare(a.at)) };
  });
  r.get('/api/xerox/staff/chats/:uid', 'staff', ({ params, staff, url }) => {
    const s = staffShop(staff, url); const d = db(s.id);
    for (const m of d.list('messages', (x) => x.studentId === params.uid && x.from === 'student' && !x.seen)) d.patch('messages', m.id, { seen: true });
    return { messages: thread(s.id, params.uid) };
  });
  r.post('/api/xerox/staff/chats/:uid', 'staff', async ({ req, params, staff, url }) => {
    const s = staffShop(staff, url); const text = need.str((await readJson(req)).text, 'Reply', { max: 500 });
    const prev = thread(s.id, params.uid); if (!prev.length) throw new HttpError(404, 'NOT_FOUND', 'That chat doesn’t exist.');
    db(s.id).put('messages', { studentId: params.uid, studentName: prev[0].studentName, token: '', from: 'shop', text, seen: false });
    pubChat(s.id, params.uid); return { messages: thread(s.id, params.uid) };
  });

  // Files: the student who uploaded it, or the owner of that shop (only once it is part of an order).
  r.get('/api/xerox/shops/:sid/files/:id', 'any', ({ params, user, staff, res, url }) => {
    const s = shop(params.sid); const d = db(s.id); const f = d.get('files', params.id);
    if (!f) throw new HttpError(404, 'NOT_FOUND', `This file has been deleted (files are kept for ${KEEP_FILES_DAYS} days).`);
    let ok = user && f.studentId === user.id;
    if (!ok && staff) ok = (staff.role === 'admin' || (staff.role === 'xerox' && staff.place === s.id)) && d.list('orders', (o) => o.files.some((x) => x.fileId === f.id)).length > 0;
    if (!ok) throw new HttpError(403, 'FORBIDDEN', 'You can’t open this file.');
    const p = path.join(filesDir(s.id), `${f.id}.${f.ext}`);
    if (!fs.existsSync(p)) throw new HttpError(404, 'NOT_FOUND', 'This file has been deleted.');
    const dl = url.searchParams.get('download') === '1';
    res.writeHead(200, { 'Content-Type': f.mime, 'Content-Disposition': `${dl ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'Cache-Control': 'private, no-store' });
    fs.createReadStream(p).pipe(res);
    return r.HANDLED;
  });

  return {
    topics(t, { user, staff }) {
      let m;
      if ((m = t.match(/^xerox:u:(.+)$/))) return user && user.id === m[1];
      if ((m = t.match(/^xerox:chat:([^:]+):(.+)$/))) return user && user.id === m[2];
      if ((m = t.match(/^xerox:s:(.+)$/))) return staff && (staff.role === 'admin' || (staff.role === 'xerox' && staff.place === m[1]));
      return false;
    },
    findReceipt: (code) => { for (const s of store.list('shops')) for (const o of db(s.id).list('orders')) if (receiptCode(cfg.jwtSecret, 'xerox', s.id, o) === code) return { kind: 'Xerox', place: s.name, o, lines: o.files.map((f) => `${f.name} (${f.sheets} sheets)`) }; return null; },
    studentOrders: (uid) => mine(uid).map((o) => ({ source: 'xerox', id: o.id, title: o.shopName, token: o.token, status: o.status, amount: o.total, at: o.createdAt, detail: o.files.map((i) => i.name).join(', ') })),
    forgetStudent(uid) {
      for (const s of store.list('shops')) {
        const d = db(s.id);
        for (const f of d.list('files', (x) => x.studentId === uid)) { fs.rm(path.join(filesDir(s.id), `${f.id}.${f.ext}`), { force: true }, () => {}); d.remove('files', f.id); }
        for (const m of d.list('messages', (x) => x.studentId === uid)) d.remove('messages', m.id);
      }
    },
    count: () => store.list('shops').reduce((n, s) => n + db(s.id).count('orders'), 0),
    sweep,
  };
}
