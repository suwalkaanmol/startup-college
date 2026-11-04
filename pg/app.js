// PG Mate: got placed? Find VIT students joining work in the same city and area around the same time,
// meet them on campus while you're both still here, then move in together. Contacts show only when both connect.
import { $, $$, esc, money, api, toast, requireStudent, bar, sheet, pill, todayYmd, when } from '../hub/web/kit.js';

const user = await requireStudent();
const app = $('#app');
bar({ section: 'pg', title: 'PG Mate' });
const meta = await api('/api/pg/meta');
const CITIES = Object.keys(meta.areas);
let tab = 'mates', me = null, matches = [], listings = [], maxRent = '';
const fmt = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const them = user.gender === 'female' ? 'girls' : 'boys';

app.innerHTML = `
  <section class="hero pg"><h2>Got placed? Find your PG mates</h2>
    <p>Your friends are heading to different cities. Find VIT ${them} joining work in the same city around the same time, meet them on campus while you’re all still here, and move in together. No more hunting in WhatsApp groups.</p></section>
  <div class="tabs" role="tablist" style="margin-top:16px">
    <button role="tab" aria-selected="true" data-tab="mates">Find PG mates</button><button role="tab" aria-selected="false" data-tab="conn">Connections <span id="conn-n"></span></button><button role="tab" aria-selected="false" data-tab="pgs">PGs near your office</button><button role="tab" aria-selected="false" data-tab="me">My placement</button>
  </div>
  <section id="t-mates"></section><section id="t-conn" hidden></section><section id="t-pgs" hidden></section><section id="t-me" hidden></section>`;

