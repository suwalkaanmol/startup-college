// Xerox: upload PDFs, choose print options, see the price, order, and follow the token live.
import { $, $$, esc, money, when, api, toast, requireStudent, live, bar, pill, sheet, store } from '../hub/web/kit.js';

const user = await requireStudent();
const app = $('#app');
bar({ section: 'xerox', title: 'Xerox' }).innerHTML = '<a class="btn ghost sm" href="staff.html"><span aria-hidden="true">🔒</span> Staff<span class="hide-sm">&nbsp;login</span></a>';

let shops = [], shop = null, files = [], orders = [], quote = null, view = 'new';
const ACTIVE = ['QUEUED', 'PRINTING', 'READY'];

app.innerHTML = `
  <section class="hero xerox">
    <h2>Print without the queue</h2>
    <p>Upload your PDFs, pick the options, and collect from the shop with your token. Pay at the shop.</p>
    <div class="chips" id="shops" style="margin-top:14px" aria-label="Shop"></div>
  </section>
  <div id="active" class="stack" style="margin-top:14px"></div>
  <div class="row between" style="margin:18px 0 12px">
    <div class="seg" role="group" aria-label="View"><button data-view="new" aria-pressed="true">New print</button><button data-view="orders" aria-pressed="false">My prints</button></div>
    <p class="muted small" id="shop-meta"></p>
  </div>
  <div id="new-view" class="cols">
    <div class="stack">
      <label class="card" id="drop" for="file" style="cursor:pointer;text-align:center;border-style:dashed;border-width:2px;padding:26px">
        <b style="font-size:16px">Add PDFs</b><br><span class="muted small">Tap to choose, or drop files here. PDF only, up to 25 MB each, 10 per order.</span>
        <input id="file" type="file" accept="application/pdf,.pdf" multiple class="sr">
      </label>
      <div id="files" class="stack"></div>
    </div>
    <aside class="sticky-side stack" id="side"></aside>
  </div>
  <div id="orders-view" hidden></div>`;

/* ---------- shops ---------- */
async function loadShops() {
  ({ shops } = await api('/api/xerox/shops'));
  const saved = store.get('xerox_shop');
  shop = shops.find((s) => s.id === saved) || shops.find((s) => s.open) || shops[0];
  renderShops();
}
function renderShops() {
  $('#shops').innerHTML = shops.map((s) => `<button class="chip" aria-pressed="${s.id === shop.id}" data-id="${esc(s.id)}"
    style="${s.id === shop.id ? '' : 'background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.35)'}">${esc(s.name)}${s.open ? '' : ' · closed'}</button>`).join('');
  $('#shop-meta').textContent = `${shop.name}${shop.grp === 'hostel' ? ' · hostel shop' : ''}${shop.open ? '' : ' · closed now'}`;
  renderSide();
}
$('#shops').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  shop = shops.find((s) => s.id === b.dataset.id); store.set('xerox_shop', shop.id); renderShops(); requote();
});

/* ---------- files ---------- */
async function addFiles(list) {
  for (const f of list) {
    if (files.length >= 10) { toast('Up to 10 files per order.'); break; }
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { toast(`${f.name} isn’t a PDF. Save it as PDF first.`); continue; }
    if (f.size > 25 * 1024 * 1024) { toast(`${f.name} is over 25 MB.`); continue; }
    const tmp = { tmpId: Math.random().toString(36).slice(2), name: f.name, uploading: true };
    files.push(tmp); renderFiles();
    try {
      const { file } = await api('/api/xerox/files', { method: 'POST', raw: f, headers: { 'Content-Type': 'application/pdf', 'X-Filename': encodeURIComponent(f.name) } });
      Object.assign(tmp, { uploading: false, fileId: file.id, pages: file.pages, manualPages: file.pages <= 0, from: 1, to: Math.max(1, file.pages), copies: 1, color: 'bw', sides: 'single', spiral: false });
    } catch (x) { files = files.filter((y) => y !== tmp); toast(`${f.name}: ${x.message}`); }
    renderFiles(); requote();
  }
}
$('#file').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
const drop = $('#drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.style.borderColor = 'var(--uh-accent)'; }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.style.borderColor = ''; }));
drop.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));

