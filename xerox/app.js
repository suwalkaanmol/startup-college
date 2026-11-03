// Xerox for students: pick a shop, add PDF / Word / PowerPoint / images, choose pages and print options
// (same for all files or per file), preview how it will print, pay the shop by UPI, collect with a token, chat with the shop.
import { $, $$, esc, money, when, api, toast, requireStudent, live, bar, pill, sheet, paySheet, liveInvoice, clock } from '../hub/web/kit.js';

const user = await requireStudent();
const app = $('#app');
const actions = bar({ section: 'xerox', title: 'Xerox' });
actions.innerHTML = '<a class="btn ghost sm" href="staff.html">🔒 <span class="hide-sm">Owner login</span></a>';

let shops = [], shop = null, files = [], orders = [], quote = null, view = 'new', same = true, note = '', agree = false;
const DEFAULT = () => ({ color: 'bw', sides: 'single', size: 'A4', nup: 1, arrangement: 'horizontal', copies: 1, binding: 'none', all: true, ranges: [] });
let shared = DEFAULT();
const ACCEPT = '.pdf,.docx,.pptx,.jpg,.jpeg,.png,.webp,application/pdf,image/*';
const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const KIND_LABEL = { pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', image: 'Image' };

app.innerHTML = `
  <section class="hero xerox"><h2>Print without the queue</h2>
    <p>Upload your files, pick pages and print options, pay the shop by UPI, and pick up your prints with a token. Shops print only paid orders.</p></section>
  <div class="seg" role="tablist" aria-label="Xerox" style="margin-top:16px">
    <button data-view="new" aria-pressed="true">New order</button><button data-view="orders" aria-pressed="false">My orders</button><button data-view="chat" aria-pressed="false">Chat</button>
  </div>
  <div id="active" class="stack" style="margin-top:14px"></div>
  <section id="v-new"></section><section id="v-orders" hidden></section><section id="v-chat" hidden></section>`;

function setView(v) {
  view = v; $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  for (const k of ['new', 'orders', 'chat']) $('#v-' + k).hidden = k !== v;
  if (v === 'orders') renderOrders(); if (v === 'chat') renderChat(); if (v === 'new') renderNew();
}
app.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });

/* ---------- step 1: shop ---------- */
function shopPicker() {
  const grp = (g, title) => `<h3 class="cat-h">${title}</h3><div class="grid-cards">${shops.filter((s) => s.grp === g).map((s) => `<button class="card canteen-card" data-shop="${s.id}" ${s.open ? '' : 'aria-disabled="true"'}>
      <div class="row between"><b style="font-size:16px">${esc(s.name)}</b>${s.open ? '<span class="pill ok">Open</span>' : '<span class="pill bad">Closed</span>'}</div>
      <p class="muted small">B&amp;W from ${money(s.rates.bwSingle)}/side · colour ${money(s.rates.colorSingle)}</p></button>`).join('')}</div>`;
  return `<div class="section-h"><h2>New print order</h2><p class="muted small">Choose a shop to start</p></div>${grp('main', 'Main campus')}${grp('hostel', 'Men’s hostel')}`;
}

/* ---------- step 2: files and options ---------- */
const optsOf = (f) => (same ? shared : f.opt);
const maxPages = (f) => f.pages || Number(f.manualPages) || 0;
const rangesOf = (f) => (f.opt.all || !f.opt.ranges.length ? [{ from: 1, to: Math.max(1, maxPages(f)) }] : f.opt.ranges);
const payload = (f) => { const o = optsOf(f); return { fileId: f.id, pages: f.pagesKnown ? undefined : Number(f.manualPages) || undefined, ranges: rangesOf(f), copies: o.copies, color: o.color, sides: o.sides, size: o.size, nup: o.nup, arrangement: o.arrangement, binding: o.binding }; };
const seg = (name, val, list, key) => `<div class="seg" role="group" aria-label="${name}">${list.map(([v, l]) => `<button type="button" data-set="${key}:${v}" aria-pressed="${String(val) === String(v)}">${l}</button>`).join('')}</div>`;