function setTab(t) {
  tab = t; $$('.tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.tab === t)));
  for (const k of ['mates', 'conn', 'pgs', 'me']) $('#t-' + k).hidden = k !== t;
  ({ mates: loadMates, conn: loadMates, pgs: loadPgs, me: drawProfile })[t]();
}
$$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

/* ---------- my placement ---------- */
function drawProfile(old = false) {
  const p = me || {};
  const city = p.city || ''; const known = meta.areas[city];
  $('#t-me').innerHTML = `<form class="card stack" id="prof" novalidate style="margin-top:16px;max-width:720px">
    <h3>${me ? 'Your placement details' : 'Tell us where you’re headed'}</h3>
    ${old ? '<p class="notice warn small">PG Mate now matches by job city and joining date. Add your placement details to see matches.</p>' : ''}
    <p class="muted small">Only ${them} from VIT see this. Your phone and email stay hidden until you both choose to connect.</p>
    <div class="form-grid">
      <div class="field"><label for="p-company">Company</label><input id="p-company" maxlength="60" value="${esc(p.company || '')}" placeholder="Wipro, TCS, Amazon…"></div>
      <div class="field"><label for="p-city">Job city</label><select id="p-city"><option value="">Choose a city</option>${CITIES.map((c) => `<option ${c === city ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__other" ${city && !known ? 'selected' : ''}>Another city</option></select></div>
      <div class="field" id="p-cityx-f" ${city && !known ? '' : 'hidden'}><label for="p-cityx">City name</label><input id="p-cityx" maxlength="40" value="${esc(city && !known ? city : '')}"></div>
      <div class="field" id="p-area-f"><label for="p-area">Office area</label>${areaInput(city, p.area)}</div>
      <div class="field"><label for="p-join">Joining date</label><input id="p-join" type="date" min="${todayYmd()}" value="${esc(p.joinDate || '')}"></div>
      <div class="field"><label for="p-till">On campus till (optional)</label><input id="p-till" type="date" value="${esc(p.campusTill || '')}"><p class="muted small">So others know they can meet you here first.</p></div>
      <div class="field"><label for="p-meet">Where to find you on campus (optional)</label><input id="p-meet" maxlength="80" value="${esc(p.meetAt || '')}" placeholder="SJT canteen, evenings"></div>
      <div class="field"><label for="p-budget">Rent budget per month (₹)</label><input id="p-budget" inputmode="numeric" value="${esc(p.budgetMax || '')}" placeholder="10000"></div>
      <div class="field"><label for="p-rm">Roommates you want</label><select id="p-rm">${[1, 2, 3].map((n) => `<option value="${n}" ${Number(p.roommates || 1) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    </div>
    <div class="field"><span class="label">About your habits (pick up to 6)</span><div class="chips" id="p-tags">${meta.tags.map((t) => `<button type="button" class="chip" aria-pressed="${p.tags?.includes(t) ? 'true' : 'false'}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
    <div class="field"><label for="p-about">A line about you (optional)</label><textarea id="p-about" maxlength="300" placeholder="Final-year CSE, joining Wipro Bengaluru in December. Like quiet weekdays and cricket on weekends.">${esc(p.about || '')}</textarea></div>
    <label class="check"><input type="checkbox" id="p-vis" ${p.visible === false ? '' : 'checked'}> Show me to others looking for PG mates</label>
    <p class="err" id="p-err" role="alert"></p><button class="btn primary" type="submit">${me ? 'Save' : 'Find my PG mates'}</button></form>`;
  $('#p-city').addEventListener('change', (e) => { const other = e.target.value === '__other'; $('#p-cityx-f').hidden = !other; $('#p-area-f').innerHTML = `<label for="p-area">Office area</label>${areaInput(other ? '' : e.target.value, '')}`; });
  $('#p-tags').addEventListener('click', (e) => { const b = e.target.closest('[data-tag]'); if (!b) return; const on = b.getAttribute('aria-pressed') !== 'true'; if (on && $$('#p-tags [aria-pressed="true"]').length >= 6) { toast('Pick up to 6.'); return; } b.setAttribute('aria-pressed', String(on)); });
  $('#prof').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cityV = $('#p-city').value === '__other' ? $('#p-cityx').value.trim() : $('#p-city').value;
    try {
      ({ profile: me } = await api('/api/pg/profile', { method: 'PUT', body: { company: $('#p-company').value, city: cityV, area: $('#p-area').value, joinDate: $('#p-join').value, campusTill: $('#p-till').value, meetAt: $('#p-meet').value, budgetMax: Number($('#p-budget').value), roommates: Number($('#p-rm').value), about: $('#p-about').value, visible: $('#p-vis').checked, tags: $$('#p-tags [aria-pressed="true"]').map((b) => b.dataset.tag) } }));
      toast('Saved.'); setTab('mates');
    } catch (x) { $('#p-err').textContent = x.message; }
  });
}
function areaInput(city, cur) {
  const list = meta.areas[city];
  if (!list) return `<input id="p-area" maxlength="60" value="${esc(cur || '')}" placeholder="Area or tech park">`;
  return `<select id="p-area"><option value="">Not sure yet</option>${list.map((a) => `<option ${a === cur ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>`;
}

/* ---------- matches and connections ---------- */
function mateCard(m) {
  const later = m.joinDate === me.joinDate ? 'same day as you' : `${m.gap} day${m.gap === 1 ? '' : 's'} ${m.joinDate > me.joinDate ? 'after' : 'before'} you`;
  const onCampus = m.campusTill && m.campusTill >= todayYmd();
  return `<article class="card stack mate" style="gap:8px">
    <div class="row between" style="align-items:flex-start"><div><b style="font-size:16px">${esc(m.name)}</b><p class="muted small">${esc(m.batch || 'VIT')}</p></div><span class="score" title="How well you match">${m.score}%</span></div>
    <p class="small"><b>${esc(m.company)}</b> · ${esc(m.area ? `${m.area}, ` : '')}${esc(m.city)}</p>
    <div class="chips">${m.sameArea ? '<span class="pill solid">Same office area</span>' : ''}${m.sameCompany ? '<span class="pill solid">Same company</span>' : ''}<span class="pill">Joins ${esc(fmt(m.joinDate))} · ${later}</span><span class="pill">Up to ${money(m.budgetMax)}</span>${m.roommates > 1 ? `<span class="pill">Wants ${m.roommates} roommates</span>` : ''}</div>
    ${onCampus ? `<p class="small meet">🤝 On campus till ${esc(fmt(m.campusTill))}${m.meetAt ? ` · usually at ${esc(m.meetAt)}` : ''}. Meet before you move in.</p>` : ''}
    ${m.tags.length ? `<div class="chips">${m.tags.map((t) => `<span class="pill ${m.shared.includes(t) ? 'ok' : ''}">${esc(t)}</span>`).join('')}</div>` : ''}
    ${m.about ? `<p class="small">${esc(m.about)}</p>` : ''}
    ${m.mutual ? `<p class="notice small">Connected. Phone: <a href="tel:${esc(m.phone)}">${esc(m.phone)}</a> · Email: <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></p>`
      : `<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn ${m.iConnected ? 'ghost' : 'primary'} sm" data-connect="${m.uid}">${m.iConnected ? 'Request sent · undo' : m.theyConnected ? 'Connect back' : 'Connect'}</button><span class="muted small">Phone numbers show only when you both connect.</span></div>`}
  </article>`;
}
async function loadMates() {
  const r = await api('/api/pg/matches');
  if (r.needsProfile) {
    $('#t-mates').innerHTML = '<div class="card stack" style="margin-top:16px;max-width:620px"><h3>Start with your placement</h3><p class="muted">Add your company, job city and joining date. We’ll show VIT students heading the same way.</p><button class="btn primary" data-goto="me" style="justify-self:start">Add placement details</button></div>';
    $('#t-conn').innerHTML = $('#t-mates').innerHTML; $('#conn-n').textContent = ''; return;
  }
  ({ matches, me } = r);
  const asked = matches.filter((m) => m.theyConnected && !m.iConnected).length;
  $('#conn-n').textContent = asked ? `(${asked})` : '';
  const list = matches.filter((m) => !m.mutual);
  $('#t-mates').innerHTML = `<div class="section-h" style="margin-top:16px"><h2>${esc(me.city)}${me.area ? ` · ${esc(me.area)}` : ''}</h2><p class="muted small">${them[0].toUpperCase() + them.slice(1)} joining within 45 days of ${esc(fmt(me.joinDate))}, best match first</p></div>
    <div class="grid-cards">${list.map(mateCard).join('') || `<p class="empty" style="grid-column:1/-1">No one else heading to ${esc(me.city)} around then yet. As more students add their placements, they’ll show up here. Share PG Mate with your batch!</p>`}</div>`;
  const mutual = matches.filter((m) => m.mutual), incoming = matches.filter((m) => m.theyConnected && !m.iConnected), sent = matches.filter((m) => m.iConnected && !m.theyConnected);
  $('#t-conn').innerHTML = `${incoming.length ? `<div class="section-h" style="margin-top:16px"><h2>Want to connect with you</h2></div><div class="grid-cards">${incoming.map(mateCard).join('')}</div>` : ''}
    <div class="section-h" style="margin-top:16px"><h2>Your PG mates</h2><p class="muted small">You both connected, so you can call or message each other.</p></div>
    <div class="grid-cards">${mutual.map(mateCard).join('') || '<p class="empty" style="grid-column:1/-1">No connections yet. Connect with someone from Find PG mates.</p>'}</div>
    ${sent.length ? `<div class="section-h"><h2>Requests you sent</h2></div><div class="grid-cards">${sent.map(mateCard).join('')}</div>` : ''}`;
}
app.addEventListener('click', async (e) => {
  const g = e.target.closest('[data-goto]'); if (g) { setTab(g.dataset.goto); return; }
  const c = e.target.closest('[data-connect]'); if (!c) return;
  try { const { connected } = await api(`/api/pg/connect/${c.dataset.connect}`, { method: 'POST' }); const m = matches.find((x) => x.uid === c.dataset.connect); toast(connected ? (m?.theyConnected ? `Connected with ${m.name}! You can see their number now.` : 'Request sent.') : 'Request withdrawn.'); loadMates(); }
  catch (x) { toast(x.message); }
});

/* ---------- PGs near the office ---------- */
function pgCard(l) {
  return `<article class="card stack" style="gap:8px">
    <div class="row between"><b style="font-size:16px">${esc(l.name)}</b><button class="icon-btn" data-save="${l.id}" aria-pressed="${l.saved}" aria-label="${l.saved ? 'Remove from saved' : 'Save'} ${esc(l.name)}">${l.saved ? '★' : '☆'}</button></div>
    <p class="muted small">${esc(l.area)}, ${esc(l.city)}${l.distanceKm ? ` · ${l.distanceKm} km from the offices` : ''}</p>
    <p><b style="font-size:20px" class="num">${money(l.rent)}</b><span class="muted small"> / month · ${l.sharing === 1 ? 'single room' : `${l.sharing} sharing`}</span></p>
    <div class="chips"><span class="pill">${l.gender === 'female' ? 'Girls' : l.gender === 'male' ? 'Boys' : 'Anyone'}</span>${l.food ? '<span class="pill">Food included</span>' : ''}${l.sample ? '<span class="pill warn">Sample listing</span>' : ''}</div>
    <p class="small muted">${l.amenities.map(esc).join(' · ')}</p>
    <button class="btn primary sm" data-ask="${l.id}" ${l.sample ? 'disabled title="Sample listings can’t be booked"' : ''}>Ask about this PG</button></article>`;
}
async function loadPgs() {
  const p = new URLSearchParams(); if (maxRent) p.set('maxRent', maxRent);
  const r = await api('/api/pg/listings?' + p); listings = r.listings;
  const { enquiries } = await api('/api/pg/enquiries/mine');
  $('#t-pgs').innerHTML = `<div class="row between" style="margin:16px 0 12px;gap:10px;flex-wrap:wrap"><h2 style="font-size:20px">${r.city ? `PGs in ${esc(r.city)}` : 'PGs'}</h2>
      <div><label for="rent" class="sr">Maximum rent</label><select id="rent" style="width:auto"><option value="">Any rent</option>${[8000, 10000, 15000, 20000].map((n) => `<option value="${n}" ${String(n) === maxRent ? 'selected' : ''}>Up to ${money(n)}</option>`).join('')}</select></div></div>
    ${!r.city ? '<p class="notice small" style="margin-bottom:12px">Add your placement to see PGs in your job city.</p>' : ''}
    ${listings.some((l) => l.sample) ? '<p class="notice warn small" style="margin-bottom:12px">Listings marked “Sample” are examples. The UniHub team adds real PGs near office areas.</p>' : ''}
    <div class="grid-cards">${listings.map(pgCard).join('') || `<p class="empty" style="grid-column:1/-1">No PGs listed in ${esc(r.city || 'your city')} yet. Ask your PG mates. Finding a place together is easier!</p>`}</div>
    <div class="section-h"><h2>Your enquiries</h2></div><ul class="list">${enquiries.map((q) => `<li class="item"><div class="main"><b>${esc(q.listingName)}</b><div class="muted small">${esc(when(q.createdAt))}${q.message ? ` · “${esc(q.message)}”` : ''}</div></div>${pill(q.status)}</li>`).join('') || '<li class="empty">No enquiries yet.</li>'}</ul>`;
  $('#rent').addEventListener('change', (e) => { maxRent = e.target.value; loadPgs(); });
}
$('#t-pgs').addEventListener('click', async (e) => {
  const sv = e.target.closest('[data-save]');
  if (sv) { try { const { saved } = await api(`/api/pg/listings/${sv.dataset.save}/save`, { method: 'POST' }); toast(saved ? 'Saved.' : 'Removed from saved.'); loadPgs(); } catch (x) { toast(x.message); } }
  const ask = e.target.closest('[data-ask]'); if (!ask) return;
  const l = listings.find((x) => x.id === ask.dataset.ask);
  const s = sheet({ title: 'Ask about this PG', body: `<p><b>${esc(l.name)}</b><br><span class="muted small">${esc(l.area)}, ${esc(l.city)} · ${money(l.rent)} / month</span></p>
      <p class="notice small">The UniHub team passes your name, number and message to the PG and gets back to you.</p>
      <div class="field"><label for="e-move">Planned move-in date</label><input id="e-move" type="date" min="${todayYmd()}" value="${esc(me?.joinDate || '')}"></div>
      <div class="field"><label for="e-msg">Your question</label><textarea id="e-msg" maxlength="500" placeholder="We’re 2 friends joining in December. Is a double-sharing room free?"></textarea></div><p class="err" id="e-err" role="alert"></p>`,
    foot: '<button class="btn primary block" id="e-send">Send enquiry</button>' });
  s.el.querySelector('#e-send').addEventListener('click', async () => {
    try { await api(`/api/pg/listings/${l.id}/enquire`, { method: 'POST', body: { moveIn: $('#e-move').value, message: $('#e-msg').value } }); s.close(); toast('Enquiry sent.'); loadPgs(); }
    catch (x) { $('#e-err').textContent = x.message; }
  });
});

const first = await api('/api/pg/profile'); me = first.profile;
if (me) setTab('mates'); else { setTab('me'); drawProfile(first.old); }