function renderFiles() {
  $('#files').innerHTML = files.map((f, i) => f.uploading
    ? `<div class="card row"><b class="grow">${esc(f.name)}</b><span class="muted small">Uploading…</span></div>`
    : `<div class="card" data-i="${i}">
      <div class="row between"><b class="grow" style="overflow-wrap:anywhere">${esc(f.name)}</b><button class="icon-btn" data-remove="${i}" aria-label="Remove ${esc(f.name)}">✕</button></div>
      <p class="muted small" style="margin:2px 0 10px">${f.manualPages ? 'We couldn’t count the pages in this file. Enter them below.' : `${f.pages} page${f.pages === 1 ? '' : 's'}`}${quote?.files?.[i] ? ` · ${quote.files[i].sheets} sheet${quote.files[i].sheets === 1 ? '' : 's'} · <b style="color:var(--uh-text)">${money(quote.files[i].cost)}</b>` : ''}</p>
      <div class="form-grid">
        ${f.manualPages ? `<div class="field"><label for="pg${i}">Pages in file</label><input id="pg${i}" data-k="pages" inputmode="numeric" value="${f.pages > 0 ? f.pages : ''}"></div>` : ''}
        <div class="field"><label for="fr${i}">From page</label><input id="fr${i}" data-k="from" inputmode="numeric" value="${f.from}"></div>
        <div class="field"><label for="to${i}">To page</label><input id="to${i}" data-k="to" inputmode="numeric" value="${f.to}"></div>
        <div class="field"><label for="cp${i}">Copies</label><input id="cp${i}" data-k="copies" inputmode="numeric" value="${f.copies}"></div>
      </div>
      <div class="row">
        <div class="seg" role="group" aria-label="Colour"><button data-k="color" data-v="bw" aria-pressed="${f.color === 'bw'}">B&amp;W</button><button data-k="color" data-v="color" aria-pressed="${f.color === 'color'}">Colour</button></div>
        <div class="seg" role="group" aria-label="Sides"><button data-k="sides" data-v="single" aria-pressed="${f.sides === 'single'}">One side</button><button data-k="sides" data-v="double" aria-pressed="${f.sides === 'double'}">Both sides</button></div>
        <label class="check"><input type="checkbox" data-k="spiral" ${f.spiral ? 'checked' : ''}> Spiral binding</label>
      </div></div>`).join('');
}
$('#files').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-remove]');
  if (rm) { files.splice(Number(rm.dataset.remove), 1); renderFiles(); requote(); return; }
  const b = e.target.closest('button[data-k]'); if (!b) return;
  const f = files[Number(b.closest('[data-i]').dataset.i)]; f[b.dataset.k] = b.dataset.v; renderFiles(); requote();
});
$('#files').addEventListener('change', (e) => {
  const inp = e.target.closest('[data-k]'); if (!inp) return;
  const f = files[Number(inp.closest('[data-i]').dataset.i)]; const k = inp.dataset.k;
  if (k === 'spiral') f.spiral = inp.checked;
  else {
    const n = Math.max(1, parseInt(inp.value, 10) || 1);
    f[k] = n;
    if (k === 'pages') { f.pages = n; f.to = n; f.from = Math.min(f.from, n); }
    if (k === 'from' && f.from > f.to) f.to = f.from;
    if (k === 'to' && f.to > f.pages && f.pages > 0) f.to = f.pages;
  }
  renderFiles(); requote();
});

/* ---------- price ---------- */
let qTimer;
function requote() {
  clearTimeout(qTimer);
  const ready = files.filter((f) => !f.uploading);
  if (!ready.length) { quote = null; renderSide(); return; }
  qTimer = setTimeout(async () => {
    try { quote = await api('/api/xerox/quote', { method: 'POST', body: { shopId: shop.id, files: ready.map(payload) } }); quote.error = ''; }
    catch (x) { quote = { error: x.message }; }
    renderFiles(); renderSide();
  }, 200);
}
const payload = (f) => ({ fileId: f.fileId, pages: f.pages, from: f.from, to: f.to, copies: f.copies, color: f.color, sides: f.sides, spiral: f.spiral });
function renderSide() {
  if (!shop) return;
  const r = shop.rates;
  const ready = files.filter((f) => !f.uploading);
  $('#side').innerHTML = `<div class="card"><h3 style="margin-bottom:10px">Order · ${esc(shop.name)}</h3>
      ${!ready.length ? '<p class="empty">Add a PDF to see the price.</p>' : quote?.error ? `<p class="err">${esc(quote.error)}</p>` : quote ? `
        <ul class="list">${quote.files.map((f) => `<li class="row between small"><span class="grow" style="overflow-wrap:anywhere">${esc(f.name)}</span><b class="num">${money(f.cost)}</b></li>`).join('')}</ul>
        <div class="divider"></div><div class="row between"><b>Total</b><b class="num" style="font-size:20px">${money(quote.total)}</b></div>` : '<p class="muted">Working out the price…</p>'}
      <div class="field" style="margin-top:12px"><label for="note">Note for the shop (optional)</label><input id="note" maxlength="200" placeholder="Staple each set, print the cover in colour…"></div>
      <p class="err" id="order-err" role="alert"></p>
      <button class="btn primary block" id="place" ${ready.length && quote && !quote.error && shop.open ? '' : 'disabled'}>${shop.open ? 'Send to print · pay at shop' : `${esc(shop.name)} is closed`}</button></div>
    <div class="card small"><h3 style="font-size:14px;margin-bottom:8px">Prices at ${esc(shop.name)}</h3>
      <div class="row between"><span>B&amp;W, one side</span><b>${money(r.bwSingle)} / sheet</b></div>
      <div class="row between"><span>B&amp;W, both sides</span><b>${money(r.bwDouble)} / sheet</b></div>
      <div class="row between"><span>Colour, one side</span><b>${money(r.colorSingle)} / sheet</b></div>
      <div class="row between"><span>Colour, both sides</span><b>${money(r.colorDouble)} / sheet</b></div>
      <div class="row between"><span>Spiral binding</span><b>${money(r.spiral)} / file</b></div></div>`;
}
$('#side').addEventListener('click', async (e) => {
  if (e.target.id !== 'place') return;
  const btn = e.target; btn.disabled = true; btn.textContent = 'Sending…'; $('#order-err').textContent = '';
  try {
    const { order } = await api('/api/xerox/orders', { method: 'POST', body: { shopId: shop.id, note: $('#note').value, files: files.filter((f) => !f.uploading).map(payload) } });
    files = []; quote = null; renderFiles(); renderSide(); await loadOrders();
    const done = sheet({ title: 'Sent to the shop', body: `<div style="text-align:center"><p class="muted">Your token at ${esc(order.shopName)}</p><p class="token" style="margin:8px 0">${esc(order.token)}</p>
      <p>${pill(order.status)}</p><p class="muted small" style="margin-top:10px">We’ll show it here when your prints are ready. Pay ${money(order.total)} at the shop when you collect.</p></div>`,
      foot: '<button class="btn primary block" id="ok-done">Done</button>' });
    done.el.querySelector('#ok-done').addEventListener('click', done.close);
  } catch (x) { $('#order-err').textContent = x.message; btn.disabled = false; btn.textContent = 'Send to print · pay at shop'; }
});