// Print settings: key 'all' (shared by every file) or 'f<index>' (one file).
function optionsForm(o, key) {
  return `<div class="opt-grid">
      <div><span class="label">Colour</span>${seg('Colour', o.color, [['bw', 'B&amp;W'], ['color', 'Colour']], key + ':color')}</div>
      <div><span class="label">Sides</span>${seg('Sides', o.sides, [['single', 'One side'], ['double', 'Front &amp; back']], key + ':sides')}</div>
      <div><span class="label">Paper</span>${seg('Paper size', o.size, [['A4', 'A4'], ['A3', 'A3']], key + ':size')}</div>
      <div><label class="label" for="nup-${key}">Pages per side</label><select id="nup-${key}" data-sel="${key}:nup">${[1, 2, 3, 4, 6].map((n) => `<option value="${n}" ${o.nup === n ? 'selected' : ''}>${n === 1 ? '1 (normal)' : `${n}-in-1`}</option>`).join('')}</select></div>
      ${o.nup > 1 ? `<div><span class="label">Page arrangement</span>${seg('Arrangement', o.arrangement, [['horizontal', 'Side by side'], ['vertical', 'Top to bottom']], key + ':arrangement')}</div>` : ''}
      <div><label class="label" for="cp-${key}">Copies</label><input id="cp-${key}" type="number" min="1" max="50" inputmode="numeric" data-num="${key}:copies" value="${o.copies}"></div>
      <div><span class="label">Binding</span>${seg('Binding', o.binding, [['none', 'None'], ['spiral', 'Spiral'], ['staple', 'Staple']], key + ':binding')}</div>
    </div>`;
}
// Which pages of one file: all, or several ranges like 4–18 and 25–39.
function pagesForm(f, i) {
  const n = maxPages(f), key = `f${i}`;
  return `<div class="field"><span class="label">Pages</span>${seg('Pages', f.opt.all ? 'all' : 'pick', [['all', `All${n ? ` (${n})` : ''}`], ['pick', 'Choose pages']], key + ':all')}
    ${f.opt.all ? '' : `<div class="stack" style="gap:6px;margin-top:8px">${f.opt.ranges.map((r, j) => `<div class="row" style="gap:8px;align-items:end">
        <label class="small grow">Range ${j + 1}: from<input type="number" min="1" max="${n}" data-range="${key}:${j}:from" value="${r.from}"></label>
        <label class="small grow">to<input type="number" min="1" max="${n}" data-range="${key}:${j}:to" value="${r.to}"></label>
        ${j ? `<button type="button" class="icon-btn" data-delrange="${key}:${j}" aria-label="Remove range ${j + 1}">✕</button>` : ''}</div>`).join('')}
      <button type="button" class="btn ghost sm" data-addrange="${key}" style="justify-self:start">+ Add another range</button><p class="muted small">For example pages 4–18 and 25–39 of a 50-page file.</p></div>`}</div>`;
}

function fileCard(f, i) {
  const q = quote?.files?.find((x) => x.fileId === f.id);
  return `<article class="card stack file-card" style="gap:10px">
    <div class="row between" style="gap:10px"><div class="grow" style="min-width:0"><b style="overflow-wrap:anywhere">${esc(f.name)}</b>
      <p class="muted small">${f.uploading ? 'Uploading…' : `${KIND_LABEL[f.kind] || ''} · ${f.pages ? `${f.pages} page${f.pages === 1 ? '' : 's'}` : 'pages not detected'}${q ? ` · ${q.sheets} sheet${q.sheets === 1 ? '' : 's'} · <b>${money(q.cost)}</b>` : ''}`}</p></div>
      <button class="btn ghost sm" data-remove="${i}">Remove file</button></div>
    ${!f.uploading && !f.pagesKnown ? `<div class="field"><label for="mp-${i}">How many pages is this file?</label><input id="mp-${i}" type="number" min="1" inputmode="numeric" data-manual="${i}" value="${esc(f.manualPages || '')}" placeholder="Open it and check the page count"></div>` : ''}
    ${f.uploading ? '' : `${same ? '' : optionsForm(f.opt, `f${i}`)}${maxPages(f) ? pagesForm(f, i) : ''}<button class="btn ghost sm" data-preview="${i}" style="justify-self:start">👁 Preview how it will print</button>`}
  </article>`;
}

