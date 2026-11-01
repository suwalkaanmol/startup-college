// PG: browse PGs near campus, save and enquire, and find a same-gender roommate (contacts shared only when both connect).
import { $, $$, esc, money, api, toast, requireStudent, bar, sheet, pill, todayYmd, when } from '../hub/web/kit.js';

const user = await requireStudent();
const app = $('#app');
bar({ section: 'pg', title: 'PG & roommates' });
const meta = await api('/api/pg/meta');
let tab = 'pgs', listings = [], maxRent = '', forAll = false;

app.innerHTML = `
  <section class="hero pg"><h2>Find a PG and a roommate</h2>
    <p>Browse PGs near campus, ask about the ones you like, and match with ${user.gender === 'female' ? 'girls' : 'boys'} moving in around the same time.</p></section>
  <div class="tabs" role="tablist" style="margin-top:16px">
    <button role="tab" aria-selected="true" data-tab="pgs">PGs</button><button role="tab" aria-selected="false" data-tab="mates">Roommates</button><button role="tab" aria-selected="false" data-tab="saved">Saved & enquiries</button>
  </div>
  <section id="t-pgs">
    <div class="row" style="margin-bottom:12px">
      <label for="rent" class="sr">Maximum rent</label>
      <select id="rent" style="width:auto"><option value="">Any rent</option><option value="6000">Up to ₹6,000</option><option value="8000">Up to ₹8,000</option><option value="10000">Up to ₹10,000</option><option value="15000">Up to ₹15,000</option></select>
      <label class="check"><input type="checkbox" id="all"> Show PGs for everyone</label>
    </div>
    <div id="pgs" class="grid-cards"></div>
  </section>
  <section id="t-mates" hidden></section>
  <section id="t-saved" hidden></section>`;

const genderLabel = (g) => (g === 'female' ? 'Girls' : g === 'male' ? 'Boys' : 'Anyone');
function pgCard(l) {
  return `<article class="card stack" style="gap:8px">
    <div class="row between"><b style="font-size:16px">${esc(l.name)}</b><button class="icon-btn" data-save="${l.id}" aria-pressed="${l.saved}" aria-label="${l.saved ? 'Remove from saved' : 'Save'} ${esc(l.name)}" title="${l.saved ? 'Saved' : 'Save'}">${l.saved ? '★' : '☆'}</button></div>
    <p class="muted small">${esc(l.area)}${l.distanceKm ? ` · ${l.distanceKm} km from VIT` : ''}</p>
    <p><b style="font-size:20px" class="num">${money(l.rent)}</b><span class="muted small"> / month · ${l.sharing === 1 ? 'single room' : `${l.sharing} sharing`}</span></p>
    <div class="chips"><span class="pill">${genderLabel(l.gender)}</span>${l.food ? '<span class="pill">Food included</span>' : ''}${l.sample ? '<span class="pill warn">Sample listing</span>' : ''}</div>
    <p class="small muted">${l.amenities.map(esc).join(' · ')}</p>
    <button class="btn primary sm" data-ask="${l.id}" ${l.sample ? 'disabled title="Sample listings can’t be booked"' : ''}>Ask about this PG</button>
  </article>`;
}
async function loadPgs() {
  const p = new URLSearchParams(); if (maxRent) p.set('maxRent', maxRent); if (forAll) p.set('for', 'all');
  ({ listings } = await api('/api/pg/listings?' + p));
  const sample = listings.some((l) => l.sample);
  $('#pgs').innerHTML = (sample ? '<p class="notice warn" style="grid-column:1/-1">Listings marked “Sample” are examples. The UniHub admin replaces them with real PGs.</p>' : '')
    + (listings.map(pgCard).join('') || '<p class="empty" style="grid-column:1/-1">No PGs match. Try a higher rent.</p>');
}
$('#rent').addEventListener('change', (e) => { maxRent = e.target.value; loadPgs(); });
$('#all').addEventListener('change', (e) => { forAll = e.target.checked; loadPgs(); });
app.addEventListener('click', async (e) => {
  const sv = e.target.closest('[data-save]');
  if (sv) { try { const { saved } = await api(`/api/pg/listings/${sv.dataset.save}/save`, { method: 'POST' }); toast(saved ? 'Saved.' : 'Removed from saved.'); tab === 'saved' ? loadSaved() : loadPgs(); } catch (x) { toast(x.message); } }
  const ask = e.target.closest('[data-ask]');
  if (ask) enquire(listings.find((l) => l.id === ask.dataset.ask));
});
function enquire(l) {
  const s = sheet({
    title: 'Ask about this PG',
    body: `<p><b>${esc(l.name)}</b><br><span class="muted small">${esc(l.area)} · ${money(l.rent)} / month</span></p>
      <p class="notice small">The UniHub team passes your name, number and message to the PG and gets back to you.</p>
      <div class="field"><label for="e-move">Planned move-in date</label><input id="e-move" type="date" min="${todayYmd()}"></div>
      <div class="field"><label for="e-msg">Your question</label><textarea id="e-msg" maxlength="500" placeholder="Is a 2-sharing room free from July? Is there a curfew?"></textarea></div>
      <p class="err" id="e-err" role="alert"></p>`,
    foot: '<button class="btn primary block" id="e-send">Send enquiry</button>',
  });
  s.el.querySelector('#e-send').addEventListener('click', async () => {
    try { await api(`/api/pg/listings/${l.id}/enquire`, { method: 'POST', body: { moveIn: $('#e-move').value, message: $('#e-msg').value } }); s.close(); toast('Enquiry sent. You’ll find it under Saved & enquiries.'); }
    catch (x) { $('#e-err').textContent = x.message; }
  });
}

