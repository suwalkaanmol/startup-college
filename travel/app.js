// Travel: find students going your way, join a ride, chat with the group and split the fare.
import { $, esc, money, api, toast, requireStudent, live, bar, sheet, dayLabel, todayYmd, when } from '../hub/web/kit.js';

const user = await requireStudent();
const app = $('#app');
bar({ section: 'travel', title: 'Travel' });
const meta = await api('/api/travel/meta');
let rides = [], fDest = '', fDate = '';
const tomorrow = () => new Date(Date.now() + 5.5 * 3600e3 + 86400e3).toISOString().slice(0, 10);

app.innerHTML = `
  <section class="hero travel">
    <h2>Share a cab or auto</h2>
    <p>Find students heading to the station, bus stands or airports around the same time, then split the fare.</p>
    <div class="row" style="margin-top:14px">
      <label for="f-dest" class="sr">Destination</label>
      <select id="f-dest" style="width:auto;max-width:100%"><option value="">Anywhere</option>${meta.dests.map((d) => `<option>${esc(d)}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="Day">
        <button data-day="" aria-pressed="true">Any day</button><button data-day="today" aria-pressed="false">Today</button><button data-day="tomorrow" aria-pressed="false">Tomorrow</button>
      </div>
      <button class="btn" id="offer" style="background:#fff;color:var(--u-700)">+ Offer a ride</button>
    </div>
  </section>
  <div class="section-h"><h2>Your rides</h2></div><div id="mine" class="grid-cards"></div>
  <div class="section-h"><h2>Rides you can join</h2><p class="muted small" id="count"></p></div><div id="list" class="grid-cards"></div>`;

const vehicleLabel = (v) => (v === 'auto' ? 'Auto' : 'Cab');
function card(r) {
  return `<article class="card stack" style="gap:8px">
    <div class="row between"><b style="font-size:16px">${esc(r.dest)}</b>${r.girlsOnly ? '<span class="pill warn">Girls only</span>' : ''}</div>
    <p class="muted small">${esc(dayLabel(r.date))}, ${esc(r.time)}${r.flex ? ` ± ${r.flex} min` : ''} · from ${esc(r.pickup)}</p>
    <div class="row small"><span class="pill">${vehicleLabel(r.vehicle)}</span><span class="pill ${r.seatsLeft ? 'live' : 'bad'}">${r.seatsLeft ? `${r.seatsLeft} seat${r.seatsLeft === 1 ? '' : 's'} left` : 'Full'}</span>
      ${r.fare ? `<span class="pill">${money(r.fare)} total · ${money(Math.ceil(r.fare / (r.members.length + (r.mine ? 0 : 1))))} each${r.mine ? '' : ' if you join'}</span>` : ''}</div>
    <p class="small">${r.members.map((m) => esc(m.name.split(' ')[0])).join(', ')}${r.train ? ` · Train ${esc(r.train)}` : ''}</p>
    <div class="row">${r.mine ? `<button class="btn primary sm" data-open="${r.id}">Open group chat</button>` : `<button class="btn primary sm" data-join="${r.id}" ${r.seatsLeft ? '' : 'disabled'}>Join ride</button>`}</div>
  </article>`;
}
async function load() {
  const p = new URLSearchParams(); if (fDest) p.set('dest', fDest); if (fDate) p.set('date', fDate);
  const all = (await api('/api/travel/rides')).rides;
  rides = (await api('/api/travel/rides?' + p)).rides;
  const mine = all.filter((r) => r.mine);
  $('#mine').innerHTML = mine.map(card).join('') || '<p class="empty">You’re not in any rides yet. Join one below or offer your own.</p>';
  const open = rides.filter((r) => !r.mine);
  $('#list').innerHTML = open.map(card).join('') || `<p class="empty">No rides match yet. Offer one and others going the same way can join you.</p>`;
  $('#count').textContent = open.length ? `${open.length} ride${open.length === 1 ? '' : 's'}` : '';
}
$('#f-dest').addEventListener('change', (e) => { fDest = e.target.value; load(); });
app.querySelector('.hero .seg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]'); if (!b) return;
  fDate = b.dataset.day === 'today' ? todayYmd() : b.dataset.day === 'tomorrow' ? tomorrow() : '';
  app.querySelectorAll('.hero .seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load();
});
app.addEventListener('click', async (e) => {
  const j = e.target.closest('[data-join]'), o = e.target.closest('[data-open]');
  if (j) {
    j.disabled = true;
    try { const { ride } = await api(`/api/travel/rides/${j.dataset.join}/join`, { method: 'POST' }); toast(`You’re in. ${ride.members.length} going to ${ride.dest}.`); await load(); openRide(ride.id); }
    catch (x) { toast(x.message); j.disabled = false; load(); }
  }
  if (o) openRide(o.dataset.open);
});

/* ---------- offer a ride ---------- */
$('#offer').addEventListener('click', () => {
  const s = sheet({
    title: 'Offer a ride',
    body: `<form id="of" novalidate>
      <div class="field"><label for="o-dest">Going to</label><select id="o-dest">${meta.dests.map((d) => `<option>${esc(d)}</option>`).join('')}</select></div>
      <div class="field"><label for="o-pick">Pickup point</label><select id="o-pick">${meta.pickups.map((d) => `<option>${esc(d)}</option>`).join('')}</select></div>
      <div class="form-grid"><div class="field"><label for="o-date">Date</label><input id="o-date" type="date" min="${todayYmd()}" value="${todayYmd()}"></div>
        <div class="field"><label for="o-time">Leaving at</label><input id="o-time" type="time" value="${new Date(Date.now() + 5.5 * 3600e3 + 3600e3).toISOString().slice(11, 14)}00"></div>
        <div class="field"><label for="o-flex">Flexible by</label><select id="o-flex"><option value="0">Exact time</option><option value="15" selected>± 15 min</option><option value="30">± 30 min</option><option value="60">± 1 hour</option></select></div></div>
      <div class="field"><span class="label">Vehicle</span><div class="seg" role="group" aria-label="Vehicle" id="o-veh"><button type="button" data-v="cab" aria-pressed="true">Cab (up to 7)</button><button type="button" data-v="auto" aria-pressed="false">Auto (up to 3)</button></div></div>
      <div class="form-grid"><div class="field"><label for="o-seats">People in total, including you</label><select id="o-seats"></select></div>
        <div class="field"><label for="o-fare">Estimated total fare (₹, optional)</label><input id="o-fare" inputmode="numeric" placeholder="e.g. 2400"></div></div>
      <div class="field"><label for="o-train">Train number (optional)</label><input id="o-train" maxlength="40" placeholder="e.g. 12608 Lalbagh Express"></div>
      ${user.gender === 'female' ? '<label class="check"><input type="checkbox" id="o-girls"> Girls only (only girls can see and join)</label>' : ''}
      <p class="err" id="o-err" role="alert"></p></form>`,
    foot: '<button class="btn primary block" id="o-save">Post ride</button>',
  });
  let veh = 'cab';
  const seats = () => { $('#o-seats').innerHTML = Array.from({ length: veh === 'auto' ? 2 : 6 }, (_, i) => `<option value="${i + 2}" ${i + 2 === (veh === 'auto' ? 3 : 4) ? 'selected' : ''}>${i + 2}</option>`).join(''); };
  seats();
  $('#o-veh').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; veh = b.dataset.v; $('#o-veh').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); seats(); });
  $('#o-save').addEventListener('click', async () => {
    try {
      await api('/api/travel/rides', { method: 'POST', body: { dest: $('#o-dest').value, pickup: $('#o-pick').value, date: $('#o-date').value, time: $('#o-time').value, flex: Number($('#o-flex').value), vehicle: veh, seats: Number($('#o-seats').value), fare: $('#o-fare').value.trim(), train: $('#o-train').value, girlsOnly: $('#o-girls')?.checked } });
      s.close(); toast('Ride posted. You’ll see the chat when someone joins.'); load();
    } catch (x) { $('#o-err').textContent = x.message; }
  });
});

/* ---------- a ride's group ---------- */
let stopRide = () => {};
async function openRide(id) {
  let r, messages;
  try { ({ ride: r, messages } = await api(`/api/travel/rides/${id}`)); } catch (x) { toast(x.message); load(); return; }
  const s = sheet({ title: `${r.dest}`, body: '<div id="ride-body"></div>', foot: '<form id="chat-f" class="row" novalidate><label for="chat-in" class="sr">Message the group</label><input id="chat-in" class="grow" maxlength="500" placeholder="Message the group"><button class="btn primary" type="submit">Send</button></form><button class="btn danger block" id="leave">Leave ride</button>', onClose: () => stopRide() });
  const draw = () => {
    s.body.querySelector('#ride-body').innerHTML = `
      <p><b>${esc(dayLabel(r.date))}, ${esc(r.time)}</b>${r.flex ? ` ± ${r.flex} min` : ''} · ${vehicleLabel(r.vehicle)} from ${esc(r.pickup)}${r.train ? ` · Train ${esc(r.train)}` : ''}</p>
      ${r.fare ? `<div class="stat"><b>${money(r.farePerPerson)} each</b><span>${money(r.fare)} total split between ${r.members.length}</span></div>` : ''}
      <div><h3 style="font-size:14px;margin-bottom:6px">Going (${r.members.length} of ${r.seats})</h3><ul class="list">${r.members.map((m) => `<li class="row between small"><span>${esc(m.name)}${m.uid === user.id ? ' (you)' : ''}</span>${m.phone && m.uid !== user.id ? `<a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : ''}</li>`).join('')}</ul></div>
      <div><h3 style="font-size:14px;margin-bottom:6px">Group chat</h3><div class="chat" id="chat">${messages.map((m) => m.system ? `<p class="msg sys">${esc(m.text)}</p>` : `<div class="msg ${m.uid === user.id ? 'me' : ''}"><small>${esc(m.uid === user.id ? 'You' : m.name)} · ${esc(when(m.createdAt, { day: undefined, month: undefined }))}</small>${esc(m.text)}</div>`).join('') || '<p class="muted small">No messages yet. Say where you’ll meet.</p>'}</div></div>`;
    const c = s.body.querySelector('#chat'); c.scrollTop = c.scrollHeight;
  };
  draw();
  stopRide(); stopRide = live([`travel:r:${id}`], async () => { try { ({ ride: r, messages } = await api(`/api/travel/rides/${id}`)); draw(); } catch { s.close(); } });
  s.el.querySelector('#chat-f').addEventListener('submit', async (e) => {
    e.preventDefault(); const inp = s.el.querySelector('#chat-in'); const text = inp.value.trim(); if (!text) return;
    inp.value = '';
    try { await api(`/api/travel/rides/${id}/messages`, { method: 'POST', body: { text } }); ({ ride: r, messages } = await api(`/api/travel/rides/${id}`)); draw(); } catch (x) { toast(x.message); inp.value = text; }
  });
  s.el.querySelector('#leave').addEventListener('click', async (e) => {
    if (!e.target.dataset.sure) { e.target.dataset.sure = '1'; e.target.textContent = 'Tap again to leave'; return; }
    try { await api(`/api/travel/rides/${id}/leave`, { method: 'POST' }); s.close(); toast('You left the ride.'); load(); } catch (x) { toast(x.message); }
  });
}

live(['travel:list'], () => load());
await load();
