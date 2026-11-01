// Canteen staff: live order board, token check, menu and stock, open or closed.
import { $, $$, esc, money, when, api, toast, live, bar, sheet, staffGate, staffMenu } from '../hub/web/kit.js';

const actions = bar({ section: 'food', title: 'Canteen staff', back: './index.html', backLabel: 'Student view' });

staffGate({ expect: 'canteen', title: 'Canteen staff sign-in', onReady: start });

async function start(staff) {
  staffMenu(actions, staff);
  const app = $('#app');
  let canteenId = staff.role === 'admin' ? (new URLSearchParams(location.search).get('canteen') || 'foodys') : staff.place;
  const q = () => (staff.role === 'admin' ? `?canteen=${encodeURIComponent(canteenId)}` : '');
  let data = null, menu = [], tab = 'orders', fresh = new Set();
  const CATS = ['Breakfast', 'Meals', 'Snacks', 'Drinks', 'Desserts', 'Specials'];

  app.innerHTML = `
    <div class="row between" style="margin-bottom:14px">
      <div><h2 id="c-name" style="font-size:24px"></h2><p class="muted" id="c-place"></p></div>
      <div class="row">
        ${staff.role === 'admin' ? '<label for="pick" class="sr">Canteen</label><select id="pick" style="width:auto"></select>' : ''}
        <button class="btn" id="open-toggle"></button>
      </div>
    </div>
    <div class="stats" id="stats"></div>
    <div class="tabs" role="tablist" style="margin-top:16px">
      <button role="tab" aria-selected="true" data-tab="orders">Orders</button><button role="tab" aria-selected="false" data-tab="menu">Menu & stock</button>
    </div>
    <section id="t-orders">
      <form class="row card" id="verify" novalidate style="margin-bottom:14px">
        <label for="tok" class="grow" style="margin:0"><b>Hand over an order</b><span class="muted small" style="display:block;font-weight:400">Type the student’s token to mark it collected.</span></label>
        <input id="tok" placeholder="e.g. F12" autocomplete="off" autocapitalize="characters" style="width:130px;text-transform:uppercase">
        <button class="btn primary" type="submit">Collected</button>
        <p class="err" id="verr" role="alert" style="width:100%"></p>
      </form>
      <div class="board" id="board"></div>
      <h3 style="margin:22px 0 8px;font-size:15px">Finished today</h3><ul class="list" id="done"></ul>
    </section>
    <section id="t-menu" hidden>
      <div class="row between" style="margin-bottom:10px"><p class="muted">Tap a switch to mark an item in or out of stock. Students see changes straight away.</p><button class="btn primary sm" id="add-item">Add item</button></div>
      <ul class="list" id="menu-list"></ul>
    </section>`;

  async function load() {
    data = await api('/api/food/staff/board' + q());
    $('#c-name').textContent = data.canteen.name;
    $('#c-place').textContent = data.canteen.place || '';
    const ot = $('#open-toggle'); ot.className = 'btn ' + (data.canteen.open ? 'ghost' : 'primary');
    ot.textContent = data.canteen.open ? 'Taking orders · pause' : 'Paused · start taking orders';
    $('#stats').innerHTML = `<div class="stat"><b>${data.orders.filter((o) => o.status === 'PLACED').length}</b><span>New</span></div>
      <div class="stat"><b>${data.orders.filter((o) => o.status === 'PREPARING').length}</b><span>Preparing</span></div>
      <div class="stat"><b>${data.orders.filter((o) => o.status === 'READY').length}</b><span>Waiting for pickup</span></div>
      <div class="stat"><b>${data.stats.today}</b><span>Orders today</span></div>
      <div class="stat"><b>${money(data.stats.revenue)}</b><span>Collected today</span></div>`;
    renderBoard();
  }
  const ticket = (o, btns) => `<article class="ticket ${fresh.has(o.id) ? 'fresh' : ''}" aria-label="Token ${esc(o.token)}">
      <div class="row between"><span class="tok">${esc(o.token)}</span><span class="muted small">${esc(when(o.createdAt, { day: undefined, month: undefined }))}</span></div>
      <ul style="margin:8px 0;padding-left:18px">${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)}</li>`).join('')}</ul>
      ${o.note ? `<p class="notice small" style="margin-bottom:8px">“${esc(o.note)}”</p>` : ''}
      <p class="small muted">${esc(o.studentName)} · ${esc(o.phone)} · <b class="num" style="color:var(--uh-text)">${money(o.total)}</b></p>
      <div class="row" style="margin-top:10px">${btns}</div></article>`;
  function renderBoard() {
    const by = (s) => data.orders.filter((o) => o.status === s);
    const col = (title, list, btns) => `<section class="col"><h3><span>${title}</span><span class="pill">${list.length}</span></h3>${list.map((o) => ticket(o, btns(o))).join('') || '<p class="muted small" style="padding:4px">Nothing here.</p>'}</section>`;
    $('#board').innerHTML =
      col('New', by('PLACED'), (o) => `<button class="btn primary sm" data-st="PREPARING" data-id="${o.id}">Start preparing</button><button class="btn danger sm" data-st="CANCELLED" data-id="${o.id}">Reject</button>`)
      + col('Preparing', by('PREPARING'), (o) => `<button class="btn primary sm" data-st="READY" data-id="${o.id}">Mark ready</button><button class="btn danger sm" data-st="CANCELLED" data-id="${o.id}">Cancel</button>`)
      + col('Ready for pickup', by('READY'), (o) => `<button class="btn ok sm" data-st="COMPLETED" data-id="${o.id}">Collected</button>`);
    const done = data.orders.filter((o) => ['COMPLETED', 'CANCELLED'].includes(o.status)).reverse();
    $('#done').innerHTML = done.map((o) => `<li class="item"><b class="num" style="min-width:44px">${esc(o.token)}</b><div class="main small">${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))}<div class="muted">${esc(o.studentName)}</div></div>
      <span class="pill ${o.status === 'COMPLETED' ? 'ok' : 'bad'}">${o.status === 'COMPLETED' ? 'Collected' : 'Cancelled'}</span><b class="num">${money(o.total)}</b></li>`).join('') || '<li class="empty">Nothing finished yet today.</li>';
    fresh = new Set();
  }
  app.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-st]'); if (!b) return;
    if (b.dataset.st === 'CANCELLED' && !b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to confirm'; return; }
    b.disabled = true;
    try { await api(`/api/food/staff/orders/${b.dataset.id}/status`, { method: 'POST', body: { status: b.dataset.st } }); await load(); }
    catch (x) { toast(x.message); b.disabled = false; }
  });
  $('#verify').addEventListener('submit', async (e) => {
    e.preventDefault(); const t = $('#tok').value.trim(); $('#verr').textContent = '';
    if (!t) { $('#verr').textContent = 'Type a token first.'; return; }
    try { const { order } = await api('/api/food/staff/verify' + q(), { method: 'POST', body: { token: t } }); $('#tok').value = ''; toast(`Token ${order.token} handed over. Collect ${money(order.total)}.`); load(); }
    catch (x) { $('#verr').textContent = x.message; }
  });
  $('#tok').addEventListener('input', () => { $('#verr').textContent = ''; });
  $('#open-toggle').addEventListener('click', async () => {
    try { await api('/api/food/staff/canteen' + q(), { method: 'PUT', body: { open: !data.canteen.open } }); await load(); toast(data.canteen.open ? 'Taking orders again.' : 'Paused. Students can browse but not order.'); }
    catch (x) { toast(x.message); }
  });

  /* ----- menu ----- */
  async function loadMenu() { try { ({ items: menu } = await api('/api/food/staff/menu' + q())); } catch (x) { toast(x.message); menu = []; } renderMenu(); }
  function renderMenu() {
    $('#menu-list').innerHTML = menu.map((m) => `<li class="item"><span class="veg ${m.veg ? '' : 'non'}"></span>
      <div class="main"><b>${esc(m.name)}</b><div class="muted small">${esc(m.category)} · ${money(m.price)} · ${m.prepMins} min</div></div>
      <label class="check"><input type="checkbox" data-stock="${m.id}" ${m.inStock ? 'checked' : ''}> In stock</label>
      <button class="btn ghost sm" data-edit="${m.id}">Edit</button></li>`).join('') || '<li class="empty">No items yet. Add your first one.</li>';
  }
  $('#menu-list').addEventListener('change', async (e) => {
    const c = e.target.closest('[data-stock]'); if (!c) return;
    try { await api(`/api/food/staff/menu/${c.dataset.stock}`, { method: 'PUT', body: { inStock: c.checked } }); toast(c.checked ? 'Back in stock.' : 'Marked out of stock.'); }
    catch (x) { toast(x.message); c.checked = !c.checked; }
  });
  function editItem(m) {
    const s = sheet({
      title: m ? 'Edit item' : 'Add item',
      body: `<form id="mf" novalidate>
        <div class="field"><label for="mf-name">Name</label><input id="mf-name" value="${esc(m?.name || '')}" maxlength="60"></div>
        <div class="form-grid">
          <div class="field"><label for="mf-cat">Category</label><select id="mf-cat">${CATS.map((c) => `<option ${m?.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="field"><label for="mf-price">Price (₹)</label><input id="mf-price" inputmode="numeric" value="${m?.price ?? ''}"></div>
          <div class="field"><label for="mf-prep">Prep time (min)</label><input id="mf-prep" inputmode="numeric" value="${m?.prepMins ?? 10}"></div>
        </div>
        <label class="check"><input type="checkbox" id="mf-veg" ${m ? (m.veg ? 'checked' : '') : 'checked'}> Vegetarian</label>
        <p class="err" id="mf-err" role="alert"></p></form>`,
      foot: `<button class="btn primary block" id="mf-save">${m ? 'Save' : 'Add to menu'}</button>${m ? '<button class="btn danger block" id="mf-del">Remove from menu</button>' : ''}`,
    });
    s.el.querySelector('#mf-save').addEventListener('click', async () => {
      const body = { name: $('#mf-name').value, category: $('#mf-cat').value, price: Number($('#mf-price').value), prepMins: Number($('#mf-prep').value), veg: $('#mf-veg').checked };
      try { await api(m ? `/api/food/staff/menu/${m.id}` : '/api/food/staff/menu' + q(), { method: m ? 'PUT' : 'POST', body }); s.close(); toast(m ? 'Saved.' : 'Added to the menu.'); loadMenu(); }
      catch (x) { $('#mf-err').textContent = x.message; }
    });
    s.el.querySelector('#mf-del')?.addEventListener('click', async (e) => {
      if (!e.target.dataset.sure) { e.target.dataset.sure = '1'; e.target.textContent = 'Tap again to remove'; return; }
      try { await api(`/api/food/staff/menu/${m.id}`, { method: 'DELETE' }); s.close(); toast('Removed.'); loadMenu(); } catch (x) { $('#mf-err').textContent = x.message; }
    });
  }
  $('#add-item').addEventListener('click', () => editItem(null));
  $('#menu-list').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) editItem(menu.find((m) => m.id === b.dataset.edit)); });

  $$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab; $$('.tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('#t-orders').hidden = tab !== 'orders'; $('#t-menu').hidden = tab !== 'menu';
    if (tab === 'menu') loadMenu();
  }));

  let stop = () => {};
  const subscribe = () => {
    stop();
    stop = live([`food:c:${canteenId}`], (d) => {
      if (d.status === 'PLACED') { fresh.add(d.id); toast('New order.'); try { navigator.vibrate?.(150); } catch { /* not supported */ } }
      load();
    });
  };
  if (staff.role === 'admin') {
    const { places } = await api('/api/admin/overview');
    $('#pick').innerHTML = places.canteen.map((c) => `<option value="${esc(c.id)}" ${c.id === canteenId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    $('#pick').addEventListener('change', (e) => { canteenId = e.target.value; history.replaceState(null, '', '?canteen=' + canteenId); load(); loadMenu(); subscribe(); });
  }
  await load(); subscribe();
  setInterval(load, 60000); // backup for missed live updates
}
