// Food: browse a canteen's menu, build a cart, order ahead and follow the token live.
import { $, $$, esc, money, when, api, toast, requireStudent, live, bar, pill, sheet, store, paySheet } from '../hub/web/kit.js';

const user = await requireStudent();
const app = $('#app');
bar({ section: 'food', title: 'Food' }).innerHTML = '<a class="btn ghost sm" href="staff.html"><span aria-hidden="true">🔒</span> Staff<span class="hide-sm">&nbsp;login</span></a>';

let canteens = [], canteen = null, menu = [], orders = [];
let cat = 'All', q = '', vegOnly = false, view = 'menu';
const cartKey = () => 'food_cart_' + (canteen ? canteen.id : '');
let cart = {};
const loadCart = () => { try { cart = JSON.parse(store.get(cartKey()) || '{}'); } catch { cart = {}; } };
const saveCart = () => store.set(cartKey(), JSON.stringify(cart));
const ACTIVE = ['PLACED', 'PREPARING', 'READY'];

app.innerHTML = `
  <section class="hero food">
    <h2>Order ahead, skip the queue</h2>
    <p>Order and pay from your phone. The kitchen starts only on paid orders, so there’s no queue to pay and no food made for nobody.</p>
    <div class="chips" id="canteens" role="tablist" aria-label="Canteen" style="margin-top:14px"></div>
  </section>
  <div id="active" class="stack" style="margin-top:14px"></div>
  <div class="row between" style="margin:18px 0 12px">
    <div class="seg" role="group" aria-label="View"><button data-view="menu" aria-pressed="true">Menu</button><button data-view="orders" aria-pressed="false">My orders</button></div>
    <p class="muted small" id="canteen-meta"></p>
  </div>
  <div id="menu-view" class="cols">
    <div>
      <div id="sample-note"></div>
      <div class="row" style="margin-bottom:10px">
        <label for="q" class="sr">Search the menu</label>
        <input id="q" type="search" placeholder="Search dosa, coffee, biryani…" class="grow" style="max-width:420px">
        <label class="check"><input type="checkbox" id="veg"> Veg only</label>
      </div>
      <div class="chips scroll" id="cats" aria-label="Categories"></div>
      <div id="menu" class="stack" style="margin-top:12px"></div>
    </div>
    <aside class="sticky-side" id="cart-side"></aside>
  </div>
  <div id="orders-view" hidden></div>
  <button class="cartbar" id="cartbar" hidden></button>`;

/* ---------- data ---------- */
async function loadCanteens() {
  ({ canteens } = await api('/api/food/canteens'));
  const saved = store.get('food_canteen');
  canteen = canteens.find((c) => c.id === saved) || canteens.find((c) => c.open) || canteens[0];
  renderCanteens();
}
async function loadMenu() {
  if (!canteen) return;
  const r = await api(`/api/food/canteens/${canteen.id}/menu`);
  canteen = { ...canteen, ...r.canteen }; menu = r.items;
  loadCart();
  for (const id of Object.keys(cart)) if (!menu.some((m) => m.id === id)) delete cart[id];
  renderMenu(); renderCart();
}
async function loadOrders() {
  ({ orders } = await api('/api/food/orders/mine'));
  renderActive(); if (view === 'orders') renderOrders();
}

/* ---------- canteens ---------- */
function renderCanteens() {
  $('#canteens').innerHTML = canteens.map((c) => `<button class="chip" role="tab" aria-selected="${c.id === canteen.id}" aria-pressed="${c.id === canteen.id}" data-id="${esc(c.id)}"
    style="${c.id === canteen.id ? '' : 'background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.35)'}">${esc(c.name)}${c.open ? '' : ' · closed'}</button>`).join('');
  $('#canteen-meta').textContent = `${canteen.name}${canteen.place ? ' · ' + canteen.place : ''}${canteen.open ? '' : ' · not taking orders now'}`;
}
$('#canteens').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  canteen = canteens.find((c) => c.id === b.dataset.id); store.set('food_canteen', canteen.id);
  cat = 'All'; renderCanteens(); loadMenu(); subscribe();
});