function renderNew() {
  const box = $('#v-new');
  if (!shop) { box.innerHTML = shopPicker(); return; }
  const ready = files.filter((f) => !f.uploading);
  box.innerHTML = `<div class="cols" style="margin-top:16px">
    <div class="stack">
      <div class="card row between"><div><b style="font-size:18px">${esc(shop.name)}</b><p class="small ${shop.open ? '' : 'err'}">${shop.open ? 'Open now' : 'Closed right now'}</p></div><button class="btn ghost sm" id="change-shop">Choose a different shop</button></div>
      <label class="drop" id="drop" for="pick"><b>Add files</b><span>PDF, Word (.docx), PowerPoint (.pptx) or images · up to 25 MB each, 10 per order</span><input type="file" id="pick" accept="${ACCEPT}" multiple hidden></label>
      ${files.length > 1 ? `<label class="check"><input type="checkbox" id="same" ${same ? 'checked' : ''}> Use the same print settings for every file</label>` : ''}
      ${files.length && same ? `<div class="card"><h3 style="margin-bottom:8px">Print settings${files.length > 1 ? ' for all files' : ''}</h3>${optionsForm(shared, 'all')}</div>` : ''}
      <div class="stack" id="files">${files.map(fileCard).join('')}</div>
    </div>
    <aside class="sticky-side stack" id="side">${sideHtml(ready)}</aside></div>`;
}

function sideHtml(ready) {
  const r = shop.rates;
  const bindOf = (f) => (f.binding === 'spiral' ? r.spiral : f.binding === 'staple' ? r.staple : 0) * f.copies;
  const sum = (list, fn) => list.reduce((n, f) => n + fn(f), 0);
  let price = `<p class="muted small">${ready.length ? 'Working out the price…' : 'Add a file to see the price.'}</p>`;
  if (quote?.error) price = `<p class="err">${esc(quote.error)}</p>`;
  else if (quote) {
    const bw = quote.files.filter((f) => f.color === 'bw'), col = quote.files.filter((f) => f.color === 'color');
    price = `<div class="row between small"><span>B&amp;W: ${sum(bw, (f) => f.sheets)} sheets</span><b>${money(sum(bw, (f) => f.cost - bindOf(f)))}</b></div>
      <div class="row between small"><span>Colour: ${sum(col, (f) => f.sheets)} sheets</span><b>${money(sum(col, (f) => f.cost - bindOf(f)))}</b></div>
      <div class="row between small"><span>Binding</span><b>${money(sum(quote.files, bindOf))}</b></div><div class="divider"></div>
      <div class="row between"><b>Total</b><b class="num" style="font-size:22px">${money(quote.total)}</b></div>`;
  }
  return `<div class="card stack" style="gap:8px"><h3>Price details</h3>${price}
      <div class="field"><label for="note">Note for the shop (optional)</label><input id="note" maxlength="200" value="${esc(note)}" placeholder="Print the cover in colour, staple each set…"></div>
      <label class="check small"><input type="checkbox" id="agree" ${agree ? 'checked' : ''}> I agree to the terms and to my files being sent to ${esc(shop.name)} for printing. Files are deleted after 3 days.</label>
      <p class="err" id="order-err" role="alert"></p>
      <button class="btn primary block" id="place" ${ready.length && quote && !quote.error && shop.open && files.every((f) => !f.uploading) ? '' : 'disabled'}>${shop.open ? (quote?.total ? `Pay ${money(quote.total)} & print` : 'Pay & print') : `${esc(shop.name)} is closed`}</button></div>
    <div class="card small"><h3 style="margin-bottom:6px">Prices at ${esc(shop.name)}</h3>
      ${[['B&W, one side', r.bwSingle], ['B&W, front & back', r.bwDouble], ['Colour, one side', r.colorSingle], ['Colour, front & back', r.colorDouble], ['A3 B&W, one side', r.a3BwSingle], ['A3 colour, one side', r.a3ColorSingle]].map(([l, v]) => `<div class="row between"><span>${l}</span><b>${money(v)} / sheet</b></div>`).join('')}
      <div class="row between"><span>Spiral binding</span><b>${money(r.spiral)} / copy</b></div><div class="row between"><span>Staple</span><b>${money(r.staple)} / copy</b></div></div>`;
}

