// Food for students: search a dish across all four canteens, order from one, pick a pickup time,
// pay the canteen by UPI and show a live token at the counter.
import { $, $$, esc, money, when, api, toast, requireStudent, live, bar, pill, sheet, store, paySheet, liveInvoice, clock } from '../hub/web/kit.js';

const user = await requireStudent();
const app = $('#app');
const actions = bar({ section: 'food', title: 'Food' });
actions.innerHTML = '<a class="btn ghost sm" href="staff.html">🔒 <span class="hide-sm">Owner login</span></a>';

let canteens = [], dishes = [], orders = [];
let view = 'canteens', open = null, query = '', vegMode = 'all', cat = '';
const CART_KEY = 'food_cart_v2';
let cart = {};
try { cart = JSON.parse(store.get(CART_KEY) || '{}') || {}; } catch { cart = {}; }
const saveCart = () => store.set(CART_KEY, JSON.stringify(cart));
const dish = (id) => dishes.find((d) => d.id === id);
const canteenById = (id) => canteens.find((c) => c.id === id);
const cartCount = () => Object.values(cart).reduce((n, c) => n + Object.values(c).reduce((a, b) => a + b, 0), 0);

app.innerHTML = `
  <section class="hero food">
    <h2>Order ahead, skip the queue</h2>
    <p>Compare a dish across KC, Darling, Hangy &amp; Swig and Garnish, choose when to pick it up, and pay the canteen by UPI. The kitchen starts only on paid orders.</p>
    <div class="hero-search"><label for="q" class="sr">Search a dish in every canteen</label><input id="q" type="search" placeholder="Search your fav dish, like dosa or maggi" autocomplete="off"></div>
  </section>
  <div class="row between" style="margin-top:16px;flex-wrap:wrap;gap:10px">
    <div class="seg" role="tablist" aria-label="Food">
      <button data-view="canteens" aria-pressed="true">Canteens</button><button data-view="cart" aria-pressed="false">Cart <span id="cart-n" class="num"></span></button><button data-view="orders" aria-pressed="false">My orders</button>
    </div>
  </div>
  <div id="active" class="stack" style="margin-top:14px"></div>
  <section id="v-canteens"></section><section id="v-cart" hidden></section><section id="v-orders" hidden></section>`;

function setView(v) {
  view = v;
  $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  for (const k of ['canteens', 'cart', 'orders']) $('#v-' + k).hidden = k !== v;
  render();
}
app.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
$('#q').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); if (view !== 'canteens') setView('canteens'); else render(); });

/* ---------- dishes and canteens ---------- */
const vegMark = (v) => `<span class="veg ${v ? '' : 'non'}" title="${v ? 'Veg' : 'Non-veg'}"><span class="sr">${v ? 'Veg' : 'Non-veg'}</span></span>`;
const qtyIn = (d) => cart[d.canteenId]?.[d.id] || 0;
function addBtn(d) {
  const c = canteenById(d.canteenId);
  if (!d.available) return '<span class="pill bad">Sold out</span>';
  if (!c?.open) return '<span class="pill">Closed</span>';
  const q = qtyIn(d);
  return q ? `<div class="qty" role="group" aria-label="Quantity of ${esc(d.name)}"><button data-dec="${d.id}" aria-label="One less">−</button><span class="num">${q}</span><button data-inc="${d.id}" aria-label="One more">+</button></div>`
    : `<button class="btn ghost sm" data-inc="${d.id}">Add</button>`;
}
function dishRow(d, { showCanteen = false } = {}) {
  return `<div class="item card row" style="padding:12px 14px">
    ${vegMark(d.veg)}
    <div class="grow"><b>${esc(d.name)}</b><p class="muted small">${showCanteen ? `${esc(d.canteenName)} · ` : ''}${money(d.price)} · ~${d.prepMins} min${d.qtyLeft != null && d.qtyLeft > 0 && d.qtyLeft <= 10 ? ` · <span style="color:var(--uh-warn)">${d.qtyLeft} left</span>` : ''}</p></div>
    ${addBtn(d)}</div>`;
}