/* ---------- menu ---------- */
function renderMenu() {
  $('#sample-note').innerHTML = canteen.sampleMenu ? '<p class="notice warn" style="margin-bottom:10px">This is a sample menu. Canteen staff replace it with today’s real items and prices.</p>' : '';
  const cats = ['All', ...new Set(menu.map((m) => m.category))];
  if (!cats.includes(cat)) cat = 'All';
  $('#cats').innerHTML = cats.map((c) => `<button class="chip" aria-pressed="${c === cat}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  const list = menu.filter((m) => (cat === 'All' || m.category === cat) && (!vegOnly || m.veg) && (!q || m.name.toLowerCase().includes(q)));
  if (!list.length) { $('#menu').innerHTML = `<p class="empty">${menu.length ? 'Nothing matches. Try another search or category.' : 'No items on the menu yet.'}</p>`; return; }
  const groups = {};
  for (const m of list) (groups[m.category] ||= []).push(m);
  $('#menu').innerHTML = Object.entries(groups).map(([g, items]) => `
    <section><h3 style="font-size:15px;margin:6px 0 8px">${esc(g)}</h3><ul class="list">${items.map((m) => {
      const n = cart[m.id] || 0;
      return `<li class="item" ${m.inStock ? '' : 'style="opacity:.6"'}>
        <span class="veg ${m.veg ? '' : 'non'}" title="${m.veg ? 'Veg' : 'Non-veg'}"></span><span class="sr">${m.veg ? 'Veg' : 'Non-veg'}</span>
        <div class="main"><b>${esc(m.name)}</b><div class="muted small">${money(m.price)} · about ${m.prepMins} min${m.inStock ? '' : ' · out of stock'}</div></div>
        ${!m.inStock ? '<span class="pill">Sold out</span>' : n
          ? `<span class="qty" aria-label="${esc(m.name)} quantity"><button data-dec="${m.id}" aria-label="One less ${esc(m.name)}">−</button><span>${n}</span><button data-inc="${m.id}" aria-label="One more ${esc(m.name)}">+</button></span>`
          : `<button class="btn soft sm" data-inc="${m.id}" ${canteen.open ? '' : 'disabled'}>Add</button>`}
      </li>`; }).join('')}</ul></section>`).join('');
}
$('#cats').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; renderMenu(); } });
$('#q').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); renderMenu(); });
$('#veg').addEventListener('change', (e) => { vegOnly = e.target.checked; renderMenu(); });
function bump(e) {
  const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
  if (!inc && !dec) return false;
  const id = (inc || dec).dataset.inc || (inc || dec).dataset.dec;
  cart[id] = Math.max(0, Math.min(20, (cart[id] || 0) + (inc ? 1 : -1)));
  if (!cart[id]) delete cart[id];
  saveCart(); renderMenu(); renderCart(); return true;
}
app.addEventListener('click', bump);

/* ---------- cart ---------- */
const cartLines = () => Object.entries(cart).map(([id, qty]) => ({ m: menu.find((x) => x.id === id), qty })).filter((l) => l.m);
const cartTotal = () => cartLines().reduce((n, l) => n + l.m.price * l.qty, 0);
function cartHtml() {
  const lines = cartLines();
  if (!lines.length) return '<p class="empty">Your cart is empty. Add something from the menu.</p>';
  return `<ul class="list">${lines.map((l) => `<li class="row between"><span class="grow">${l.qty} × ${esc(l.m.name)}</span>
      <span class="qty"><button data-dec="${l.m.id}" aria-label="One less ${esc(l.m.name)}">−</button><span>${l.qty}</span><button data-inc="${l.m.id}" aria-label="One more ${esc(l.m.name)}">+</button></span>
      <b class="num" style="min-width:56px;text-align:right">${money(l.m.price * l.qty)}</b></li>`).join('')}</ul>
    <div class="divider"></div>
    <div class="field"><label for="note">Note for the kitchen (optional)</label><input id="note" maxlength="140" placeholder="Less spicy, no onion…"></div>
    <div class="row between"><b>Total</b><b class="num" style="font-size:20px">${money(cartTotal())}</b></div>
    <p class="err" id="order-err" role="alert"></p>
    <button class="btn primary block" id="place" ${canteen.open ? '' : 'disabled'}>${canteen.open ? `Pay ${money(cartTotal())} & order` : `${esc(canteen.name)} is closed`}</button>`;
}
function renderCart() {
  const n = cartLines().reduce((a, l) => a + l.qty, 0);
  $('#cart-side').innerHTML = `<div class="card"><h3 style="margin-bottom:10px">Your order · ${esc(canteen.name)}</h3>${cartHtml()}</div>`;
  const bar = $('#cartbar');
  bar.hidden = !n || window.matchMedia('(min-width: 901px)').matches || view !== 'menu';
  bar.innerHTML = `<span>${n} item${n === 1 ? '' : 's'} · ${money(cartTotal())}</span><span>View cart →</span>`;
}
window.matchMedia('(min-width: 901px)').addEventListener('change', renderCart);
$('#cartbar').addEventListener('click', () => {
  const s = sheet({ title: `Your order · ${canteen.name}`, body: '<div id="sheet-cart"></div>' });
  const draw = () => { s.body.querySelector('#sheet-cart').innerHTML = cartHtml(); };
  draw();
  s.el.addEventListener('click', (e) => { if (bump(e)) { draw(); if (!cartLines().length) s.close(); } });
  s.el.addEventListener('click', (e) => { if (e.target.id === 'place') placeOrder(s); });
});
$('#cart-side').addEventListener('click', (e) => { if (e.target.id === 'place') placeOrder(); });

async function placeOrder(s) {
  const root = s ? s.el : $('#cart-side');
  const btn = root.querySelector('#place'), err = root.querySelector('#order-err');
  err.textContent = '';
  const note = root.querySelector('#note')?.value || '', items = cartLines().map((l) => ({ id: l.m.id, qty: l.qty }));
  if (s) s.close();
  paySheet({
    amount: cartTotal(), payee: canteen.name, phone: user.phone,
    onPay: async (pay) => {
      try {
        const { order } = await api('/api/food/orders', { method: 'POST', body: { canteenId: canteen.id, note, items, pay } });
        cart = {}; saveCart(); renderMenu(); renderCart(); loadOrders();
        return { ref: order.payment.ref, after: () => showToken(order) };
      } catch (x) { if (!String(x.code).startsWith('PAY')) { err.textContent = x.message; if (x.code === 'OUT_OF_STOCK') loadMenu(); } throw x; }
    },
  });
}
function showToken(order) {
  const done = sheet({ title: 'Order placed', body: `<div style="text-align:center"><p class="muted">Your token at ${esc(order.canteenName)}</p><p class="token" style="margin:8px 0">${esc(order.token)}</p>
    <p>${pill(order.status)} <span class="paid">✓ Paid ${money(order.total)}</span></p><p class="muted small" style="margin-top:10px">The kitchen has it. We’ll tell you here when it’s ready, then just show this token at the counter.</p></div>`,
    foot: '<button class="btn primary block" data-close>Done</button>' });
  done.el.querySelector('.sheet-foot [data-close]').addEventListener('click', done.close);
}

/* ---------- orders ---------- */
function renderActive() {
  const act = orders.filter((o) => ACTIVE.includes(o.status));
  $('#active').innerHTML = act.map((o) => `<div class="card row" style="${o.status === 'READY' ? 'border-color:var(--uh-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--uh-accent) 18%,transparent)' : ''}">
      <div><p class="muted small">Token</p><p class="token" style="font-size:32px">${esc(o.token)}</p></div>
      <div class="grow"><b>${esc(o.canteenName)}</b> ${pill(o.status)} ${o.payment?.status === 'PAID' ? `<span class="paid">✓ Paid ${money(o.total)}</span>` : o.payment?.status === 'REFUNDED' ? '<span class="pill">Refunded</span>' : ''}<p class="muted small">${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))} · ${money(o.total)}</p>
        ${o.status === 'READY' ? '<p class="small" style="margin-top:4px"><b>Ready at the counter.</b> Show this token to collect. Already paid.</p>' : ''}</div>
      ${o.status === 'PLACED' ? `<button class="btn danger sm" data-cancel="${o.id}">Cancel</button>` : ''}</div>`).join('');
}
function renderOrders() {
  $('#orders-view').innerHTML = orders.length ? `<ul class="list">${orders.map((o) => `<li class="item"><div class="main"><b>${esc(o.canteenName)} · Token ${esc(o.token)}</b>
      <div class="muted small">${esc(when(o.createdAt))} · ${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))}</div></div>
      <div style="text-align:right">${pill(o.status)}<div class="num" style="margin-top:4px"><b>${money(o.total)}</b></div></div></li>`).join('')}</ul>`
    : '<p class="empty">No orders yet. Your canteen orders will show up here.</p>';
}
app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cancel]'); if (!b) return;
  b.disabled = true;
  try { await api(`/api/food/orders/${b.dataset.cancel}/cancel`, { method: 'POST' }); toast('Order cancelled.'); loadOrders(); }
  catch (x) { toast(x.message); b.disabled = false; }
});
$$('.seg [data-view]').forEach((b) => b.addEventListener('click', () => {
  view = b.dataset.view; $$('.seg [data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('#menu-view').hidden = view !== 'menu'; $('#orders-view').hidden = view !== 'orders';
  if (view === 'orders') renderOrders(); renderCart();
}));

/* ---------- live ---------- */
let stop = () => {};
const seen = {};
function subscribe() {
  stop();
  stop = live([`food:u:${user.id}`, `food:menu:${canteen.id}`], async (d) => {
    if (d.topic.startsWith('food:menu:')) { await loadMenu(); const c = canteens.find((x) => x.id === canteen.id); if (c) c.open = canteen.open; renderCanteens(); return; }
    await loadOrders();
    if (d.status === 'READY' && !seen[d.id]) { seen[d.id] = 1; toast(`Token ${d.token} is ready. Collect it at the counter.`); }
    if (d.status === 'CANCELLED') toast(`Token ${d.token} was cancelled by the canteen.`);
  });
}

await loadCanteens();
if (!canteen) app.innerHTML = '<p class="empty">No canteens yet. An admin can add one.</p>';
else { await Promise.all([loadMenu(), loadOrders()]); subscribe(); }