let qTimer;
function requote() {
  clearTimeout(qTimer);
  const ready = files.filter((f) => !f.uploading);
  if (!ready.length || ready.some((f) => !f.pagesKnown && !Number(f.manualPages))) { quote = null; refreshSide(); return; }
  qTimer = setTimeout(async () => {
    try { quote = await api('/api/xerox/quote', { method: 'POST', body: { shopId: shop.id, files: ready.map(payload) } }); }
    catch (x) { quote = { error: x.message }; }
    refreshSide(); $$('.file-card').forEach((el, i) => { const f = files[i]; const qf = quote?.files?.find((x) => x.fileId === f?.id); const p = el.querySelector('p.muted'); if (p && f && !f.uploading) p.innerHTML = `${KIND_LABEL[f.kind] || ''} · ${f.pages ? `${f.pages} page${f.pages === 1 ? '' : 's'}` : 'pages not detected'}${qf ? ` · ${qf.sheets} sheet${qf.sheets === 1 ? '' : 's'} · <b>${money(qf.cost)}</b>` : ''}`; });
  }, 250);
}
function refreshSide() { const s = $('#side'); if (s) s.innerHTML = sideHtml(files.filter((f) => !f.uploading)); }

async function addFiles(list) {
  for (const file of list) {
    if (files.length >= 10) { toast('Up to 10 files per order.'); break; }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const mime = MIME[ext] || file.type;
    if (!Object.values(MIME).includes(mime)) { toast(`${file.name}: use PDF, Word (.docx), PowerPoint (.pptx) or an image.`); continue; }
    if (file.size > 25 * 1024 * 1024) { toast(`${file.name} is over 25 MB.`); continue; }
    const f = { name: file.name, uploading: true, blob: file, mime, opt: DEFAULT() };
    files.push(f); renderNew();
    try {
      let hint = 0;
      if (mime === 'application/pdf') { try { const { openPdf } = await import('../hub/web/pdf.js'); hint = (await openPdf(new Uint8Array(await file.arrayBuffer()))).numPages; } catch { /* server counts */ } }
      const { file: up } = await api(`/api/xerox/shops/${shop.id}/files`, { method: 'POST', raw: file, headers: { 'Content-Type': mime, 'X-Filename': encodeURIComponent(file.name), ...(hint ? { 'X-Pages': String(hint) } : {}) } });
      Object.assign(f, up, { uploading: false });
    } catch (x) { files = files.filter((y) => y !== f); toast(`${file.name}: ${x.message}`); }
    renderNew(); requote();
  }
}

