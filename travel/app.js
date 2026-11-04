// Travel: share a cab or auto between campus (or your hostel block) and the station, bus stands or airports,
// either way round. Ask to join a ride; the person who offered it accepts. Each ride has a members-only chat.
import { $, $$, esc, money, api, toast, requireStudent, live, bar, sheet, dayLabel, todayYmd, when } from '../hub/web/kit.js';

const user = await requireStudent();
const app = $('#app');
bar({ section: 'travel', title: 'Travel' });
const meta = await api('/api/travel/meta');
const tomorrow = () => new Date(Date.now() + 5.5 * 3600e3 + 86400e3).toISOString().slice(0, 10);
let rides = [], mine = [], fDate = '';
// The route used to search and to offer: dir 'out' = campus -> city, 'in' = city -> campus.
const route = { dir: 'out', campus: 'Main Gate', city: '' };
const ends = (r) => (r.dir === 'out' ? [r.campus, r.city] : [r.city, r.campus]);

const campusOptions = (sel) => `<optgroup label="Campus">${meta.campus.map((p) => `<option ${p === sel ? 'selected' : ''}>${esc(p)}</option>`).join('')}</optgroup>
  <optgroup label="${esc(meta.hostelLabel)}">${meta.hostels.map((p) => `<option ${p === sel ? 'selected' : ''}>${esc(p)}</option>`).join('')}</optgroup>`;
const cityOptions = (sel, any) => `${any ? `<option value="" ${!sel ? 'selected' : ''}>${any}</option>` : ''}${meta.city.map((p) => `<option ${p === sel ? 'selected' : ''}>${esc(p)}</option>`).join('')}`;
// Green dot = where you start, red dot = where you're going, swap button in between (like ride apps).
function routeBox(r, id, { any = '' } = {}) {
  const campus = `<select data-route="${id}:campus" aria-label="${r.dir === 'out' ? 'Start' : 'Destination'} on campus">${campusOptions(r.campus)}</select>`;
  const city = `<select data-route="${id}:city" aria-label="${r.dir === 'out' ? 'Destination' : 'Start'}">${cityOptions(r.city, any)}</select>`;
  return `<div class="route-box" id="${id}">
    <div class="route-rows">
      <div class="route-row"><span class="dot go" aria-hidden="true"></span><span class="sr">From</span>${r.dir === 'out' ? campus : city}</div>
      <div class="route-line" aria-hidden="true"></div>
      <div class="route-row"><span class="dot stop" aria-hidden="true"></span><span class="sr">To</span>${r.dir === 'out' ? city : campus}</div>
    </div>
    <button type="button" class="swap" data-swap="${id}" aria-label="Swap start and destination" title="Swap">⇅</button></div>`;
}
const routeLine = (x) => `<span class="rl"><span class="dot go" aria-hidden="true"></span>${esc(x.from)}</span><span class="rl"><span class="dot stop" aria-hidden="true"></span>${esc(x.to)}</span>`;
const vehicleLabel = (v) => (v === 'auto' ? 'Auto' : 'Cab');
const people = (x) => `${x.members.length} of ${x.maxPeople}${x.minPeople < x.maxPeople ? ` · goes with ${x.minPeople}+` : ''}`;
const goingPill = (x) => (x.going ? '<span class="pill ok">Going</span>' : `<span class="pill warn">Needs ${x.minPeople - x.members.length} more</span>`);

app.innerHTML = `
  <section class="hero travel">
    <h2>Share a cab or auto</h2>
    <p>Going to the station or airport, or coming back to campus? Find students on the same route at about the same time and split the fare.</p>
    <div class="hero-route" id="search-route"></div>
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
      <div class="seg" role="group" aria-label="Day"><button data-day="" aria-pressed="true">Any day</button><button data-day="today" aria-pressed="false">Today</button><button data-day="tomorrow" aria-pressed="false">Tomorrow</button></div>
      <button class="btn" id="offer" style="background:#fff;color:var(--u-800)">+ Offer a ride</button>
    </div>
  </section>
  <div id="requests"></div>
  <div class="section-h"><h2>Your rides</h2></div><div id="mine" class="grid-cards"></div>
  <div class="section-h"><h2>Rides you can join</h2><p class="muted small" id="count"></p></div><div id="list" class="grid-cards"></div>`;
