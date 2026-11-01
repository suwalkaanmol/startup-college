// Xerox shop staff: live print queue, open each PDF, move orders along, open or close, set prices.
import { $, $$, esc, money, when, api, toast, live, bar, staffGate, staffMenu } from '../hub/web/kit.js';

const actions = bar({ section: 'xerox', title: 'Xerox shop staff', back: './index.html', backLabel: 'Student view' });
staffGate({ expect: 'xerox', title: 'Xerox shop staff sign-in', onReady: start });

async function start(staff) {
  staffMenu(actions, staff);
  const app = $('#app');
  let shopId = staff.role === 'admin' ? (new URLSearchParams(location.search).get('shop') || 'prp') : staff.place;
  const q = () => (staff.role === 'admin' ? `?shop=${encodeURIComponent(shopId)}` : '');
  let data = null, fresh = new Set();

  app.innerHTML = `
    <div class="row between" style="margin-bottom:14px">
      <div><h2 id="s-name" style="font-size:24px"></h2><p class="muted">Files are deleted automatically 3 days after upload.</p></div>
      <div class="row">${staff.role === 'admin' ? '<label for="pick" class="sr">Shop</label><select id="pick" style="width:auto"></select>' : ''}<button class="btn" id="open-toggle"></button></div>
    </div>
    <div class="stats" id="stats"></div>
    <div class="tabs" role="tablist" style="margin-top:16px"><button role="tab" aria-selected="true" data-tab="queue">Print queue</button><button role="tab" aria-selected="false" data-tab="prices">Prices</button></div>
    <section id="t-queue"><div class="board" id="board"></div><h3 style="margin:22px 0 8px;font-size:15px">Finished today</h3><ul class="list" id="done"></ul></section>
    <section id="t-prices" hidden><form class="card" id="rates" novalidate style="max-width:520px"><p class="muted" style="margin-bottom:12px">Prices per sheet of paper. “Both sides” is the price for one sheet printed on both sides.</p>
      <div class="form-grid">
        <div class="field"><label for="r-bws">B&amp;W, one side (₹)</label><input id="r-bws" inputmode="numeric"></div>
        <div class="field"><label for="r-bwd">B&amp;W, both sides (₹)</label><input id="r-bwd" inputmode="numeric"></div>
        <div class="field"><label for="r-cs">Colour, one side (₹)</label><input id="r-cs" inputmode="numeric"></div>
        <div class="field"><label for="r-cd">Colour, both sides (₹)</label><input id="r-cd" inputmode="numeric"></div>
        <div class="field"><label for="r-sp">Spiral binding, per file (₹)</label><input id="r-sp" inputmode="numeric"></div>
      </div><p class="err" id="r-err" role="alert"></p><button class="btn primary" type="submit">Save prices</button></form></section>`;

  async function load() {
    data = await api('/api/xerox/staff/queue' + q());
    $('#s-name').textContent = data.shop.name;
    const ot = $('#open-toggle'); ot.className = 'btn ' + (data.shop.open ? 'ghost' : 'primary');
    ot.textContent = data.shop.open ? 'Open · close the shop' : 'Closed · open the shop';
    const by = (s) => data.orders.filter((o) => o.status === s);
    $('#stats').innerHTML = `<div class="stat"><b>${by('QUEUED').length}</b><span>In queue</span></div><div class="stat"><b>${by('PRINTING').length}</b><span>Printing</span></div>
      <div class="stat"><b>${by('READY').length}</b><span>Waiting for pickup</span></div><div class="stat"><b>${data.stats.today}</b><span>Orders today</span></div><div class="stat"><b>${money(data.stats.revenue)}</b><span>Collected today</span></div>`;
    const r = data.shop.rates;
    if (!$('#rates').dataset.dirty) { $('#r-bws').value = r.bwSingle; $('#r-bwd').value = r.bwDouble; $('#r-cs').value = r.colorSingle; $('#r-cd').value = r.colorDouble; $('#r-sp').value = r.spiral; }
    const ticket = (o, btns) => `<article class="ticket ${fresh.has(o.id) ? 'fresh' : ''}">
      <div class="row between"><span class="tok">${esc(o.token)}</span><span class="muted small">${esc(when(o.createdAt, { day: undefined, month: undefined }))}</span></div>
      <ul class="list" style="margin:10px 0">${o.files.map((f) => `<li class="small"><a href="/api/xerox/files/${esc(f.fileId)}" target="_blank" rel="noopener"><b>${esc(f.name)}</b></a><br>
        <span class="muted">Pages ${f.from}–${f.to} · ${f.copies} cop${f.copies === 1 ? 'y' : 'ies'} · ${f.color === 'bw' ? 'B&amp;W' : '<b style="color:var(--uh-text)">Colour</b>'} · ${f.sides === 'double' ? 'both sides' : 'one side'}${f.spiral ? ' · <b style="color:var(--uh-text)">spiral</b>' : ''} · ${f.sheets} sheets</span></li>`).join('')}</ul>
      ${o.note ? `<p class="notice small" style="margin-bottom:8px">“${esc(o.note)}”</p>` : ''}
      <p class="small muted">${esc(o.studentName)} · ${esc(o.phone)} · <b class="num" style="color:var(--uh-text)">${money(o.total)}</b> ${o.payment?.status === 'PAID' ? '<span class="paid">✓ Paid online</span>' : ''}</p>
      <div class="row" style="margin-top:10px">${btns}</div></article>`;
    const col = (title, list, btns) => `<section class="col"><h3><span>${title}</span><span class="pill">${list.length}</span></h3>${list.map((o) => ticket(o, btns(o))).join('') || '<p class="muted small" style="padding:4px">Nothing here.</p>'}</section>`;
    $('#board').innerHTML = col('In queue', by('QUEUED'), (o) => `<button class="btn primary sm" data-st="PRINTING" data-id="${o.id}">Start printing</button><button class="btn danger sm" data-st="CANCELLED" data-id="${o.id}">Reject</button>`)
      + col('Printing', by('PRINTING'), (o) => `<button class="btn primary sm" data-st="READY" data-id="${o.id}">Ready for pickup</button>`)
      + col('Ready for pickup', by('READY'), (o) => `<button class="btn ok sm" data-st="COLLECTED" data-id="${o.id}">Collected & paid</button>`);
    $('#done').innerHTML = data.orders.filter((o) => ['COLLECTED', 'CANCELLED'].includes(o.status)).reverse().map((o) => `<li class="item"><b class="num" style="min-width:44px">${esc(o.token)}</b>
      <div class="main small">${esc(o.files.map((f) => f.name).join(', '))}<div class="muted">${esc(o.studentName)}</div></div>
      <span class="pill ${o.status === 'COLLECTED' ? 'ok' : 'bad'}">${o.status === 'COLLECTED' ? 'Collected' : 'Cancelled'}</span><b class="num">${money(o.total)}</b></li>`).join('') || '<li class="empty">Nothing finished yet today.</li>';
    fresh = new Set();
  }
  app.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-st]'); if (!b) return;
    if (b.dataset.st === 'CANCELLED' && !b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to confirm'; return; }
    b.disabled = true;
    try { await api(`/api/xerox/staff/orders/${b.dataset.id}/status`, { method: 'POST', body: { status: b.dataset.st } }); await load(); }
    catch (x) { toast(x.message); b.disabled = false; }
  });
  $('#open-toggle').addEventListener('click', async () => {
    try { await api('/api/xerox/staff/shop' + q(), { method: 'PUT', body: { open: !data.shop.open } }); await load(); toast(data.shop.open ? 'Shop open. Students can send prints.' : 'Shop closed. Students can’t send new prints.'); }
    catch (x) { toast(x.message); }
  });
  $('#rates').addEventListener('input', () => { $('#rates').dataset.dirty = '1'; $('#r-err').textContent = ''; });
  $('#rates').addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = (id) => Number($(id).value);
    try { await api('/api/xerox/staff/shop' + q(), { method: 'PUT', body: { rates: { bwSingle: n('#r-bws'), bwDouble: n('#r-bwd'), colorSingle: n('#r-cs'), colorDouble: n('#r-cd'), spiral: n('#r-sp') } } }); delete $('#rates').dataset.dirty; toast('Prices saved. New orders use them.'); load(); }
    catch (x) { $('#r-err').textContent = x.message; }
  });
  $$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('#t-queue').hidden = b.dataset.tab !== 'queue'; $('#t-prices').hidden = b.dataset.tab !== 'prices';
  }));
  let stop = () => {};
  const subscribe = () => { stop(); stop = live([`xerox:s:${shopId}`], (d) => { if (d.status === 'QUEUED') { fresh.add(d.id); toast('New print order.'); } load(); }); };
  if (staff.role === 'admin') {
    const { places } = await api('/api/admin/overview');
    $('#pick').innerHTML = places.xerox.map((s) => `<option value="${esc(s.id)}" ${s.id === shopId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    $('#pick').addEventListener('change', (e) => { shopId = e.target.value; history.replaceState(null, '', '?shop=' + shopId); delete $('#rates').dataset.dirty; load(); subscribe(); });
  }
  await load(); subscribe(); setInterval(load, 60000);
}