// Changing an option. Print settings: 'all' or 'f<i>'. Page choice always belongs to the file.
function setOpt(key, field, value) {
  const f = key === 'all' ? null : files[Number(key.slice(1))];
  if (field === 'all') { f.opt.all = value === 'all'; if (!f.opt.all && !f.opt.ranges.length) f.opt.ranges = [{ from: 1, to: Math.max(1, maxPages(f)) }]; return; }
  const o = f ? f.opt : shared;
  if (field === 'nup') o.nup = Number(value) || 1;
  else if (field === 'copies') o.copies = Math.max(1, Math.min(50, Number(value) || 1));
  else o[field] = value;
}
app.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-shop]'); if (!t) return;
  if (t.dataset.shop) { const s = shops.find((x) => x.id === t.dataset.shop); if (!s.open) { toast(`${s.name} is closed right now.`); return; } shop = s; files = []; quote = null; renderNew(); return; }
  if (t.id === 'change-shop') { if (files.length && !t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Tap again (files are cleared)'; return; } shop = null; files = []; quote = null; renderNew(); return; }
  if (t.dataset.set) { const [key, field, value] = t.dataset.set.split(':'); setOpt(key, field, value); renderNew(); requote(); return; }
  if (t.dataset.addrange) { const f = files[Number(t.dataset.addrange.slice(1))]; const last = f.opt.ranges[f.opt.ranges.length - 1]; f.opt.ranges.push({ from: Math.min(f.pages || 1, (last?.to || 0) + 1), to: f.pages || 1 }); renderNew(); requote(); return; }
  if (t.dataset.delrange) { const [key, i] = t.dataset.delrange.split(':'); files[Number(key.slice(1))].opt.ranges.splice(Number(i), 1); renderNew(); requote(); return; }
  if (t.dataset.remove) { const f = files[Number(t.dataset.remove)]; files.splice(Number(t.dataset.remove), 1); if (f?.id) api(`/api/xerox/shops/${shop.id}/files/${f.id}`, { method: 'DELETE' }).catch(() => {}); renderNew(); requote(); return; }
  if (t.dataset.preview) { preview(files[Number(t.dataset.preview)]); return; }
  if (t.id === 'place') { pay(); return; }
  if (t.dataset.ticket) { showTicket(orders.find((o) => o.id === t.dataset.ticket)); return; }
  if (t.dataset.cancel) { if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Tap again'; return; } try { await api(`/api/xerox/orders/${t.dataset.cancel}/cancel`, { method: 'POST' }); toast('Cancelled. The money goes back to your UPI.'); loadOrders(); } catch (x) { toast(x.message); } }
});
app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'pick') { addFiles([...t.files]); t.value = ''; }
  else if (t.id === 'same') { same = t.checked; if (!same) for (const f of files) Object.assign(f.opt, { ...shared, all: f.opt.all, ranges: f.opt.ranges }); renderNew(); requote(); }
  else if (t.dataset.sel) { const [key, field] = t.dataset.sel.split(':'); setOpt(key, field, t.value); renderNew(); requote(); }
  else if (t.dataset.num) { const [key, field] = t.dataset.num.split(':'); setOpt(key, field, t.value); renderNew(); requote(); }
  else if (t.dataset.range) { const [key, i, end] = t.dataset.range.split(':'); const f = files[Number(key.slice(1))]; f.opt.ranges[Number(i)][end] = Math.max(1, Number(t.value) || 1); requote(); }
  else if (t.dataset.manual) { files[Number(t.dataset.manual)].manualPages = t.value; renderNew(); requote(); }
  else if (t.id === 'agree') agree = t.checked;
});
app.addEventListener('input', (e) => { if (e.target.id === 'note') note = e.target.value; });
app.addEventListener('dragover', (e) => { if (e.target.closest('#drop')) { e.preventDefault(); $('#drop').classList.add('over'); } });
app.addEventListener('dragleave', (e) => { if (e.target.closest('#drop')) $('#drop').classList.remove('over'); });
app.addEventListener('drop', (e) => { if (!e.target.closest('#drop')) return; e.preventDefault(); $('#drop').classList.remove('over'); addFiles([...e.dataTransfer.files]); });