const drawSearch = () => { $('#search-route').innerHTML = routeBox(route, 'sr', { any: route.dir === 'out' ? 'Anywhere' : 'Anywhere' }); };
drawSearch();

function card(x) {
  const action = x.mine ? `<button class="btn primary sm" data-open="${x.id}">Open group chat</button>`
    : x.requested ? `<button class="btn ghost sm" data-cancelreq="${x.id}">Requested · cancel</button>`
      : `<button class="btn primary sm" data-ask="${x.id}" ${x.seatsLeft > 0 ? '' : 'disabled'}>${x.seatsLeft > 0 ? 'Ask to join' : 'Full'}</button>`;
  return `<article class="card stack ride-card" style="gap:8px">
    <div class="row between" style="align-items:flex-start"><div class="route-mini">${routeLine(x)}</div>${x.girlsOnly ? '<span class="pill warn">Girls only</span>' : ''}</div>
    <p class="small"><b>${esc(dayLabel(x.date))}, ${esc(x.time)}</b>${x.flex ? ` ± ${x.flex} min` : ''}${x.train ? ` · Train ${esc(x.train)}` : ''}</p>
    <div class="row small" style="gap:6px;flex-wrap:wrap"><span class="pill">${vehicleLabel(x.vehicle)}</span><span class="pill">${people(x)}</span>${goingPill(x)}
      ${x.fare ? `<span class="pill">${money(x.fare)} total · ${money(Math.ceil(x.fare / (x.members.length + (x.mine ? 0 : 1))))} each${x.mine ? '' : ' if you join'}</span>` : ''}</div>
    <p class="small muted">${x.members.map((m) => esc(m.name.split(' ')[0]) + (m.owner ? ' (offered)' : '')).join(', ')}</p>
    ${x.owner && x.requests?.length ? `<p class="small"><b style="color:var(--uh-accent)">${x.requests.length} request${x.requests.length === 1 ? '' : 's'} to join</b></p>` : ''}
    <div class="row">${action}</div></article>`;
}
async function load() {
  const p = new URLSearchParams({ dir: route.dir }); if (route.city) p.set('city', route.city); if (fDate) p.set('date', fDate);
  const [a, b] = await Promise.all([api('/api/travel/rides?' + p), api('/api/travel/mine')]);
  rides = a.rides; mine = b.rides;
  const reqs = mine.filter((x) => x.owner).flatMap((x) => (x.requests || []).map((q) => ({ ...q, ride: x })));
  $('#requests').innerHTML = reqs.length ? `<div class="section-h"><h2>Requests to join your rides</h2></div><div class="stack">${reqs.map((q) => `<div class="card row req" style="gap:10px;flex-wrap:wrap">
      <div class="grow"><b>${esc(q.name)}</b> <span class="muted small">${esc((q.regNo || '').slice(0, 5))}</span> wants to join<div class="muted small">${esc(q.ride.from)} → ${esc(q.ride.to)} · ${esc(dayLabel(q.ride.date))}, ${esc(q.ride.time)}${q.note ? ` · “${esc(q.note)}”` : ''}</div></div>
      <button class="btn ghost sm" data-decide="${q.ride.id}:${q.uid}:0">Decline</button><button class="btn primary sm" data-decide="${q.ride.id}:${q.uid}:1">Accept</button></div>`).join('')}</div>` : '';
  const inRides = mine.filter((x) => x.mine), asked = mine.filter((x) => !x.mine);
  $('#mine').innerHTML = [...inRides.map(card), ...asked.map((x) => `<article class="card stack" style="gap:6px"><div class="route-mini">${routeLine(x)}</div><p class="small">${esc(dayLabel(x.date))}, ${esc(x.time)}</p>
      <p class="small">${x.myRequest === 'PENDING' ? '<span class="pill live">Waiting for the rider to accept</span>' : x.myRequest === 'DECLINED' ? '<span class="pill bad">Request declined</span>' : ''}</p>
      ${x.myRequest === 'PENDING' ? `<div class="row"><button class="btn ghost sm" data-cancelreq="${x.id}">Cancel request</button></div>` : ''}</article>`)].join('')
    || '<p class="empty">You’re not in any rides yet. Ask to join one below or offer your own.</p>';
  const open = rides.filter((x) => !x.mine && !mine.some((m) => m.id === x.id && m.myRequest === 'PENDING'));
  $('#list').innerHTML = open.map(card).join('') || '<p class="empty">No rides on this route yet. Offer one and others going the same way can ask to join.</p>';
  $('#count').textContent = open.length ? `${open.length} ride${open.length === 1 ? '' : 's'}` : '';
}

