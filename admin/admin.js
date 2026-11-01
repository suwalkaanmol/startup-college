// Admin: staff accounts, canteens, PG listings and enquiries.
import { $, $$, esc, money, when, api, toast, bar, sheet, pill, staffGate, staffMenu } from '../hub/web/kit.js';

const actions = bar({ section: 'admin', title: 'Admin' });
staffGate({ expect: 'admin', title: 'Admin sign-in', onReady: start });

async function start(me) {
  if (me.role !== 'admin') { $('#app').innerHTML = '<p class="empty">This page is for UniHub admins. Your login is for a canteen or shop.</p>'; return; }
  staffMenu(actions, me);
  const app = $('#app');
  let ov = await api('/api/admin/overview');
  const AMEN = ['Wi-Fi', 'AC', 'Mess', 'Laundry', 'CCTV', 'Warden', 'Attached bath', 'Power backup', 'Parking', 'Gym', 'Housekeeping', 'Hot water'];
  app.innerHTML = `
    <section class="hero admin"><h2>UniHub admin</h2><p>Create staff logins, add canteens, manage PG listings and answer enquiries.</p></section>
    <div class="stats" id="counts" style="margin-top:14px"></div>
    <div class="tabs" role="tablist" style="margin-top:16px">
      <button role="tab" aria-selected="true" data-tab="staff">Staff logins</button><button role="tab" aria-selected="false" data-tab="places">Canteens & shops</button>
      <button role="tab" aria-selected="false" data-tab="pg">PG listings</button><button role="tab" aria-selected="false" data-tab="enq">Enquiries</button>
    </div>
    <section id="t-staff"></section><section id="t-places" hidden></section><section id="t-pg" hidden></section><section id="t-enq" hidden></section>`;

  const drawCounts = () => {
    const c = ov.counts;
    $('#counts').innerHTML = [['Students', c.students], ['Staff logins', c.staff], ['Food orders', c.foodOrders], ['Print orders', c.xeroxOrders], ['Rides', c.rides], ['PG listings', c.pgListings], ['New enquiries', c.enquiries]]
      .map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
  };
  drawCounts();
  const refresh = async () => { ov = await api('/api/admin/overview'); drawCounts(); };
  const placeOptions = (role, sel) => (role === 'canteen' ? ov.places.canteen : ov.places.xerox).map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const showPassword = (title, who, pw) => {
    const s = sheet({ title, body: `<p>Give these to <b>${esc(who.name)}</b>. The password is shown only once.</p>
      <div class="card"><p class="muted small">Staff ID</p><p class="token" style="font-size:24px">${esc(who.username)}</p><p class="muted small" style="margin-top:10px">Password</p><p class="token" style="font-size:24px;overflow-wrap:anywhere">${esc(pw)}</p></div>
      <p class="muted small">They sign in at ${who.role === 'canteen' ? 'Food → Staff login' : who.role === 'xerox' ? 'Xerox → Staff login' : 'the admin page'} and can change the password there.</p>`,
      foot: '<button class="btn ghost block" id="copy-pw">Copy staff ID and password</button><button class="btn primary block" id="pw-done">Done</button>' });
    s.el.querySelector('#copy-pw').addEventListener('click', () => { navigator.clipboard?.writeText(`Staff ID: ${who.username}\nPassword: ${pw}`).then(() => toast('Copied.'), () => toast('Copy was blocked. Write them down instead.')); });
    s.el.querySelector('#pw-done').addEventListener('click', s.close);
  };

  /* ----- staff ----- */
  async function loadStaff() {
    const { staff } = await api('/api/admin/staff');
    $('#t-staff').innerHTML = `<div class="row between" style="margin-bottom:10px"><p class="muted">Canteen logins see one canteen’s orders and menu. Shop logins see one Xerox shop’s queue and prices.</p><button class="btn primary sm" id="new-staff">New staff login</button></div>
      <ul class="list">${staff.map((s) => `<li class="item"><div class="main"><b>${esc(s.name)}</b> <span class="pill">${s.role === 'admin' ? 'Admin' : s.role === 'canteen' ? 'Canteen' : 'Xerox shop'}</span>
        <div class="muted small">Staff ID: <b style="color:var(--uh-text)">${esc(s.username)}</b> · ${esc(s.placeName)}</div></div>
        <button class="btn ghost sm" data-reset="${s.id}" data-name="${esc(s.name)}" data-user="${esc(s.username)}" data-role="${s.role}">Reset password</button>
        ${s.id === me.id ? '' : `<button class="btn danger sm" data-del="${s.id}">Delete</button>`}</li>`).join('')}</ul>`;
    $('#new-staff').addEventListener('click', () => {
      const s = sheet({ title: 'New staff login', body: `<form novalidate>
        <div class="field"><label for="n-role">Role</label><select id="n-role"><option value="canteen">Canteen staff</option><option value="xerox">Xerox shop staff</option><option value="admin">Admin</option></select></div>
        <div class="field" id="n-place-f"><label for="n-place">Canteen or shop</label><select id="n-place">${placeOptions('canteen')}</select></div>
        <div class="field"><label for="n-name">Name shown on the page</label><input id="n-name" maxlength="60" placeholder="Foodys evening counter"></div>
        <div class="field"><label for="n-user">Staff ID</label><input id="n-user" maxlength="30" autocapitalize="none" placeholder="foodys.evening"></div>
        <div class="field"><label for="n-pw">Password (leave empty to generate one)</label><input id="n-pw" type="text" autocomplete="off"></div>
        <p class="err" id="n-err" role="alert"></p></form>`, foot: '<button class="btn primary block" id="n-save">Create login</button>' });
      $('#n-role').addEventListener('change', (e) => { $('#n-place-f').hidden = e.target.value === 'admin'; if (e.target.value !== 'admin') $('#n-place').innerHTML = placeOptions(e.target.value); });
      $('#n-save').addEventListener('click', async () => {
        try {
          const r = await api('/api/admin/staff', { method: 'POST', body: { role: $('#n-role').value, place: $('#n-place').value, name: $('#n-name').value, username: $('#n-user').value, password: $('#n-pw').value } });
          s.close(); showPassword('Staff login created', r.staff, r.password); loadStaff(); refresh();
        } catch (x) { $('#n-err').textContent = x.message; }
      });
    });
  }
  $('#t-staff').addEventListener('click', async (e) => {
    const rs = e.target.closest('[data-reset]'), dl = e.target.closest('[data-del]');
    if (rs) { if (!rs.dataset.sure) { rs.dataset.sure = '1'; rs.textContent = 'Tap again to reset'; return; }
      try { const { password } = await api(`/api/admin/staff/${rs.dataset.reset}/reset`, { method: 'POST' }); showPassword('New password', { name: rs.dataset.name, username: rs.dataset.user, role: rs.dataset.role }, password); loadStaff(); } catch (x) { toast(x.message); } }
    if (dl) { if (!dl.dataset.sure) { dl.dataset.sure = '1'; dl.textContent = 'Tap again to delete'; return; }
      try { await api(`/api/admin/staff/${dl.dataset.del}`, { method: 'DELETE' }); toast('Login deleted.'); loadStaff(); refresh(); } catch (x) { toast(x.message); } }
  });

  /* ----- canteens & shops ----- */
  function loadPlaces() {
    $('#t-places').innerHTML = `<div class="cols"><div class="stack">
      <div class="card"><h3 style="margin-bottom:8px">Canteens</h3><ul class="list">${ov.places.canteen.map((c) => `<li class="row between"><span>${esc(c.name)}</span><a class="btn ghost sm" href="../food/staff.html?canteen=${encodeURIComponent(c.id)}">Open board</a></li>`).join('')}</ul></div>
      <div class="card"><h3 style="margin-bottom:8px">Xerox shops</h3><ul class="list">${ov.places.xerox.map((c) => `<li class="row between"><span>${esc(c.name)}</span><a class="btn ghost sm" href="../xerox/staff.html?shop=${encodeURIComponent(c.id)}">Open queue</a></li>`).join('')}</ul></div></div>
      <aside><form class="card" id="new-canteen" novalidate><h3 style="margin-bottom:10px">Add a canteen</h3>
        <div class="field"><label for="c-name">Name</label><input id="c-name" maxlength="40" placeholder="Gazebo"></div>
        <div class="field"><label for="c-place">Where it is (optional)</label><input id="c-place" maxlength="60" placeholder="Near SJT"></div>
        <div class="field"><label for="c-prefix">Token letter</label><input id="c-prefix" maxlength="1" placeholder="G" style="width:80px;text-transform:uppercase"></div>
        <p class="err" id="c-err" role="alert"></p><button class="btn primary block" type="submit">Add canteen</button>
        <p class="muted small" style="margin-top:8px">Then create a canteen staff login for it so its staff can add the menu.</p></form></aside></div>`;
    $('#new-canteen').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/admin/canteens', { method: 'POST', body: { name: $('#c-name').value, place: $('#c-place').value, prefix: $('#c-prefix').value } }); toast('Canteen added.'); await refresh(); loadPlaces(); }
      catch (x) { $('#c-err').textContent = x.message; }
    });
  }

  /* ----- PG listings ----- */
  let pgs = [];
  async function loadPg() {
    ({ listings: pgs } = await api('/api/admin/pg/listings'));
    $('#t-pg').innerHTML = `<div class="row between" style="margin-bottom:10px"><p class="muted">Students see listings that match their gender. Sample listings can’t be enquired about; replace them with real PGs.</p><button class="btn primary sm" id="new-pg">Add PG</button></div>
      <ul class="list">${pgs.map((l) => `<li class="item"><div class="main"><b>${esc(l.name)}</b> ${l.sample ? '<span class="pill warn">Sample</span>' : ''}<div class="muted small">${esc(l.area)} · ${money(l.rent)} / month · ${l.gender === 'any' ? 'Anyone' : l.gender === 'female' ? 'Girls' : 'Boys'} · ${l.sharing} sharing</div></div>
        <button class="btn ghost sm" data-edit-pg="${l.id}">Edit</button><button class="btn danger sm" data-del-pg="${l.id}">Delete</button></li>`).join('') || '<li class="empty">No PGs yet.</li>'}</ul>`;
    $('#new-pg').addEventListener('click', () => editPg(null));
  }
  function editPg(l) {
    const s = sheet({ title: l ? 'Edit PG' : 'Add PG', body: `<form novalidate>
      <div class="field"><label for="g-name">Name</label><input id="g-name" maxlength="60" value="${esc(l && !l.sample ? l.name : '')}"></div>
      <div class="field"><label for="g-area">Area</label><input id="g-area" maxlength="60" value="${esc(l?.area || '')}" placeholder="Near VIT Main Gate"></div>
      <div class="form-grid"><div class="field"><label for="g-rent">Rent / month (₹)</label><input id="g-rent" inputmode="numeric" value="${l?.rent ?? ''}"></div>
        <div class="field"><label for="g-dist">Distance from VIT (km)</label><input id="g-dist" inputmode="decimal" value="${l?.distanceKm ?? ''}"></div>
        <div class="field"><label for="g-share">People per room</label><select id="g-share">${[1, 2, 3, 4, 5, 6].map((n) => `<option ${l?.sharing === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label for="g-gender">For</label><select id="g-gender"><option value="male" ${l?.gender === 'male' ? 'selected' : ''}>Boys</option><option value="female" ${l?.gender === 'female' ? 'selected' : ''}>Girls</option><option value="any" ${l?.gender === 'any' ? 'selected' : ''}>Anyone</option></select></div></div>
      <label class="check" style="margin-bottom:10px"><input type="checkbox" id="g-food" ${l?.food ? 'checked' : ''}> Food included</label>
      <div class="field"><span class="label">Amenities</span><div class="chips" id="g-am">${AMEN.map((a) => `<button type="button" class="chip" data-am="${esc(a)}" aria-pressed="${l?.amenities?.includes(a) ? 'true' : 'false'}">${esc(a)}</button>`).join('')}</div></div>
      <div class="form-grid"><div class="field"><label for="g-cn">Owner contact name</label><input id="g-cn" maxlength="60" value="${esc(l && !l.sample ? l.contactName : '')}"></div>
        <div class="field"><label for="g-cp">Owner phone</label><input id="g-cp" maxlength="20" value="${esc(l?.contactPhone || '')}"></div></div>
      <p class="muted small">Owner contact details are only shown to admins, with each enquiry.</p><p class="err" id="g-err" role="alert"></p></form>`,
      foot: `<button class="btn primary block" id="g-save">${l ? 'Save' : 'Add PG'}</button>` });
    $('#g-am').addEventListener('click', (e) => { const b = e.target.closest('[data-am]'); if (b) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); });
    $('#g-save').addEventListener('click', async () => {
      const body = { name: $('#g-name').value, area: $('#g-area').value, rent: Number($('#g-rent').value), distanceKm: Number($('#g-dist').value), sharing: Number($('#g-share').value), gender: $('#g-gender').value, food: $('#g-food').checked, amenities: $$('#g-am [aria-pressed="true"]').map((b) => b.dataset.am), contactName: $('#g-cn').value, contactPhone: $('#g-cp').value };
      try { await api(l ? `/api/admin/pg/listings/${l.id}` : '/api/admin/pg/listings', { method: l ? 'PUT' : 'POST', body }); s.close(); toast('Saved.'); loadPg(); refresh(); }
      catch (x) { $('#g-err').textContent = x.message; }
    });
  }
  $('#t-pg').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit-pg]'), dl = e.target.closest('[data-del-pg]');
    if (ed) editPg(pgs.find((l) => l.id === ed.dataset.editPg));
    if (dl) { if (!dl.dataset.sure) { dl.dataset.sure = '1'; dl.textContent = 'Tap again to delete'; return; } await api(`/api/admin/pg/listings/${dl.dataset.delPg}`, { method: 'DELETE' }); toast('Deleted.'); loadPg(); refresh(); }
  });

  /* ----- enquiries ----- */
  async function loadEnq() {
    const { enquiries } = await api('/api/admin/pg/enquiries');
    const byId = Object.fromEntries((await api('/api/admin/pg/listings')).listings.map((l) => [l.id, l]));
    $('#t-enq').innerHTML = `<ul class="list">${enquiries.map((q) => { const l = byId[q.listingId]; return `<li class="item" style="align-items:flex-start"><div class="main">
        <b>${esc(q.listingName)}</b> ${pill(q.status)}<div class="small" style="margin-top:4px">${esc(q.name)} · <a href="tel:${esc(q.phone)}">${esc(q.phone)}</a> · <a href="mailto:${esc(q.email)}">${esc(q.email)}</a></div>
        <div class="muted small">${esc(when(q.createdAt))}${q.moveIn ? ` · moving in ${esc(q.moveIn)}` : ''}</div>${q.message ? `<p class="notice small" style="margin-top:6px">“${esc(q.message)}”</p>` : ''}
        ${l?.contactPhone ? `<p class="muted small" style="margin-top:6px">PG owner: ${esc(l.contactName || '')} <a href="tel:${esc(l.contactPhone)}">${esc(l.contactPhone)}</a></p>` : ''}</div>
        <label class="sr" for="st-${q.id}">Status</label><select id="st-${q.id}" data-enq="${q.id}" style="width:auto">${['NEW', 'CONTACTED', 'CLOSED'].map((s) => `<option value="${s}" ${q.status === s ? 'selected' : ''}>${s[0] + s.slice(1).toLowerCase()}</option>`).join('')}</select></li>`; }).join('') || '<li class="empty">No enquiries yet.</li>'}</ul>`;
  }
  $('#t-enq').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-enq]'); if (!sel) return;
    try { await api(`/api/admin/pg/enquiries/${sel.dataset.enq}`, { method: 'POST', body: { status: sel.value } }); toast('Updated.'); refresh(); } catch (x) { toast(x.message); }
  });

  const loaders = { staff: loadStaff, places: loadPlaces, pg: loadPg, enq: loadEnq };
  $$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    for (const t of Object.keys(loaders)) $('#t-' + t).hidden = t !== b.dataset.tab;
    loaders[b.dataset.tab]();
  }));
  loadStaff();
}