function renderCanteens() {
  const box = $('#v-canteens');
  if (query) {
    // Compare: the same dish across canteens, cheapest first.
    const hits = dishes.filter((d) => d.name.toLowerCase().includes(query) || d.category.toLowerCase().includes(query));
    const groups = new Map();
    for (const d of hits) { const k = d.name.toLowerCase().replace(/\s+/g, ' ').replace(/dosai/g, 'dosa').replace(/idly/g, 'idli'); (groups.get(k) || groups.set(k, []).get(k)).push(d); }
    const names = [...new Set(hits.map((d) => d.name))].slice(0, 8);
    box.innerHTML = `<div class="chips" style="margin:14px 0 4px">${names.map((n) => `<button class="chip" data-suggest="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <div class="section-h"><h2>${hits.length ? `${hits.length} dish${hits.length === 1 ? '' : 'es'} for “${esc(query)}”` : `Nothing called “${esc(query)}”`}</h2><p class="muted small">${hits.length ? 'Cheapest first, across every canteen' : 'Try another word'}</p></div>
      <div class="stack">${[...groups.values()].map((g) => g.sort((a, b) => a.price - b.price)).sort((a, b) => a[0].price - b[0].price).map((g) => `
        <article class="card stack" style="gap:8px"><div class="row between"><b>${esc(g[0].name)}</b>${g.length > 1 ? `<span class="muted small">at ${g.length} canteens</span>` : ''}</div>
          ${g.map((d, i) => `<div class="row cmp" style="gap:10px">${vegMark(d.veg)}<div class="grow"><b class="small">${esc(d.canteenName)}</b>${i === 0 && g.length > 1 ? ' <span class="pill solid">Cheapest</span>' : ''}<p class="muted small">${money(d.price)} · ~${d.prepMins} min${d.name !== g[0].name ? ` · ${esc(d.name)}` : ''}</p></div>${addBtn(d)}</div>`).join('')}
        </article>`).join('')}</div>`;
    return;
  }
  if (open) return renderMenu();
  box.innerHTML = `<div class="section-h"><h2>Canteens</h2><p class="muted small">${dishes.length} dishes in ${canteens.length} canteens</p></div>
    <div class="grid-cards">${canteens.map((c) => `<button class="card canteen-card" data-open="${c.id}">
      <div class="row between"><b style="font-size:17px">${esc(c.name)}</b>${c.open ? '<span class="pill ok">Open</span>' : '<span class="pill bad">Closed</span>'}</div>
      <p class="muted small">${esc(c.place || '')}</p><p class="small"><b>${c.dishes}</b> dishes${cart[c.id] && Object.keys(cart[c.id]).length ? ` · <span style="color:var(--uh-accent)">${Object.values(cart[c.id]).reduce((a, b) => a + b, 0)} in cart</span>` : ''}</p></button>`).join('')}</div>`;
}

function renderMenu() {
  const c = canteenById(open); const box = $('#v-canteens');
  const mine = dishes.filter((d) => d.canteenId === open);
  const cats = [...new Set(mine.map((d) => d.category))];
  const shown = mine.filter((d) => (vegMode === 'all' || (vegMode === 'veg') === d.veg) && (!cat || d.category === cat));
  const byCat = new Map(); for (const d of shown) (byCat.get(d.category) || byCat.set(d.category, []).get(d.category)).push(d);
  const inCart = Object.values(cart[open] || {}).reduce((a, b) => a + b, 0);
  box.innerHTML = `<div class="row between" style="margin:16px 0 8px;gap:10px;flex-wrap:wrap">
      <div><button class="link small" id="back-c" style="margin:0 0 4px">← All canteens</button><h2 style="font-size:22px">${esc(c.name)}</h2><p class="muted small">${esc(c.place || '')}${c.open ? '' : ' · not taking orders now'}</p></div>
      ${inCart ? `<button class="btn primary sm" data-view="cart">View cart · ${inCart}</button>` : ''}</div>
    <div class="seg" role="group" aria-label="Veg or non-veg" id="vegseg">${[['all', 'All'], ['veg', 'Veg'], ['non', 'Non-veg']].map(([k, l]) => `<button data-veg="${k}" aria-pressed="${vegMode === k}">${l}</button>`).join('')}</div>
    <div class="chips" style="margin:10px 0 14px"><button class="chip" data-cat="" aria-pressed="${!cat}">Everything</button>${cats.map((k) => `<button class="chip" data-cat="${esc(k)}" aria-pressed="${cat === k}">${esc(k)}</button>`).join('')}</div>
    ${[...byCat].map(([k, list]) => `<h3 class="cat-h">${esc(k)}</h3><div class="stack" style="gap:8px">${list.map((d) => dishRow(d)).join('')}</div>`).join('') || '<p class="empty">No dishes match these filters.</p>'}`;
}

/* ---------- cart: one order per canteen ---------- */
const earliestFor = (lines) => new Date(Date.now() + Math.max(0, ...lines.map((l) => l.d.prepMins)) * 60e3);
const hhmm = (d) => { const t = new Date(d.getTime() + 5.5 * 3600e3); return t.toISOString().slice(11, 16); };
const roundUp5 = (d) => new Date(Math.ceil(d.getTime() / 300e3) * 300e3);
const picks = {}; // per canteen: { pickup: 'HH:MM', mode, note }

function renderCart() {
  const box = $('#v-cart');
  const ids = Object.keys(cart).filter((cid) => Object.keys(cart[cid]).length && canteenById(cid));
  if (!ids.length) { box.innerHTML = '<p class="empty" style="margin-top:16px">Your cart is empty. Search a dish or open a canteen to add something.</p>'; return; }
  box.innerHTML = ids.map((cid) => {
    const c = canteenById(cid);
    const lines = Object.entries(cart[cid]).map(([id, qty]) => ({ d: dish(id), qty })).filter((l) => l.d);
    const total = lines.reduce((n, l) => n + l.d.price * l.qty, 0);
    const prep = Math.max(...lines.map((l) => l.d.prepMins));
    const earliest = roundUp5(earliestFor(lines));
    const p = (picks[cid] ||= { pickup: '', mode: 'takeaway', note: '', agree: false });
    if (!p.pickup || p.pickup < hhmm(earliest)) p.pickup = hhmm(earliest);
    const blocked = lines.some((l) => !l.d.available) || !c.open;
    return `<article class="card stack" data-cart="${cid}" style="margin-top:16px">
      <div class="row between"><h3>${esc(c.name)}</h3><button class="link small" data-clear="${cid}" style="margin:0">Empty</button></div>
      <div class="stack" style="gap:8px">${lines.map((l) => `<div class="row" style="gap:10px">${vegMark(l.d.veg)}<div class="grow"><b class="small">${esc(l.d.name)}</b><p class="muted small">${money(l.d.price)} · ~${l.d.prepMins} min${l.d.available ? '' : ' · <b style="color:var(--uh-bad)">sold out, remove it</b>'}</p></div>${addBtn(l.d)}</div>`).join('')}</div>
      <div class="divider"></div>
      <div class="row between small"><span class="muted">Estimated preparation time (longest item)</span><b>~${prep} min</b></div>
      <div class="field"><label for="pk-${cid}">Pickup time</label>
        <div class="row" style="gap:8px;flex-wrap:wrap"><input id="pk-${cid}" type="time" data-pick="${cid}" value="${p.pickup}" min="${hhmm(earliest)}" style="width:auto">
        ${[0, 10, 20, 30].map((m) => `<button class="chip" data-later="${cid}:${m}">${m ? `+${m} min` : 'As soon as ready'}</button>`).join('')}</div>
        <p class="muted small">Ready by about ${clock(earliest.toISOString())} at the earliest. You can pick up to an hour ahead.</p></div>
      <div class="seg" role="group" aria-label="Dine-in or take-away">${[['takeaway', 'Take-away'], ['dinein', 'Dine-in']].map(([k, l]) => `<button data-mode="${cid}:${k}" aria-pressed="${p.mode === k}">${l}</button>`).join('')}</div>
      <div class="field"><label for="nt-${cid}">Note for the kitchen (optional)</label><input id="nt-${cid}" data-note="${cid}" maxlength="140" value="${esc(p.note)}" placeholder="Less spicy, no onion…"></div>
      <label class="check small"><input type="checkbox" data-agree="${cid}" ${p.agree ? 'checked' : ''}> I agree that the order can’t be cancelled after 2 minutes, as the kitchen starts on it.</label>
      <div class="row between"><b>Total</b><b class="num" style="font-size:20px">${money(total)}</b></div>
      <p class="err" id="err-${cid}" role="alert"></p>
      <button class="btn primary block" data-pay="${cid}" ${blocked ? 'disabled' : ''}>${c.open ? `Pay ${money(total)} to ${esc(c.name)}` : `${esc(c.name)} is closed`}</button>
    </article>`;
  }).join('');
}

function bump(id, by) {
  const d = dish(id); if (!d) return;
  const c = (cart[d.canteenId] ||= {});
  const q = Math.max(0, (c[id] || 0) + by);
  if (by > 0 && d.qtyLeft != null && q > d.qtyLeft) { toast(`Only ${d.qtyLeft} ${d.name} left.`); return; }
  if (by > 0 && q > 20) return;
  if (q) c[id] = q; else delete c[id];
  if (!Object.keys(c).length) delete cart[d.canteenId];
  saveCart(); render();
  if (by > 0 && q === 1) toast(`${d.name} added from ${d.canteenName}.`);
}

app.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.inc) bump(t.dataset.inc, 1);
  else if (t.dataset.dec) bump(t.dataset.dec, -1);
  else if (t.dataset.open) { open = t.dataset.open; vegMode = 'all'; cat = ''; render(); window.scrollTo({ top: 0 }); }
  else if (t.id === 'back-c') { open = null; render(); }
  else if (t.dataset.veg) { vegMode = t.dataset.veg; render(); }
  else if ('cat' in t.dataset) { cat = t.dataset.cat; render(); }
  else if (t.dataset.suggest) { $('#q').value = t.dataset.suggest; query = t.dataset.suggest.toLowerCase(); render(); }
  else if (t.dataset.clear) { delete cart[t.dataset.clear]; saveCart(); render(); }
  else if (t.dataset.later) {
    const [cid, m] = t.dataset.later.split(':'); const lines = Object.entries(cart[cid] || {}).map(([id, qty]) => ({ d: dish(id), qty })).filter((l) => l.d);
    picks[cid].pickup = hhmm(new Date(roundUp5(earliestFor(lines)).getTime() + Number(m) * 60e3)); render();
  } else if (t.dataset.mode) { const [cid, k] = t.dataset.mode.split(':'); picks[cid].mode = k; render(); }
  else if (t.dataset.pay) pay(t.dataset.pay);
  else if (t.dataset.ticket) showTicket(orders.find((o) => o.id === t.dataset.ticket));
  else if (t.dataset.cancel) cancel(t.dataset.cancel, t);
});
app.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.pick) picks[t.dataset.pick].pickup = t.value;
  if (t.dataset.note) picks[t.dataset.note].note = t.value;
});
app.addEventListener('change', (e) => { if (e.target.dataset.agree) picks[e.target.dataset.agree].agree = e.target.checked; });

function pay(cid) {
  const c = canteenById(cid); const p = picks[cid]; const err = $('#err-' + cid);
  const items = Object.entries(cart[cid] || {}).map(([id, qty]) => ({ id, qty }));
  const total = items.reduce((n, i) => n + dish(i.id).price * i.qty, 0);
  if (!p.agree) { err.textContent = 'Tick the box to agree before paying.'; return; }
  err.textContent = '';
  paySheet({
    amount: total, payee: c.name, upi: c.upi, phone: user.phone,
    onPay: async (pay) => {
      try {
        const { order } = await api('/api/food/orders', { method: 'POST', body: { canteenId: cid, items, pickupAt: p.pickup, mode: p.mode, note: p.note, pay } });
        delete cart[cid]; delete picks[cid]; saveCart(); await loadOrders(); render();
        return { ref: order.payment.ref, after: () => { setView('orders'); showTicket(order); } };
      } catch (x) { if (!String(x.code).startsWith('PAY')) { err.textContent = x.message; if (x.code === 'OUT_OF_STOCK') loadDishes(); } throw x; }
    },
  });
}

/* ---------- orders and tokens ---------- */
const ACTIVE = ['PLACED', 'READY'];
const statusLine = (o) => (o.status === 'PLACED' ? `Being prepared · pick up at ${clock(o.pickupAt)}` : o.status === 'READY' ? 'Ready! Show your token at the counter' : o.status === 'COLLECTED' ? (o.expired ? 'Collected · token expired' : `Collected · token valid till ${clock(o.validUntil)}`) : 'Cancelled · refunded');
function showTicket(o) {
  if (!o) return;
  liveInvoice({
    title: 'Invoice', token: o.token, place: o.canteenName, at: o.createdAt, total: o.total, expired: o.expired || o.status === 'CANCELLED',
    rows: [['Ordered at', clock(o.createdAt)], ['Collect at', clock(o.pickupAt)], ['Estimated prep time (longest item)', `~${o.prepMins} min`], ['Order type', o.mode === 'dinein' ? 'Dine-in' : 'Take-away'], ['Status', statusLine(o)], ['Paid to', `${o.canteenName}${o.payment?.ref ? ` · UPI ref ${o.payment.ref}` : ''}`]],
    lines: o.items.map((i) => [`${i.name} × ${i.qty}`, i.price * i.qty]),
    note: o.note ? `Note: ${o.note}` : '',
  });
}
function ticketCard(o) {
  return `<div class="card row ticket-row ${o.status === 'READY' ? 'is-ready' : ''}">
    <div><p class="muted small">Token</p><p class="token" style="font-size:32px">${esc(o.token)}</p></div>
    <div class="grow"><b>${esc(o.canteenName)}</b> ${pill(o.status)} <span class="paid">✓ Paid ${money(o.total)}</span>
      <p class="muted small">${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))}</p><p class="small">${esc(statusLine(o))}</p></div>
    <div class="stack" style="gap:6px"><button class="btn primary sm" data-ticket="${o.id}">Show token</button>${o.canCancel ? `<button class="btn danger sm" data-cancel="${o.id}">Cancel</button>` : ''}</div></div>`;
}
function renderActive() {
  const act = orders.filter((o) => ACTIVE.includes(o.status) || (o.status === 'COLLECTED' && !o.expired));
  $('#active').innerHTML = act.map(ticketCard).join('');
}
function renderOrders() {
  $('#v-orders').innerHTML = `<div class="section-h"><h2>My orders</h2></div><ul class="list">${orders.map((o) => `<li class="item"><div class="main"><b>${esc(o.token)} · ${esc(o.canteenName)}</b>
    <div class="muted small">${esc(when(o.createdAt))} · ${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))} · ${money(o.total)}</div><div class="small">${esc(statusLine(o))}</div></div>
    <div class="row" style="gap:6px">${pill(o.expired ? 'EXPIRED' : o.status)}<button class="btn ghost sm" data-ticket="${o.id}">Invoice</button></div></li>`).join('') || '<li class="empty">No orders yet.</li>'}</ul>`;
}
async function cancel(id, btn) {
  if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Tap again'; return; }
  try { await api(`/api/food/orders/${id}/cancel`, { method: 'POST' }); toast('Order cancelled. The money goes back to your UPI.'); await loadOrders(); loadDishes(); }
  catch (x) { toast(x.message); loadOrders(); }
}

function render() {
  $('#cart-n').textContent = cartCount() ? `(${cartCount()})` : '';
  renderActive();
  if (view === 'canteens') renderCanteens(); else if (view === 'cart') renderCart(); else renderOrders();
}
async function loadDishes() { ({ canteens, dishes } = await api('/api/food/dishes')); for (const cid of Object.keys(cart)) for (const id of Object.keys(cart[cid])) if (!dish(id)) delete cart[cid][id]; render(); }
async function loadOrders() { ({ orders } = await api('/api/food/orders/mine')); render(); }

const seen = {};
live([`food:u:${user.id}`], async (d) => {
  await loadOrders();
  if (d.status === 'READY' && !seen[d.id]) { seen[d.id] = 1; toast(`Token ${d.token} is ready at ${d.canteen}. Go collect it!`); }
});
setInterval(() => { if (orders.some((o) => o.canCancel || (o.status === 'COLLECTED' && !o.expired))) loadOrders(); }, 30000);
await Promise.all([loadDishes(), loadOrders()]);
let menuTimer;
live(canteens.slice(0, 9).map((c) => `food:menu:${c.id}`), () => { clearTimeout(menuTimer); menuTimer = setTimeout(loadDishes, 400); });
if (location.hash === '#orders') setView('orders');