// Route controls (search box and offer form share the same markup).
function onRoute(e, r, redraw) {
  const s = e.target.closest('[data-swap]');
  if (s) { r.dir = r.dir === 'out' ? 'in' : 'out'; redraw(); return true; }
  const sel = e.target.closest('[data-route]');
  if (sel && e.type === 'change') { r[sel.dataset.route.split(':')[1]] = sel.value; redraw(); return true; }
  return false;
}
$('#search-route').addEventListener('click', (e) => { if (onRoute(e, route, () => { drawSearch(); load(); })) e.preventDefault(); });
$('#search-route').addEventListener('change', (e) => onRoute(e, route, () => { drawSearch(); load(); }));
app.querySelector('.hero .seg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]'); if (!b) return;
  fDate = b.dataset.day === 'today' ? todayYmd() : b.dataset.day === 'tomorrow' ? tomorrow() : '';
  app.querySelectorAll('.hero .seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load();
});

async function ask(id, btn) {
  if (btn) btn.disabled = true;
  try { await api(`/api/travel/rides/${id}/request`, { method: 'POST', body: {} }); toast('Request sent. You’ll see the group chat once they accept.'); }
  catch (x) { toast(x.message); }
  load();
}
app.addEventListener('click', async (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.ask) ask(t.dataset.ask, t);
  if (t.dataset.open) openRide(t.dataset.open);
  if (t.dataset.cancelreq) { try { await api(`/api/travel/rides/${t.dataset.cancelreq}/request/cancel`, { method: 'POST' }); toast('Request cancelled.'); } catch (x) { toast(x.message); } load(); }
  if (t.dataset.decide) {
    const [rid, uid, yes] = t.dataset.decide.split(':'); t.disabled = true;
    try { await api(`/api/travel/rides/${rid}/requests/${uid}`, { method: 'POST', body: { accept: yes === '1' } }); toast(yes === '1' ? 'Accepted. They’re in the group chat now.' : 'Declined.'); } catch (x) { toast(x.message); }
    load();
  }
});