/* ---------- roommates ---------- */
async function loadMates() {
  const box = $('#t-mates');
  const [{ profile }, { matches }] = await Promise.all([api('/api/pg/profile'), api('/api/pg/matches')]);
  box.innerHTML = `<div class="cols"><div><div class="section-h" style="margin-top:0"><h2>Matches</h2><p class="muted small">${user.gender === 'female' ? 'Girls' : 'Boys'} moving in within a month of you</p></div><div id="matches" class="stack"></div></div>
    <aside class="sticky-side"><form class="card" id="prof" novalidate><h3 style="margin-bottom:10px">${profile ? 'Your roommate profile' : 'Set up your roommate profile'}</h3>
      <div class="field"><label for="p-move">Move-in date</label><input id="p-move" type="date" value="${esc(profile?.moveIn || '')}"></div>
      <div class="field"><label for="p-budget">Budget per month (₹)</label><input id="p-budget" inputmode="numeric" value="${esc(profile?.budgetMax || '')}" placeholder="9000"></div>
      <div class="field"><label for="p-area">Preferred area (optional)</label><input id="p-area" maxlength="60" value="${esc(profile?.area || '')}" placeholder="Near Main Gate, Katpadi…"></div>
      <div class="field"><span class="label">About you (pick up to 6)</span><div class="chips" id="p-tags">${meta.tags.map((t) => `<button type="button" class="chip" aria-pressed="${profile?.tags?.includes(t) ? 'true' : 'false'}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
      <div class="field"><label for="p-about">A line about you (optional)</label><textarea id="p-about" maxlength="300">${esc(profile?.about || '')}</textarea></div>
      <label class="check"><input type="checkbox" id="p-vis" ${profile?.visible === false ? '' : 'checked'}> Show me to others looking for roommates</label>
      <p class="err" id="p-err" role="alert"></p><button class="btn primary block" type="submit">${profile ? 'Save' : 'Start matching'}</button></form></aside></div>`;
  $('#p-tags').addEventListener('click', (e) => { const b = e.target.closest('[data-tag]'); if (!b) return; const on = b.getAttribute('aria-pressed') !== 'true'; if (on && $$('#p-tags [aria-pressed="true"]').length >= 6) { toast('Pick up to 6.'); return; } b.setAttribute('aria-pressed', String(on)); });
  $('#prof').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/pg/profile', { method: 'PUT', body: { moveIn: $('#p-move').value, budgetMax: Number($('#p-budget').value), area: $('#p-area').value, about: $('#p-about').value, visible: $('#p-vis').checked, tags: $$('#p-tags [aria-pressed="true"]').map((b) => b.dataset.tag) } }); toast('Profile saved.'); loadMates(); }
    catch (x) { $('#p-err').textContent = x.message; }
  });
  $('#matches').innerHTML = !profile ? '<p class="empty">Fill in your roommate profile to see matches.</p>' : matches.map((m) => `<article class="card">
      <div class="row between"><b>${esc(m.name)}</b>${m.mutual ? '<span class="pill ok">Connected</span>' : m.theyConnected ? '<span class="pill live">Wants to connect</span>' : ''}</div>
      <p class="muted small">Moving in ${esc(new Date(m.moveIn + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))} · budget up to ${money(m.budgetMax)}${m.area ? ` · ${esc(m.area)}` : ''}</p>
      <div class="chips" style="margin:8px 0">${m.tags.map((t) => `<span class="pill ${m.shared.includes(t) ? 'solid' : ''}">${esc(t)}</span>`).join('')}</div>
      ${m.about ? `<p class="small">${esc(m.about)}</p>` : ''}
      ${m.mutual ? `<p class="notice small" style="margin-top:8px">Phone: <a href="tel:${esc(m.phone)}">${esc(m.phone)}</a> · Email: <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></p>`
        : `<div class="row" style="margin-top:10px"><button class="btn ${m.iConnected ? 'ghost' : 'primary'} sm" data-connect="${m.uid}">${m.iConnected ? 'Request sent · undo' : m.theyConnected ? 'Connect back' : 'Connect'}</button><span class="muted small">Phone numbers are shared only when you both connect.</span></div>`}
    </article>`).join('') || '<p class="empty">No matches yet. Students moving in within a month of your date will appear here.</p>';
}
app.addEventListener('click', async (e) => {
  const c = e.target.closest('[data-connect]'); if (!c) return;
  try { const { connected } = await api(`/api/pg/connect/${c.dataset.connect}`, { method: 'POST' }); toast(connected ? 'Request sent.' : 'Request withdrawn.'); loadMates(); } catch (x) { toast(x.message); }
});

/* ---------- saved & enquiries ---------- */
async function loadSaved() {
  const [{ listings: all }, { enquiries }] = await Promise.all([api('/api/pg/listings?for=all'), api('/api/pg/enquiries/mine')]);
  listings = all;
  const saved = all.filter((l) => l.saved);
  $('#t-saved').innerHTML = `<div class="section-h" style="margin-top:0"><h2>Saved PGs</h2></div><div class="grid-cards">${saved.map(pgCard).join('') || '<p class="empty" style="grid-column:1/-1">Tap the star on a PG to save it here.</p>'}</div>
    <div class="section-h"><h2>Your enquiries</h2></div><ul class="list">${enquiries.map((q) => `<li class="item"><div class="main"><b>${esc(q.listingName)}</b><div class="muted small">${esc(when(q.createdAt))}${q.moveIn ? ` · moving in ${esc(q.moveIn)}` : ''}${q.message ? ` · “${esc(q.message)}”` : ''}</div></div>${pill(q.status)}</li>`).join('') || '<li class="empty">No enquiries yet.</li>'}</ul>`;
}

$$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
  tab = b.dataset.tab; $$('.tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  for (const t of ['pgs', 'mates', 'saved']) $('#t-' + t).hidden = t !== tab;
  ({ pgs: loadPgs, mates: loadMates, saved: loadSaved })[tab]();
}));
await loadPgs();
