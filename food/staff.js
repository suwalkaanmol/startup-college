// Canteen owner dashboard: paid orders with start-by times, Done / Collected, printable bills,
// menu and daily stock, sales history with item counts, and the canteen's own settings.
import { $, $$, esc, money, when, api, toast, live, bar, pill, sheet, staffGate, staffMenu, printBill, clock, todayYmd } from '../hub/web/kit.js';

const actions = bar({ section: 'food', title: 'Canteen owner', back: 'index.html', backLabel: 'Food' });
staffGate({ expect: 'canteen', title: 'Owner sign in', onReady: start });

async function start(staff) {
  staffMenu(actions, staff);
  const app = $('#app');
  const isAdmin = staff.role === 'admin';
  let cid = isAdmin ? (new URLSearchParams(location.search).get('canteen') || '') : staff.place;
  let places = [];
  if (isAdmin) { places = (await api('/api/staff/places')).canteen; cid ||= places[0]?.id; }
  const q = () => `canteen=${encodeURIComponent(cid)}`;
  let tab = 'orders', filter = 'active', board = null, menu = [], menuQ = '';

  app.innerHTML = `
    <div class="row between" style="margin:8px 0 14px;flex-wrap:wrap;gap:10px">
      <div><h2 id="c-name" style="font-size:24px"></h2><p class="muted" id="c-sub"></p></div>
      <div class="row" style="gap:8px">${isAdmin ? `<label for="pick" class="sr">Canteen</label><select id="pick" style="width:auto">${places.map((p) => `<option value="${p.id}" ${p.id === cid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
        <label class="check" style="margin:0"><input type="checkbox" id="open-t"> Taking orders</label></div>
    </div>
    <div class="tabs" role="tablist">${[['orders', 'Orders'], ['menu', 'Menu'], ['history', 'History'], ['settings', 'Settings']].map(([k, l], i) => `<button role="tab" data-tab="${k}" aria-selected="${i === 0}">${l}${k === 'orders' ? ' <span id="pend-n"></span>' : ''}</button>`).join('')}</div>
    <section id="t-orders"></section><section id="t-menu" hidden></section><section id="t-history" hidden></section><section id="t-settings" hidden></section>`;
  $('#pick')?.addEventListener('change', (e) => { cid = e.target.value; history.replaceState(null, '', `?${q()}`); $('#t-orders').innerHTML = ''; reloadAll(); });
  $('#open-t').addEventListener('change', async (e) => {
    try { await api(`/api/food/staff/canteen?${q()}`, { method: 'PUT', body: { open: e.target.checked } }); toast(e.target.checked ? 'Taking orders again.' : 'Paused. Students can’t order until you switch this back on.'); loadBoard(); }
    catch (x) { toast(x.message); }
  });
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab; $$('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    for (const k of ['orders', 'menu', 'history', 'settings']) $('#t-' + k).hidden = k !== tab;
    ({ orders: loadBoard, menu: loadMenu, history: loadHistory, settings: drawSettings })[tab]();
  }));

  /* ---------- orders ---------- */
  const billOf = (o) => ({ place: board.canteen.name, token: o.token, at: o.createdAt, total: o.total,
    rows: [['Ordered', clock(o.createdAt)], ['Collect at', clock(o.pickupAt)], ['Est. prep time', `~${o.prepMins} min`], ['Type', o.mode === 'dinein' ? 'Dine-in' : 'Take-away'], ['Student', `${o.studentName} · ${o.regNo || ''}`], ['UPI ref', o.payment?.ref || '']],
    lines: o.items.map((i) => [`${i.name} × ${i.qty}`, i.price * i.qty]) });
  function orderCard(o) {
    const late = o.status === 'PLACED' && new Date(o.pickupAt) < new Date();
    return `<article class="card stack ticket ${o.status === 'READY' ? 'is-ready' : ''}" style="gap:8px">
      <div class="row between"><p class="token" style="font-size:30px">${esc(o.token)}</p><div style="text-align:right"><b>Pickup ${clock(o.pickupAt)}</b>${late ? ' <span class="pill bad">Late</span>' : ''}<p class="muted small">${money(o.total)} · ordered ${clock(o.createdAt)}</p></div></div>
      <ul class="small" style="margin:0;padding-left:18px">${o.items.map((i) => `<li><b>${esc(i.name)} × ${i.qty}</b>${o.status === 'PLACED' ? ` <span class="muted">· start by ${clock(i.startBy)}</span>` : ''}</li>`).join('')}</ul>
      <p class="small muted">${esc(o.studentName)} · ${esc(o.phone || '')} · ${o.mode === 'dinein' ? 'Dine-in' : 'Take-away'} · <span class="paid">✓ Paid online</span>${o.note ? `<br><b style="color:var(--uh-text)">Note:</b> ${esc(o.note)}` : ''}</p>
      <div class="row" style="gap:6px;flex-wrap:wrap">${pill(o.status === 'PLACED' ? 'PENDING' : o.status === 'READY' ? 'READY' : o.status)}
        ${o.status === 'PLACED' ? `<button class="btn primary sm" data-st="${o.id}:READY">Done ✓</button>` : ''}
        ${o.status === 'READY' ? `<span class="pill ok">Waiting for student</span><button class="btn primary sm" data-st="${o.id}:COLLECTED">Collected ✓</button>` : ''}
        <button class="btn ghost sm" data-bill="${o.id}">🖨 Print bill</button>
        ${o.status === 'PLACED' ? `<button class="btn danger sm" data-st="${o.id}:CANCELLED">Cancel &amp; refund</button>` : ''}</div>
    </article>`;
  }
  function drawBoard() {
    const c = board.canteen;
    $('#c-name').textContent = c.name; $('#c-sub').textContent = `${c.place || ''}${c.upi ? ` · UPI ${c.upi}` : ''}`;
    $('#open-t').checked = c.open;
    $('#pend-n').textContent = board.counts.pending ? `(${board.counts.pending})` : '';
    const list = board.orders.filter((o) => filter === 'active' ? ['PLACED', 'READY'].includes(o.status) : filter === 'collected' ? o.status === 'COLLECTED' : true);
    const box = $('#t-orders');
    if (!box.querySelector('#o-list')) {
      // Built once, so live updates never wipe what the owner is typing in the token box.
      box.innerHTML = `<div class="stat-row" id="o-stats"></div>
        <form id="verify" class="row" novalidate style="margin:14px 0;gap:8px"><label for="tok" class="sr">Token</label><input id="tok" class="grow" autocomplete="off" autocapitalize="characters" placeholder="Search a token to hand over or check it"><button class="btn primary" type="submit">Check</button></form>
        <p id="v-out" class="small" role="status"></p>
        <div class="seg" role="group" aria-label="Show" id="o-seg">${[['active', 'To do'], ['collected', 'Collected'], ['all', 'All today']].map(([k, l]) => `<button data-filter="${k}">${l}</button>`).join('')}</div>
        <div class="grid-cards" style="margin-top:12px" id="o-list"></div>`;
    }
    box.querySelector('#o-stats').innerHTML = `
        <button class="stat" data-filter="active"><b class="num" style="color:var(--uh-warn)">${board.counts.pending}</b><span>Pending</span></button>
        <button class="stat" data-filter="active"><b class="num" style="color:var(--uh-ok)">${board.counts.ready}</b><span>Ready</span></button>
        <button class="stat" data-filter="collected"><b class="num">${board.counts.collected}</b><span>Collected today</span></button>
        <div class="stat"><b class="num">${money(board.revenueToday)}</b><span>Paid today</span></div>`;
    box.querySelectorAll('#o-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    box.querySelector('#o-list').innerHTML = list.map(orderCard).join('') || '<p class="empty" style="grid-column:1/-1">No orders here yet. Paid orders appear the moment students pay.</p>';
  }
  async function loadBoard() { board = await api(`/api/food/staff/board?${q()}`); if (tab === 'orders') drawBoard(); else { $('#c-name').textContent = board.canteen.name; $('#open-t').checked = board.canteen.open; } }

  app.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.filter) { filter = t.dataset.filter; drawBoard(); }
    if (t.dataset.st) {
      const [id, status] = t.dataset.st.split(':');
      if (status === 'CANCELLED' && !t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Tap again to cancel'; return; }
      t.disabled = true;
      try { await api(`/api/food/staff/orders/${id}/status?${q()}`, { method: 'POST', body: { status } }); toast(status === 'READY' ? 'Marked ready. The student has been told.' : status === 'COLLECTED' ? 'Collected. Their token expires in 2 hours.' : 'Cancelled and refunded.'); await loadBoard(); }
      catch (x) { toast(x.message); t.disabled = false; }
    }
    if (t.dataset.bill) { const o = board.orders.find((x) => x.id === t.dataset.bill); if (o) printBill(billOf(o)); }
  });
  app.addEventListener('submit', async (e) => {
    if (e.target.id !== 'verify') return; e.preventDefault();
    const token = $('#tok').value.trim(); if (!token) return;
    const o = board.orders.find((x) => x.token.toUpperCase() === token.toUpperCase());
    const out = $('#v-out');
    if (o && o.status === 'READY') {
      try { await api(`/api/food/staff/verify?${q()}`, { method: 'POST', body: { token } }); out.innerHTML = `<b style="color:var(--uh-ok)">✓ ${esc(o.token)} handed over.</b> ${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))}`; $('#tok').value = ''; loadBoard(); }
      catch (x) { out.textContent = x.message; }
    } else out.innerHTML = o ? `<b>${esc(o.token)}</b>: ${pill(o.status === 'PLACED' ? 'PENDING' : o.status)} · pickup ${clock(o.pickupAt)} · ${esc(o.items.map((i) => `${i.qty}× ${i.name}`).join(', '))}` : `No order ${esc(token.toUpperCase())} today.`;
  });

  /* ---------- menu and stock ---------- */
  async function loadMenu() { ({ items: menu } = await api(`/api/food/staff/menu?${q()}`)); drawMenu(); }
  function drawMenu() {
    const shown = menu.filter((m) => !menuQ || m.name.toLowerCase().includes(menuQ));
    const cats = [...new Set(shown.map((m) => m.category))];
    $('#t-menu').innerHTML = `<div class="row" style="gap:8px;margin:14px 0"><label for="mq" class="sr">Search the menu</label><input id="mq" class="grow" type="search" placeholder="Search ${menu.length} dishes" value="${esc(menuQ)}"><button class="btn primary" id="add-item">+ Add dish</button></div>
      <p class="muted small" style="margin-bottom:8px">“Left today” goes down by itself as students order. Set a daily limit to refill it every morning; leave it empty for no limit.</p>
      ${cats.map((k) => `<h3 class="cat-h">${esc(k)}</h3><div class="stack" style="gap:8px">${shown.filter((m) => m.category === k).map((m) => `
        <div class="card row menu-row" style="padding:10px 12px;gap:10px">
          <span class="veg ${m.veg ? '' : 'non'}"><span class="sr">${m.veg ? 'Veg' : 'Non-veg'}</span></span>
          <div class="grow"><b>${esc(m.name)}</b><p class="muted small">${money(m.price)} · ~${m.prepMins} min</p></div>
          <label class="small qty-edit">Left today <input type="number" min="0" inputmode="numeric" data-left="${m.id}" value="${m.qtyLeft ?? ''}" placeholder="∞"></label>
          <label class="small qty-edit">Daily limit <input type="number" min="0" inputmode="numeric" data-daily="${m.id}" value="${m.dailyQty ?? ''}" placeholder="none"></label>
          <label class="check small" style="margin:0"><input type="checkbox" data-avail="${m.id}" ${m.available ? 'checked' : ''}> On menu</label>
          <button class="btn ghost sm" data-edit="${m.id}">Edit</button></div>`).join('')}</div>`).join('') || '<p class="empty">No dishes match.</p>'}`;
    $('#mq').addEventListener('input', (e) => { menuQ = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; drawMenu(); const i = $('#mq'); i.focus(); i.setSelectionRange(pos, pos); });
    $('#add-item').addEventListener('click', () => itemSheet());
  }
  $('#t-menu').addEventListener('change', async (e) => {
    const t = e.target; let id, body;
    if (t.dataset.avail) { id = t.dataset.avail; body = { available: t.checked }; }
    else if (t.dataset.left) { id = t.dataset.left; body = { qtyLeft: t.value === '' ? null : Number(t.value) }; }
    else if (t.dataset.daily) { id = t.dataset.daily; body = { dailyQty: t.value === '' ? null : Number(t.value) }; }
    else return;
    try { const { item } = await api(`/api/food/staff/menu/${id}?${q()}`, { method: 'PUT', body }); menu = menu.map((m) => (m.id === id ? item : m)); toast(`${item.name} saved.`); if ('dailyQty' in body) drawMenu(); }
    catch (x) { toast(x.message); loadMenu(); }
  });
  $('#t-menu').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) itemSheet(menu.find((m) => m.id === b.dataset.edit)); });
  function itemSheet(m) {
    const cats = [...new Set(menu.map((x) => x.category))];
    const s = sheet({
      title: m ? `Edit ${m.name}` : 'Add a dish',
      body: `<form id="it" novalidate class="stack">
        <div class="field"><label for="i-name">Name</label><input id="i-name" maxlength="60" value="${esc(m?.name || '')}"></div>
        <div class="form-grid"><div class="field"><label for="i-cat">Category</label><input id="i-cat" list="cats" maxlength="30" value="${esc(m?.category || '')}"><datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div class="field"><label for="i-price">Price (₹)</label><input id="i-price" inputmode="numeric" value="${m?.price ?? ''}"></div>
          <div class="field"><label for="i-prep">Minutes to prepare</label><input id="i-prep" inputmode="numeric" value="${m?.prepMins ?? 15}"></div></div>
        <div class="seg" role="group" aria-label="Veg or non-veg" id="i-veg"><button type="button" data-v="1" aria-pressed="${m ? m.veg : true}">Veg</button><button type="button" data-v="0" aria-pressed="${m ? !m.veg : false}">Non-veg</button></div>
        <p class="err" id="i-err" role="alert"></p></form>`,
      foot: `<button class="btn primary block" id="i-save">${m ? 'Save' : 'Add to menu'}</button>${m ? '<button class="btn danger block" id="i-del">Remove from menu</button>' : ''}`,
    });
    let veg = m ? m.veg : true;
    s.el.querySelector('#i-veg').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; veg = b.dataset.v === '1'; s.el.querySelectorAll('#i-veg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    s.el.querySelector('#i-save').addEventListener('click', async () => {
      const body = { name: $('#i-name').value, category: $('#i-cat').value, price: Number($('#i-price').value), prepMins: Number($('#i-prep').value), veg };
      try { await api(m ? `/api/food/staff/menu/${m.id}?${q()}` : `/api/food/staff/menu?${q()}`, { method: m ? 'PUT' : 'POST', body }); s.close(); toast(m ? 'Saved.' : 'Added to the menu.'); loadMenu(); }
      catch (x) { $('#i-err').textContent = x.message; }
    });
    s.el.querySelector('#i-del')?.addEventListener('click', async (e) => {
      if (!e.target.dataset.sure) { e.target.dataset.sure = '1'; e.target.textContent = 'Tap again to remove'; return; }
      try { await api(`/api/food/staff/menu/${m.id}?${q()}`, { method: 'DELETE' }); s.close(); toast('Removed.'); loadMenu(); } catch (x) { $('#i-err').textContent = x.message; }
    });
  }

  /* ---------- history ---------- */
  const ymd = (d) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const ago = (n) => ymd(new Date(Date.now() - n * 86400e3));
  let range = { from: todayYmd(), to: todayYmd() }, itemQ = '';
  async function loadHistory() {
    const box = $('#t-history');
    box.innerHTML = `<div class="card" style="margin-top:14px"><div class="form-grid"><div class="field"><label for="h-from">From</label><input type="date" id="h-from" value="${range.from}" max="${todayYmd()}"></div><div class="field"><label for="h-to">To</label><input type="date" id="h-to" value="${range.to}" max="${todayYmd()}"></div></div>
      <div class="chips">${[['Today', 0, 0], ['Yesterday', 1, 1], ['Last 7 days', 6, 0], ['This month', -1, 0]].map(([l, a, b]) => `<button class="chip" data-range="${a}:${b}">${l}</button>`).join('')}</div></div>
      <div id="h-out"><p class="muted" style="margin-top:12px">Loading…</p></div>`;
    const go = async () => {
      try {
        const h = await api(`/api/food/staff/history?${q()}&from=${range.from}&to=${range.to}`);
        drawHistory(h);
      } catch (x) { $('#h-out').innerHTML = `<p class="err">${esc(x.message)}</p>`; }
    };
    box.querySelector('#h-from').addEventListener('change', (e) => { range.from = e.target.value; go(); });
    box.querySelector('#h-to').addEventListener('change', (e) => { range.to = e.target.value; go(); });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-range]'); if (!b) return;
      const [a, z] = b.dataset.range.split(':').map(Number);
      range = a < 0 ? { from: todayYmd().slice(0, 8) + '01', to: todayYmd() } : { from: ago(a), to: ago(z) };
      box.querySelector('#h-from').value = range.from; box.querySelector('#h-to').value = range.to; go();
    });
    go();
  }
  function drawHistory(h) {
    const maxH = Math.max(1, ...h.hours); const busiest = h.hours.indexOf(Math.max(...h.hours));
    const top = h.items.slice(0, 8); const maxQ = Math.max(1, ...top.map((i) => i.qty));
    const hourLabel = (n) => `${((n + 11) % 12) + 1}${n < 12 ? 'am' : 'pm'}`;
    const itemBox = () => {
      const it = h.items.find((i) => i.name.toLowerCase() === itemQ.toLowerCase()) || (itemQ && h.items.find((i) => i.name.toLowerCase().includes(itemQ.toLowerCase())));
      return !itemQ ? '' : it ? `<div class="card" style="margin-top:8px"><div class="row between"><b>${esc(it.name)}</b><span><b class="num">${it.qty}</b> sold · <b class="num">${money(it.revenue)}</b></span></div>
        <ul class="list" style="margin-top:6px">${Object.entries(it.byDay).sort().map(([d, n]) => `<li class="row between small"><span>${esc(new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))}</span><b>${n}</b></li>`).join('')}</ul></div>` : `<p class="muted small" style="margin-top:8px">No sales of “${esc(itemQ)}” in these dates.</p>`;
    };
    $('#h-out').innerHTML = `
      <div class="stat-row" style="margin-top:12px"><div class="stat"><b class="num">${h.totals.orders}</b><span>Orders</span></div><div class="stat"><b class="num" style="color:var(--uh-ok)">${money(h.totals.revenue)}</b><span>Total of all orders</span></div>
        <div class="stat"><b class="num">${h.totals.students}</b><span>Students</span></div><div class="stat"><b class="num">${h.forecast.weeksWithData ? h.forecast.expected : '—'}</b><span>Expected today${h.forecast.weeksWithData ? '' : ' (needs a week of orders)'}</span></div></div>
      <div class="cols2" style="margin-top:12px">
        <div class="card"><h3 style="margin-bottom:8px">Day by day</h3><ul class="list">${h.byDay.map((d) => `<li class="row between small"><span>${esc(new Date(d.day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }))}</span><span>${d.orders} orders · <b>${money(d.revenue)}</b></span></li>`).join('') || '<li class="empty">No orders in these dates.</li>'}</ul></div>
        <div class="card"><h3 style="margin-bottom:8px">What students eat most</h3>${top.map((i) => `<div class="hbar"><span>${esc(i.name)}</span><i style="width:${(i.qty / maxQ) * 100}%"></i><b class="num">${i.qty}</b></div>`).join('') || '<p class="muted small">Nothing yet.</p>'}</div>
      </div>
      <div class="card" style="margin-top:12px"><h3 style="margin-bottom:4px">Busy hours</h3><p class="muted small" style="margin-bottom:8px">${h.totals.orders ? `Most orders around ${hourLabel(busiest)}. Plan staff and stock for that time.` : 'Shows when students order, once there are orders.'}</p>
        <div class="hours" role="img" aria-label="Orders by hour">${h.hours.map((n, i) => (i >= 7 && i <= 23 ? `<div title="${hourLabel(i)}: ${n} orders"><i style="height:${(n / maxH) * 100}%"></i><span>${i % 3 === 0 ? hourLabel(i) : ''}</span></div>` : '')).join('')}</div></div>
      <div class="card" style="margin-top:12px"><h3 style="margin-bottom:4px">Item sales</h3><p class="muted small">Pick a dish, or type part of a name like “dosa”, to see how many were sold.</p>
        <div class="row" style="gap:8px;margin-top:8px"><label for="iq" class="sr">Dish</label><input id="iq" class="grow" list="dishes" value="${esc(itemQ)}" placeholder="Search a dish"><datalist id="dishes">${h.items.map((i) => `<option value="${esc(i.name)}">`).join('')}</datalist></div><div id="iq-out">${itemBox()}</div></div>
      <div class="card" style="margin-top:12px"><h3 style="margin-bottom:4px">Orders</h3><p class="muted small" style="margin-bottom:8px">Tap an order to see what was ordered.</p>
        ${h.orders.map((o) => `<details class="ord"><summary><b>${esc(o.token)}</b> <span class="muted small">${esc(when(o.createdAt))}</span><span class="grow"></span><b class="num">${money(o.total)}</b> <span class="small muted">· ${o.status === 'COLLECTED' ? 'Collected' : o.status === 'CANCELLED' ? 'Cancelled' : o.status === 'READY' ? 'Ready' : 'Pending'}</span></summary>
          <ul class="list small">${o.items.map((i) => `<li class="row between"><span>${esc(i.name)} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></li>`).join('')}</ul></details>`).join('') || '<p class="empty">No orders in these dates.</p>'}</div>`;
    $('#iq').addEventListener('input', (e) => { itemQ = e.target.value.trim(); $('#iq-out').innerHTML = itemBox(); });
  }

  /* ---------- settings ---------- */
  function drawSettings() {
    const c = board.canteen;
    $('#t-settings').innerHTML = `<form class="card" id="set" novalidate style="margin-top:14px;max-width:560px">
      <h3 style="margin-bottom:10px">${esc(c.name)} settings</h3>
      <div class="field"><label for="s-upi">UPI ID for payments</label><input id="s-upi" value="${esc(c.upi || '')}" placeholder="kcfoods@okaxis" autocapitalize="none"><p class="muted small">Students pay straight to this UPI ID. It shows on their payment screen.</p></div>
      <div class="field"><label for="s-place">Where students collect</label><input id="s-place" maxlength="60" value="${esc(c.place || '')}"></div>
      <p class="err" id="s-err" role="alert"></p><button class="btn primary" type="submit">Save</button></form>`;
    $('#set').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api(`/api/food/staff/canteen?${q()}`, { method: 'PUT', body: { upi: $('#s-upi').value, place: $('#s-place').value } }); toast('Saved.'); await loadBoard(); drawSettings(); }
      catch (x) { $('#s-err').textContent = x.message; }
    });
  }

  let stop = () => {};
  async function reloadAll() {
    stop(); await loadBoard();
    stop = live([`food:c:${cid}`], (d) => { loadBoard(); if (d.status === 'PLACED') toast(`New paid order ${d.token}.`); });
    if (tab !== 'orders') ({ menu: loadMenu, history: loadHistory, settings: drawSettings })[tab]();
  }
  setInterval(() => { if (tab === 'orders') loadBoard(); }, 60000);
  await reloadAll();
}