/* ---------- offer a ride ---------- */
$('#offer').addEventListener('click', () => {
  const r = { ...route, city: route.city || meta.city[0] };
  const nextHour = new Date(Date.now() + 5.5 * 3600e3 + 3600e3).toISOString().slice(11, 14) + '00';
  const s = sheet({
    title: 'Offer a ride',
    body: `<form id="of" novalidate class="stack">
      <div id="of-route"></div>
      <div class="form-grid"><div class="field"><label for="o-date">Date</label><input id="o-date" type="date" min="${todayYmd()}" value="${fDate || todayYmd()}"></div>
        <div class="field"><label for="o-time">Leaving at</label><input id="o-time" type="time" value="${nextHour}"></div>
        <div class="field"><label for="o-flex">Flexible by</label><select id="o-flex"><option value="0">Exact time</option><option value="15" selected>± 15 min</option><option value="30">± 30 min</option><option value="60">± 1 hour</option></select></div></div>
      <div id="matches"></div>
      <div class="field"><span class="label">Vehicle</span><div class="seg" role="group" aria-label="Vehicle" id="o-veh"><button type="button" data-v="cab" aria-pressed="true">Cab (up to 7)</button><button type="button" data-v="auto" aria-pressed="false">Auto (up to 3)</button></div></div>
      <div class="form-grid"><div class="field"><label for="o-max">Most people, including you</label><select id="o-max"></select></div>
        <div class="field"><label for="o-min">I’ll still go with</label><select id="o-min"></select></div></div>
      <div class="field"><label for="o-fare">Estimated total fare (₹, optional)</label><input id="o-fare" inputmode="numeric" placeholder="e.g. 2400"></div>
      <div class="field"><label for="o-train">Train number (optional)</label><input id="o-train" maxlength="40" placeholder="e.g. 12608 Lalbagh Express"></div>
      ${user.gender === 'female' ? '<label class="check"><input type="checkbox" id="o-girls"> Girls only (only girls can see and join)</label>' : ''}
      <p class="err" id="o-err" role="alert"></p></form>`,
    foot: '<button class="btn primary block" id="o-save">Post ride</button>',
  });
  const q = (sel) => s.el.querySelector(sel);
  let veh = 'cab', mt;
  const drawRoute = () => { q('#of-route').innerHTML = routeBox(r, 'or'); findMatches(); };
  const sizes = () => {
    const max = veh === 'auto' ? 3 : 7; const cur = Math.min(Number(q('#o-max').value) || (veh === 'auto' ? 3 : 4), max);
    q('#o-max').innerHTML = Array.from({ length: max - 1 }, (_, i) => i + 2).map((n) => `<option value="${n}" ${n === cur ? 'selected' : ''}>${n}</option>`).join('');
    const min = q('#o-min').value || 'any';
    q('#o-min').innerHTML = `<option value="any" ${min === 'any' ? 'selected' : ''}>Any number (even 1 more)</option>${Array.from({ length: cur - 2 }, (_, i) => i + 3).map((n) => `<option value="${n}" ${String(n) === min ? 'selected' : ''}>At least ${n} people</option>`).join('')}${cur > 2 ? '' : ''}`;
  };
  async function findMatches() {
    clearTimeout(mt); mt = setTimeout(async () => {
      const [from, to] = ends(r); const box = q('#matches'); if (!box) return;
      try {
        const { rides: m } = await api(`/api/travel/matches?${new URLSearchParams({ from, to, date: q('#o-date').value, time: q('#o-time').value })}`);
        box.innerHTML = m.length ? `<div class="card match-box stack" style="gap:8px"><b>Rides you can join instead</b><p class="muted small">Same route, about the same time. Joining one saves a seat and money.</p>
          ${m.map((x) => `<div class="row between" style="gap:8px;flex-wrap:wrap"><div class="small"><b>${esc(x.time)}</b> · ${esc(x.from)} → ${esc(x.to)} · ${vehicleLabel(x.vehicle)} · ${people(x)}${x.fare ? ` · ~${money(Math.ceil(x.fare / (x.members.length + 1)))} each` : ''}</div>
            ${x.requested ? '<span class="pill live">Requested</span>' : `<button type="button" class="btn primary sm" data-askm="${x.id}">Ask to join</button>`}</div>`).join('')}</div>` : '';
        q('#o-save').textContent = m.length ? 'Post a new ride anyway' : 'Post ride';
      } catch { box.innerHTML = ''; }
    }, 250);
  }
  drawRoute(); sizes();
  q('#of-route').addEventListener('click', (e) => { if (onRoute(e, r, drawRoute)) e.preventDefault(); });
  q('#of-route').addEventListener('change', (e) => onRoute(e, r, drawRoute));
  q('#o-date').addEventListener('change', findMatches); q('#o-time').addEventListener('change', findMatches);
  q('#o-max').addEventListener('change', sizes);
  q('#o-veh').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; veh = b.dataset.v; q('#o-veh').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); sizes(); });
  q('#matches').addEventListener('click', async (e) => { const b = e.target.closest('[data-askm]'); if (!b) return; await ask(b.dataset.askm, b); s.close(); });
  q('#o-save').addEventListener('click', async () => {
    const [from, to] = ends(r);
    try {
      await api('/api/travel/rides', { method: 'POST', body: { from, to, date: q('#o-date').value, time: q('#o-time').value, flex: Number(q('#o-flex').value), vehicle: veh, maxPeople: Number(q('#o-max').value), minPeople: q('#o-min').value, fare: q('#o-fare').value.trim(), train: q('#o-train').value, girlsOnly: q('#o-girls')?.checked } });
      s.close(); toast('Ride posted. You’ll get a request when someone wants to join.'); load();
    } catch (x) { q('#o-err').textContent = x.message; }
  });
});