async function preview(f) {
  const o = optsOf(f); const opt = { ...o, ranges: rangesOf(f) };
  const s = sheet({ title: 'Preview', body: `<p class="muted small">${o.nup > 1 ? `${o.nup}-in-1, ${o.arrangement === 'vertical' ? 'top to bottom' : 'side by side'}` : 'One page per side'} · ${o.color === 'bw' ? 'Black & white' : 'Colour'} · ${o.size} · ${o.sides === 'double' ? 'front & back' : 'one side'}</p><div id="pv" class="pv-grid"><p class="muted">Drawing the pages…</p></div>`, foot: '<button class="btn primary block" data-close>Close preview</button>' });
  s.el.querySelector('.sheet-foot [data-close]').addEventListener('click', s.close);
  try {
    const { buildSheets } = await import('../hub/web/printlayout.js');
    const { faces, total, rendered } = await buildSheets({ kind: f.kind, mime: f.mime, bytes: new Uint8Array(await f.blob.arrayBuffer()) }, opt, { pxWidth: 360, max: 12 });
    const pv = s.el.querySelector('#pv'); pv.innerHTML = '';
    faces.forEach((c, i) => { const w = document.createElement('figure'); w.className = 'pv-sheet'; w.append(c); const cap = document.createElement('figcaption'); cap.textContent = `Sheet side ${i + 1}`; w.append(cap); pv.append(w); });
    if (total > faces.length) pv.insertAdjacentHTML('beforeend', `<p class="muted small">Showing ${faces.length} of ${total} sheet sides.</p>`);
    if (!rendered) pv.insertAdjacentHTML('afterbegin', `<p class="notice small" style="grid-column:1/-1">${KIND_LABEL[f.kind]} files can’t be drawn here, so this shows the layout only. Save as PDF for an exact preview.</p>`);
  } catch (x) { s.el.querySelector('#pv').innerHTML = `<p class="err">Couldn’t draw this file: ${esc(x.message)}</p>`; }
}

function pay() {
  if (!agree) { $('#order-err').textContent = 'Tick the box to agree before paying.'; return; }
  $('#order-err').textContent = '';
  const body = { shopId: shop.id, note, agree: true, files: files.filter((f) => !f.uploading).map(payload) };
  paySheet({
    amount: quote.total, payee: shop.name, upi: shop.upi, phone: user.phone,
    onPay: async (pay) => {
      try {
        const { order } = await api('/api/xerox/orders', { method: 'POST', body: { ...body, pay } });
        files = []; quote = null; note = ''; agree = false; await loadOrders(); renderNew();
        return { ref: order.payment.ref, after: () => { setView('orders'); showTicket(order); } };
      } catch (x) { if (!String(x.code).startsWith('PAY')) $('#order-err').textContent = x.message; throw x; }
    },
  });
}

/* ---------- orders ---------- */
const ACTIVE = ['QUEUED', 'PRINTING', 'READY'];
const statusLine = (o) => ({ QUEUED: 'In the queue', PRINTING: 'Printing now', READY: 'Ready, please collect', COLLECTED: 'Collected', CANCELLED: 'Cancelled · refunded' }[o.status] || o.status);
const optLine = (f) => `${f.ranges.map((r) => (r.from === r.to ? `p${r.from}` : `p${r.from}–${r.to}`)).join(', ')} · ${f.copies}× · ${f.color === 'bw' ? 'B&W' : 'colour'} · ${f.size} · ${f.sides === 'double' ? 'front & back' : 'one side'}${f.nup > 1 ? ` · ${f.nup}-in-1` : ''}${f.binding !== 'none' ? ` · ${f.binding}` : ''}`;
function showTicket(o) {
  if (!o) return;
  liveInvoice({
    title: 'Invoice', token: o.token, place: o.shopName, at: o.createdAt, total: o.total, expired: ['COLLECTED', 'CANCELLED'].includes(o.status),
    rows: [['Date', new Date(o.createdAt).toLocaleDateString('en-IN')], ['Time', clock(o.createdAt)], ['Status', statusLine(o)], ['Paid to', `${o.shopName}${o.payment?.ref ? ` · UPI ref ${o.payment.ref}` : ''}`]],
    lines: o.files.map((f) => [`${f.name} (${optLine(f)})`, f.cost]), note: o.note ? `Note: ${o.note}` : '',
  });
}
function renderActive() {
  $('#active').innerHTML = orders.filter((o) => ACTIVE.includes(o.status)).map((o) => `<div class="card row ticket-row ${o.status === 'READY' ? 'is-ready' : ''}">
      <div><p class="muted small">Token</p><p class="token" style="font-size:32px">${esc(o.token)}</p></div>
      <div class="grow"><b>${esc(o.shopName)}</b> ${pill(o.status)} <span class="paid">✓ Paid ${money(o.total)}</span><p class="muted small" style="overflow-wrap:anywhere">${esc(o.files.map((f) => f.name).join(', '))}</p><p class="small">${esc(statusLine(o))}</p></div>
      <div class="stack" style="gap:6px"><button class="btn primary sm" data-ticket="${o.id}">Show token</button>${o.status === 'QUEUED' ? `<button class="btn danger sm" data-cancel="${o.id}">Cancel</button>` : ''}</div></div>`).join('');
}
function renderOrders() {
  $('#v-orders').innerHTML = `<div class="section-h"><h2>My orders</h2></div><ul class="list">${orders.map((o) => `<li class="item"><div class="main"><b>Token ${esc(o.token)} · ${esc(o.shopName)}</b>
    <div class="muted small" style="overflow-wrap:anywhere">${esc(when(o.createdAt))} · ${esc(o.files.map((f) => f.name).join(', '))} · ${money(o.total)}</div><div class="small">${esc(statusLine(o))}</div></div>
    <div class="row" style="gap:6px">${pill(o.status)}<button class="btn ghost sm" data-ticket="${o.id}">Invoice</button></div></li>`).join('') || '<li class="empty">No print orders yet.</li>'}</ul>`;
}
async function loadOrders() { ({ orders } = await api('/api/xerox/orders/mine')); renderActive(); if (view === 'orders') renderOrders(); }

