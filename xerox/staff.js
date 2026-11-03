// Xerox shop owner: paid orders oldest first, preview / print / download each file, mark downloaded and completed,
// hand over by token, set prices, open or close the shop, and answer students in the chat inbox.
import { $, $$, esc, money, when, api, toast, live, bar, pill, sheet, staffGate, staffMenu, printBill, clock } from '../hub/web/kit.js';

const actions = bar({ section: 'xerox', title: 'Xerox owner', back: 'index.html', backLabel: 'Xerox' });
staffGate({ expect: 'xerox', title: 'Owner sign in', onReady: start });

const RATE_LABELS = [['bwSingle', 'B&W one side (A4)'], ['bwDouble', 'B&W front & back (A4)'], ['colorSingle', 'Colour one side (A4)'], ['colorDouble', 'Colour front & back (A4)'],
  ['a3BwSingle', 'B&W one side (A3)'], ['a3BwDouble', 'B&W front & back (A3)'], ['a3ColorSingle', 'Colour one side (A3)'], ['a3ColorDouble', 'Colour front & back (A3)'], ['spiral', 'Spiral binding (per copy)'], ['staple', 'Staple (per copy)']];
const KIND = { pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', image: 'Image' };
const optLine = (f) => `${f.ranges.map((r) => (r.from === r.to ? `page ${r.from}` : `pages ${r.from}–${r.to}`)).join(', ')} · ${f.copies} cop${f.copies === 1 ? 'y' : 'ies'} · ${f.color === 'bw' ? 'black & white' : 'colour'} · ${f.size} · ${f.sides === 'double' ? 'front & back' : 'one side'}${f.nup > 1 ? ` · ${f.nup}-in-1 ${f.arrangement === 'vertical' ? 'top to bottom' : 'side by side'}` : ''}${f.binding !== 'none' ? ` · ${f.binding}` : ''}`;

async function start(staff) {
  staffMenu(actions, staff);
  const app = $('#app'); const isAdmin = staff.role === 'admin';
  let sid = isAdmin ? (new URLSearchParams(location.search).get('shop') || 'prp') : staff.place;
  const places = isAdmin ? (await api('/api/staff/places')).xerox : [];
  const q = () => `shop=${encodeURIComponent(sid)}`;
  let tab = 'queue', data = null, filter = 'todo';

  app.innerHTML = `
    <div class="row between" style="margin:8px 0 14px;flex-wrap:wrap;gap:10px">
      <div><h2 id="s-name" style="font-size:24px"></h2><p class="muted" id="s-sub">Owner dashboard</p></div>
      <div class="row" style="gap:8px">${isAdmin ? `<label for="pick" class="sr">Shop</label><select id="pick" style="width:auto">${places.map((p) => `<option value="${p.id}" ${p.id === sid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
        <label class="check" style="margin:0"><input type="checkbox" id="open-t"> Shop open</label></div></div>
    <div class="tabs" role="tablist">${[['queue', 'Queue'], ['prices', 'Prices'], ['settings', 'Shop settings'], ['chat', 'Chat']].map(([k, l], i) => `<button role="tab" data-tab="${k}" aria-selected="${i === 0}">${l}${k === 'chat' ? ' <span id="unread"></span>' : k === 'queue' ? ' <span id="wait-n"></span>' : ''}</button>`).join('')}</div>
    <section id="t-queue"></section><section id="t-prices" hidden></section><section id="t-settings" hidden></section><section id="t-chat" hidden></section>`;
  $('#pick')?.addEventListener('change', (e) => { sid = e.target.value; history.replaceState(null, '', `?${q()}`); $('#t-queue').innerHTML = ''; reloadAll(); });
  $('#open-t').addEventListener('change', async (e) => {
    try { await api(`/api/xerox/staff/shop?${q()}`, { method: 'PUT', body: { open: e.target.checked } }); toast(e.target.checked ? 'Shop open. Students can order.' : 'Shop closed. Students can’t order until you open it.'); load(); } catch (x) { toast(x.message); }
  });
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab; $$('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    for (const k of ['queue', 'prices', 'settings', 'chat']) $('#t-' + k).hidden = k !== tab;
    ({ queue: draw, prices: drawPrices, settings: drawSettings, chat: drawChat })[tab]();
  }));

  /* ---------- queue ---------- */
  async function load() { data = await api(`/api/xerox/staff/queue?${q()}`); head(); if (tab === 'queue') draw(); }
  function head() {
    $('#s-name').textContent = data.shop.name; $('#s-sub').textContent = `Owner dashboard${data.shop.upi ? ` · UPI ${data.shop.upi}` : ''}`;
    $('#open-t').checked = data.shop.open;
    $('#wait-n').textContent = data.stats.waiting ? `(${data.stats.waiting})` : '';
    $('#unread').textContent = data.unread ? `(${data.unread})` : '';
  }
  function draw() {
    const box = $('#t-queue');
    if (!box.querySelector('#q-list')) {
      box.innerHTML = `<div class="stat-row" id="q-stats"></div>
        <form id="verify" class="row" novalidate style="margin:14px 0;gap:8px"><label for="tok" class="sr">Token</label><input id="tok" class="grow" autocomplete="off" autocapitalize="characters" placeholder="Student’s token, to hand over prints"><button class="btn primary" type="submit">Hand over</button></form>
        <p id="v-out" class="small" role="status"></p>
        <div class="seg" role="group" aria-label="Show" id="q-seg">${[['todo', 'Queue'], ['ready', 'Ready'], ['all', 'All today']].map(([k, l]) => `<button data-filter="${k}">${l}</button>`).join('')}</div>
        <p class="muted small" style="margin-top:10px">Oldest first. Tap an order to open it.</p><div class="q-grid" id="q-list"></div>`;
    }
    const s = data.stats;
    box.querySelector('#q-stats').innerHTML = `<div class="stat"><b class="num" style="color:var(--uh-warn)">${s.waiting}</b><span>Waiting</span></div><div class="stat"><b class="num">${s.today}</b><span>Orders today</span></div><div class="stat"><b class="num">${s.collected}</b><span>Collected</span></div><div class="stat"><b class="num" style="color:var(--uh-ok)">${money(s.revenue)}</b><span>Paid today</span></div>`;
    box.querySelectorAll('#q-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    const list = data.orders.filter((o) => (filter === 'todo' ? ['QUEUED', 'PRINTING'].includes(o.status) : filter === 'ready' ? o.status === 'READY' : true));
    box.querySelector('#q-list').innerHTML = list.map((o) => `<button class="card q-card ${o.status === 'PRINTING' ? 'is-printing' : ''}" data-open="${o.id}">
        <span class="token" style="font-size:26px">${esc(o.token)}</span><span class="small">${o.files.reduce((n, f) => n + f.sheets, 0)} sheets · ${o.files.length} file${o.files.length === 1 ? '' : 's'}</span>
        <span class="small muted">${clock(o.createdAt)} · ${money(o.total)}</span>${pill(o.status === 'PRINTING' ? 'DOWNLOADED' : o.status)}</button>`).join('') || '<p class="empty" style="grid-column:1/-1">Nothing here. Paid orders appear the moment students pay.</p>';
  }
  const fileUrl = (f, dl) => `/api/xerox/shops/${sid}/files/${f.fileId}${dl ? '?download=1' : ''}`;
  async function bytesOf(f) { const r = await fetch(fileUrl(f)); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Couldn’t open the file.'); return { mime: r.headers.get('content-type'), bytes: new Uint8Array(await r.arrayBuffer()) }; }
  async function markDownloaded(o) { if (o.status === 'QUEUED') { try { await api(`/api/xerox/staff/orders/${o.id}/status?${q()}`, { method: 'POST', body: { status: 'PRINTING' } }); load(); } catch { /* already moved */ } } }

  function openOrder(o) {
    const s = sheet({
      title: `Token ${o.token}`,
      body: `<p class="muted small">Student: ${esc(o.studentName)} · ${esc(o.regNo || '')} · ${esc(o.phone || '')}<br>${esc(when(o.createdAt))} · Bill ${money(o.total)} · <span class="paid">✓ Paid online</span></p>
        ${o.note ? `<p class="notice small"><b>Note:</b> ${esc(o.note)}</p>` : ''}
        ${o.files.map((f, i) => `<div class="card stack" style="gap:6px"><b style="overflow-wrap:anywhere">${esc(f.name)}</b>
          <p class="small">${KIND[f.kind] || ''} · ${f.pages} pages · ${money(f.cost)}<br><b>${esc(optLine(f))}</b></p>
          <p class="muted small">${f.kind === 'pdf' || f.kind === 'image' ? `Print: ${f.size}, 1 page per sheet (the layout is already arranged), ${f.color === 'bw' ? 'black & white' : 'colour'}, ${f.sides === 'double' ? 'both sides' : 'one side'}, ${f.copies} cop${f.copies === 1 ? 'y' : 'ies'}.` : `Open the ${KIND[f.kind]} file and print ${esc(optLine(f))}.`}</p>
          <div class="row" style="gap:6px;flex-wrap:wrap">${f.kind === 'pdf' || f.kind === 'image' ? `<button class="btn ghost sm" data-pv="${i}">Preview</button><button class="btn ghost sm" data-print="${i}">Print</button>` : ''}<a class="btn ghost sm" href="${fileUrl(f, true)}" data-dl="${i}" download>Download</a></div></div>`).join('')}
        <div id="pv-box"></div>`,
      foot: `${o.status === 'QUEUED' ? '<button class="btn ghost block" id="o-dl">Mark as downloaded</button>' : ''}
        ${['QUEUED', 'PRINTING'].includes(o.status) ? `<button class="btn primary block" id="o-done">Mark order ${esc(o.token)} completed</button>` : ''}
        ${o.status === 'READY' ? `<button class="btn primary block" id="o-coll">Student collected ${esc(o.token)}</button>` : ''}
        <button class="btn ghost block" id="o-bill">🖨 Print bill</button>
        ${['QUEUED', 'PRINTING'].includes(o.status) ? '<button class="btn danger block" id="o-cancel">Cancel &amp; refund</button>' : ''}`,
    });
    const step = async (status, msg) => { try { await api(`/api/xerox/staff/orders/${o.id}/status?${q()}`, { method: 'POST', body: { status } }); s.close(); toast(msg); load(); } catch (x) { toast(x.message); } };
    s.el.querySelector('#o-dl')?.addEventListener('click', () => step('PRINTING', 'Marked as downloaded.'));
    s.el.querySelector('#o-done')?.addEventListener('click', () => step('READY', `${o.token} completed. The student has been told to collect.`));
    s.el.querySelector('#o-coll')?.addEventListener('click', () => step('COLLECTED', `${o.token} collected.`));
    s.el.querySelector('#o-cancel')?.addEventListener('click', (e) => { if (!e.target.dataset.sure) { e.target.dataset.sure = '1'; e.target.textContent = 'Tap again to cancel and refund'; return; } step('CANCELLED', 'Cancelled and refunded.'); });
    s.el.querySelector('#o-bill').addEventListener('click', () => printBill({ place: data.shop.name, token: o.token, at: o.createdAt, total: o.total, rows: [['Time', clock(o.createdAt)], ['Student', o.studentName], ['UPI ref', o.payment?.ref || '']], lines: o.files.map((f) => [`${f.name} (${f.sheets} sheets)`, f.cost]) }));
    s.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pv], [data-print], [data-dl]'); if (!b) return;
      const f = o.files[Number(b.dataset.pv ?? b.dataset.print ?? b.dataset.dl)];
      if ('dl' in b.dataset) { markDownloaded(o); return; }
      try {
        const { buildSheets, printSheets } = await import('../hub/web/printlayout.js');
        const src = { kind: f.kind, ...(await bytesOf(f)) };
        if ('print' in b.dataset) { await printSheets(src, f, `${o.token} · ${f.name}`); markDownloaded(o); return; }
        const box = s.el.querySelector('#pv-box'); box.innerHTML = '<p class="muted">Drawing the pages…</p>';
        const { faces, total } = await buildSheets(src, f, { pxWidth: 300, max: 12 });
        box.innerHTML = `<h3 style="margin:8px 0">Preview: ${esc(f.name)}</h3><div class="pv-grid"></div>${total > faces.length ? `<p class="muted small">Showing ${faces.length} of ${total} sheet sides.</p>` : ''}`;
        faces.forEach((c) => { const fig = document.createElement('figure'); fig.className = 'pv-sheet'; fig.append(c); box.querySelector('.pv-grid').append(fig); });
      } catch (x) { toast(x.message); }
    });
  }

  app.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.filter) { filter = t.dataset.filter; draw(); }
    if (t.dataset.open) openOrder(data.orders.find((o) => o.id === t.dataset.open));
  });
  app.addEventListener('submit', async (e) => {
    if (e.target.id !== 'verify') return; e.preventDefault();
    const token = $('#tok').value.trim(); if (!token) return; const out = $('#v-out');
    try { const { order } = await api(`/api/xerox/staff/verify?${q()}`, { method: 'POST', body: { token } }); out.innerHTML = `<b style="color:var(--uh-ok)">✓ ${esc(order.token)} handed over.</b> ${esc(order.files.map((f) => f.name).join(', '))}`; $('#tok').value = ''; load(); }
    catch (x) { out.textContent = x.message; }
  });

  /* ---------- prices and settings ---------- */
  function drawPrices() {
    const r = data.shop.rates;
    $('#t-prices').innerHTML = `<form class="card" id="rates" novalidate style="margin-top:14px;max-width:620px"><h3 style="margin-bottom:10px">Prices (₹ per sheet)</h3>
      <div class="form-grid">${RATE_LABELS.map(([k, l]) => `<div class="field"><label for="r-${k}">${l}</label><input id="r-${k}" inputmode="numeric" value="${r[k] ?? 0}"></div>`).join('')}</div>
      <p class="err" id="r-err" role="alert"></p><button class="btn primary" type="submit">Save prices</button></form>`;
    $('#rates').addEventListener('submit', async (e) => {
      e.preventDefault(); const rates = {}; for (const [k] of RATE_LABELS) rates[k] = Number($('#r-' + k).value);
      try { await api(`/api/xerox/staff/shop?${q()}`, { method: 'PUT', body: { rates } }); toast('Prices saved. New orders use them.'); load(); } catch (x) { $('#r-err').textContent = x.message; }
    });
  }
  function drawSettings() {
    $('#t-settings').innerHTML = `<form class="card" id="set" novalidate style="margin-top:14px;max-width:560px"><h3 style="margin-bottom:10px">${esc(data.shop.name)}</h3>
      <div class="field"><label for="s-upi">UPI ID for payments</label><input id="s-upi" value="${esc(data.shop.upi || '')}" placeholder="ttxerox@okaxis" autocapitalize="none"><p class="muted small">Students pay straight to this UPI ID.</p></div>
      <label class="check"><input type="checkbox" id="s-open" ${data.shop.open ? 'checked' : ''}> Shop open for orders</label>
      <p class="err" id="s-err" role="alert"></p><button class="btn primary" type="submit">Save</button></form>`;
    $('#set').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api(`/api/xerox/staff/shop?${q()}`, { method: 'PUT', body: { upi: $('#s-upi').value, open: $('#s-open').checked } }); toast('Saved.'); load(); } catch (x) { $('#s-err').textContent = x.message; }
    });
  }

  /* ---------- chat inbox ---------- */
  let openThread = '', draft = ''; // the reply being typed survives live refreshes
  async function drawChat() {
    const { threads } = await api(`/api/xerox/staff/chats?${q()}`);
    const box = $('#t-chat');
    box.innerHTML = `<div class="cols2" style="margin-top:14px"><div class="card"><h3 style="margin-bottom:8px">Chat inbox</h3><div class="stack" style="gap:6px">${threads.map((t) => `<button class="thread ${t.studentId === openThread ? 'on' : ''}" data-thread="${esc(t.studentId)}"><b>${esc(t.name)}${t.token ? ` · ${esc(t.token)}` : ''}</b>${t.unread ? ` <span class="pill live">${t.unread} new</span>` : ''}<span class="muted small">${esc(t.last.slice(0, 60))}</span></button>`).join('') || '<p class="muted small">No messages yet.</p>'}</div></div>
      <div class="card" id="thread-box">${openThread ? '' : '<p class="muted">Pick a chat to read and reply.</p>'}</div></div>`;
    if (openThread) showThread(threads.find((t) => t.studentId === openThread));
  }
  async function showThread(t) {
    if (!t) return;
    const { messages } = await api(`/api/xerox/staff/chats/${encodeURIComponent(t.studentId)}?${q()}`);
    const box = $('#thread-box'); if (!box) return;
    box.innerHTML = `<h3 style="margin-bottom:8px">${esc(t.name)}${t.token ? ` · ${esc(t.token)}` : ''}</h3>
      <div class="chat" id="chat">${messages.map((m) => `<div class="msg ${m.from === 'shop' ? 'me' : ''}"><small>${m.from === 'shop' ? 'You' : esc(m.studentName)} · ${esc(clock(m.createdAt))}</small>${esc(m.text)}</div>`).join('')}</div>
      <form id="reply" class="row" novalidate style="gap:8px;margin-top:10px"><label for="r-in" class="sr">Your reply</label><input id="r-in" class="grow" maxlength="500" placeholder="Type your reply" value="${esc(draft)}"><button class="btn primary" type="submit">Send reply</button></form>`;
    const c = $('#chat'); c.scrollTop = c.scrollHeight;
    $('#r-in').addEventListener('input', (e) => { draft = e.target.value; });
    $('#reply').addEventListener('submit', async (e) => {
      e.preventDefault(); const inp = $('#r-in'); const text = inp.value.trim(); if (!text) return; inp.value = ''; draft = '';
      try { await api(`/api/xerox/staff/chats/${encodeURIComponent(t.studentId)}?${q()}`, { method: 'POST', body: { text } }); showThread(t); } catch (x) { toast(x.message); inp.value = text; }
    });
    load();
  }
  $('#t-chat').addEventListener('click', (e) => { const b = e.target.closest('[data-thread]'); if (b) { openThread = b.dataset.thread; drawChat(); } });

  let stop = () => {};
  async function reloadAll() {
    stop(); await load(); if (tab !== 'queue') ({ prices: drawPrices, settings: drawSettings, chat: drawChat })[tab]();
    stop = live([`xerox:s:${sid}`], (d) => { load(); if (d.chat && tab === 'chat') drawChat(); else if (d.chat) toast('New chat message.'); else if (d.status === 'QUEUED') toast('New paid print order.'); });
  }
  setInterval(() => { if (tab === 'queue') load(); }, 60000);
  await reloadAll();
}