/* ---------- a ride's group ---------- */
let stopRide = () => {};
async function openRide(id) {
  let x, messages;
  try { ({ ride: x, messages } = await api(`/api/travel/rides/${id}`)); } catch (err) { toast(err.message); load(); return; }
  const s = sheet({ title: 'Ride group', body: '<div id="ride-body"></div>', foot: '<form id="chat-f" class="row" novalidate><label for="chat-in" class="sr">Message the group</label><input id="chat-in" class="grow" maxlength="500" placeholder="Message the group"><button class="btn primary" type="submit">Send</button></form><button class="btn danger block" id="leave">Leave ride</button>', onClose: () => stopRide() });
  const draw = () => {
    s.body.querySelector('#ride-body').innerHTML = `
      <div class="route-mini big">${routeLine(x)}</div>
      <p><b>${esc(dayLabel(x.date))}, ${esc(x.time)}</b>${x.flex ? ` ± ${x.flex} min` : ''} · ${vehicleLabel(x.vehicle)}${x.train ? ` · Train ${esc(x.train)}` : ''}</p>
      <div class="row" style="gap:6px">${goingPill(x)}<span class="pill">${people(x)}</span></div>
      ${x.fare ? `<div class="stat"><b>${money(x.farePerPerson)} each</b><span>${money(x.fare)} total split between ${x.members.length}</span></div>` : ''}
      ${x.owner && x.requests?.length ? `<div class="card stack" style="gap:8px"><b>Requests to join</b>${x.requests.map((q) => `<div class="row between" style="gap:8px"><span class="small"><b>${esc(q.name)}</b>${q.note ? ` · “${esc(q.note)}”` : ''}</span><span class="row" style="gap:6px"><button class="btn ghost sm" data-decide="${x.id}:${q.uid}:0">Decline</button><button class="btn primary sm" data-decide="${x.id}:${q.uid}:1">Accept</button></span></div>`).join('')}</div>` : ''}
      <div><h3 style="font-size:14px;margin-bottom:6px">In this ride</h3><ul class="list">${x.members.map((m) => `<li class="row between small"><span>${esc(m.name)}${m.uid === user.id ? ' (you)' : ''}${m.owner ? ' · offered the ride' : ''}</span>${m.phone && m.uid !== user.id ? `<a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : ''}</li>`).join('')}</ul></div>
      <div><h3 style="font-size:14px;margin-bottom:6px">Group chat</h3><p class="muted small" style="margin-bottom:6px">Only people in this ride can see it.</p><div class="chat" id="chat">${messages.map((m) => m.system ? `<p class="msg sys">${esc(m.text)}</p>` : `<div class="msg ${m.uid === user.id ? 'me' : ''}"><small>${esc(m.uid === user.id ? 'You' : m.name)} · ${esc(when(m.createdAt, { day: undefined, month: undefined }))}</small>${esc(m.text)}</div>`).join('') || '<p class="muted small">No messages yet. Say where you’ll meet.</p>'}</div></div>`;
    const c = s.body.querySelector('#chat'); c.scrollTop = c.scrollHeight;
  };
  draw();
  const refresh = async () => { try { ({ ride: x, messages } = await api(`/api/travel/rides/${id}`)); if (!x.mine) { s.close(); toast('You’re no longer in this ride.'); load(); return; } draw(); } catch { s.close(); } };
  stopRide(); stopRide = live([`travel:r:${id}`], refresh);
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-decide]'); if (!b) return;
    const [rid, uid, yes] = b.dataset.decide.split(':');
    try { await api(`/api/travel/rides/${rid}/requests/${uid}`, { method: 'POST', body: { accept: yes === '1' } }); await refresh(); load(); } catch (err) { toast(err.message); }
  });
  s.el.querySelector('#chat-f').addEventListener('submit', async (e) => {
    e.preventDefault(); const inp = s.el.querySelector('#chat-in'); const text = inp.value.trim(); if (!text) return;
    inp.value = '';
    try { await api(`/api/travel/rides/${id}/messages`, { method: 'POST', body: { text } }); await refresh(); } catch (err) { toast(err.message); inp.value = text; }
  });
  s.el.querySelector('#leave').addEventListener('click', async (e) => {
    if (!e.target.dataset.sure) { e.target.dataset.sure = '1'; e.target.textContent = 'Tap again to leave'; return; }
    try { await api(`/api/travel/rides/${id}/leave`, { method: 'POST' }); stopRide(); s.close(); toast('You left the ride.'); load(); } catch (err) { toast(err.message); }
  });
}

live(['travel:list'], () => load());
live([`travel:u:${user.id}`], async () => {
  const before = new Map(mine.map((x) => [x.id, x]));
  await load();
  for (const x of mine) {
    const b = before.get(x.id);
    if (x.mine && b && !b.mine) toast(`You’re in! Your ride to ${x.to} accepted you.`);
    if (x.owner && (x.requests?.length || 0) > (b?.requests?.length || 0)) toast('Someone asked to join your ride.');
    if (b?.myRequest === 'PENDING' && x.myRequest === 'DECLINED') toast('Your request to join was declined.');
  }
});
await load();