/* ---------- chat with a shop ---------- */
let chatShop = '', stopChat = () => {};
async function renderChat() {
  chatShop ||= shop?.id || orders[0]?.shopId || shops[0]?.id;
  const box = $('#v-chat');
  box.innerHTML = `<div class="card stack" style="margin-top:16px;max-width:640px"><h3>Chat with the shop</h3><p class="muted small">Only you and the shop can see this chat.</p>
    <div class="field"><label for="c-shop">Shop</label><select id="c-shop">${shops.map((s) => `<option value="${s.id}" ${s.id === chatShop ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
    <div class="chat" id="chat-box"><p class="muted small">Loading…</p></div>
    <form id="chat-f" class="row" novalidate style="gap:8px"><label for="chat-in" class="sr">Your message</label><input id="chat-in" class="grow" maxlength="500" placeholder="Type your message"><button class="btn primary" type="submit">Send</button></form></div>`;
  const draw = (messages) => {
    const c = $('#chat-box'); if (!c) return;
    c.innerHTML = messages.map((m) => `<div class="msg ${m.from === 'student' ? 'me' : ''}"><small>${m.from === 'student' ? 'You' : esc(shops.find((s) => s.id === chatShop)?.name || 'Shop')} · ${esc(clock(m.createdAt))}</small>${esc(m.text)}</div>`).join('') || '<p class="muted small">No messages yet. Ask the shop anything about your order.</p>';
    c.scrollTop = c.scrollHeight;
  };
  const load = async () => draw((await api(`/api/xerox/shops/${chatShop}/chat`)).messages);
  await load();
  stopChat(); stopChat = live([`xerox:chat:${chatShop}:${user.id}`], load);
  $('#c-shop').addEventListener('change', (e) => { chatShop = e.target.value; renderChat(); });
  $('#chat-f').addEventListener('submit', async (e) => {
    e.preventDefault(); const inp = $('#chat-in'); const text = inp.value.trim(); if (!text) return; inp.value = '';
    try { draw((await api(`/api/xerox/shops/${chatShop}/chat`, { method: 'POST', body: { text } })).messages); } catch (x) { toast(x.message); inp.value = text; }
  });
}

live([`xerox:u:${user.id}`], async (d) => { await loadOrders(); if (d.status === 'READY') toast(`Token ${d.token} is ready at ${d.shop}. Go collect it!`); });
({ shops } = await api('/api/xerox/shops'));
await loadOrders();
renderNew();