/* ---------- orders ---------- */
async function loadOrders() { ({ orders } = await api('/api/xerox/orders/mine')); renderActive(); if (view === 'orders') renderOrders(); }
const fileLine = (o) => o.files.map((f) => `${f.name} (${f.copies}×, ${f.color === 'bw' ? 'B&W' : 'colour'}, ${f.sides === 'double' ? 'both sides' : 'one side'}${f.spiral ? ', spiral' : ''})`).join('; ');
function renderActive() {
  $('#active').innerHTML = orders.filter((o) => ACTIVE.includes(o.status)).map((o) => `<div class="card row" style="${o.status === 'READY' ? 'border-color:var(--uh-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--uh-accent) 18%,transparent)' : ''}">
      <div><p class="muted small">Token</p><p class="token" style="font-size:32px">${esc(o.token)}</p></div>
      <div class="grow"><b>${esc(o.shopName)}</b> ${pill(o.status)}<p class="muted small" style="overflow-wrap:anywhere">${esc(fileLine(o))} · ${money(o.total)}</p>
        ${o.status === 'READY' ? '<p class="small" style="margin-top:4px"><b>Ready at the shop.</b> Show this token and pay there.</p>' : ''}</div>
      ${o.status === 'QUEUED' ? `<button class="btn danger sm" data-cancel="${o.id}">Cancel</button>` : ''}</div>`).join('');
}
function renderOrders() {
  $('#orders-view').innerHTML = orders.length ? `<ul class="list">${orders.map((o) => `<li class="item"><div class="main"><b>${esc(o.shopName)} · Token ${esc(o.token)}</b>
      <div class="muted small" style="overflow-wrap:anywhere">${esc(when(o.createdAt))} · ${esc(fileLine(o))}</div></div>
      <div style="text-align:right">${pill(o.status)}<div class="num" style="margin-top:4px"><b>${money(o.total)}</b></div></div></li>`).join('')}</ul>`
    : '<p class="empty">No prints yet. Your print orders will show up here.</p>';
}
app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cancel]'); if (!b) return;
  b.disabled = true;
  try { await api(`/api/xerox/orders/${b.dataset.cancel}/cancel`, { method: 'POST' }); toast('Print order cancelled.'); loadOrders(); }
  catch (x) { toast(x.message); b.disabled = false; }
});
$$('.seg [data-view]').forEach((b) => b.addEventListener('click', () => {
  view = b.dataset.view; $$('.seg [data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('#new-view').hidden = view !== 'new'; $('#orders-view').hidden = view !== 'orders';
  if (view === 'orders') renderOrders();
}));

live([`xerox:u:${user.id}`], async (d) => {
  await loadOrders();
  if (d.status === 'READY') toast(`Token ${d.token} is ready. Collect it at the shop.`);
  if (d.status === 'CANCELLED') toast(`Token ${d.token} was cancelled by the shop.`);
});

await loadShops();
await loadOrders();
renderFiles(); renderSide();
