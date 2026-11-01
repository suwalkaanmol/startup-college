// UniHub hub page: sign-in with an emailed code, first-run profile, home tiles and the profile drawer.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

let me = null;
let config = { domain: 'vitstudent.ac.in', devCodes: false };
let pendingEmail = '';
let resendTimer = null;

async function api(path, opts = {}) {
  const res = await fetch('/api/hub' + path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); e.status = res.status; e.data = data; throw e; }
  return data;
}

function show(id) {
  ['splash', 'screen-auth', 'screen-onboard', 'screen-main'].forEach((s) => { $('#' + s).hidden = s !== id; });
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}
const initials = (name, email) => {
  const src = (name || email || 'U').trim();
  const parts = src.split(/[\s.@]+/).filter(Boolean);
  return ((parts[0]?.[0] || 'U') + (name && parts[1] ? parts[1][0] : '')).toUpperCase();
};
const prettyPhone = (p) => (p ? p.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2') : '');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

function remember(u) {
  me = u;
  if (u) store.set('hub_user', JSON.stringify({ name: u.name, email: u.email, complete: u.complete }));
  else store.del('hub_user');
}

/* ---------------- sign in ---------------- */
function emailError(v) {
  const e = v.trim().toLowerCase();
  if (!e) return 'Enter your college email.';
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(e)) return 'That doesn’t look like an email address.';
  if (!e.endsWith('@' + config.domain)) return `Use your @${config.domain} email.`;
  return '';
}
function setErr(input, el, msg) { el.textContent = msg; input.setAttribute('aria-invalid', msg ? 'true' : 'false'); }

function startResendCountdown(sec = 30) {
  const b = $('#resend-btn'); clearInterval(resendTimer);
  let left = sec; b.disabled = true; b.textContent = `Send a new code in ${left}s`;
  resendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) { clearInterval(resendTimer); b.disabled = false; b.textContent = 'Send a new code'; }
    else b.textContent = `Send a new code in ${left}s`;
  }, 1000);
}

async function requestCode(email) {
  const r = await api('/auth/request-code', { method: 'POST', body: { email } });
  pendingEmail = r.email;
  $('#code-email').textContent = r.email;
  const dev = $('#dev-note');
  if (r.devCode) { dev.hidden = false; dev.innerHTML = `Test mode: email isn’t connected yet, so here is your code: <b>${r.devCode}</b>`; }
  else dev.hidden = true;
  $('#email-form').hidden = true; $('#code-form').hidden = false;
  $('#code').value = ''; setErr($('#code'), $('#code-error'), '');
  $('#code').focus();
  startResendCountdown();
}

$('#email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#email'), err = $('#email-error'), btn = $('#send-btn');
  const msg = emailError(input.value);
  setErr(input, err, msg);
  if (msg) { input.focus(); return; }
  btn.disabled = true; btn.textContent = 'Sending…';
  try { await requestCode(input.value.trim().toLowerCase()); }
  catch (x) { setErr(input, err, x.message); }
  finally { btn.disabled = false; btn.textContent = 'Send code'; }
});
$('#email').addEventListener('input', () => setErr($('#email'), $('#email-error'), ''));

$('#code').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  setErr(e.target, $('#code-error'), '');
  if (e.target.value.length === 6) $('#code-form').requestSubmit();
});
$('#code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#code'), err = $('#code-error'), btn = $('#verify-btn');
  if (input.value.length !== 6) { setErr(input, err, 'Enter the 6-digit code from the email.'); input.focus(); return; }
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const { user } = await api('/auth/verify', { method: 'POST', body: { email: pendingEmail, code: input.value } });
    remember(user);
    route();
  } catch (x) { setErr(input, err, x.message); input.select(); }
  finally { btn.disabled = false; btn.textContent = 'Sign in'; }
});
$('#resend-btn').addEventListener('click', async () => {
  try { await requestCode(pendingEmail); toast('New code sent.'); }
  catch (x) { setErr($('#code'), $('#code-error'), x.message); }
});
$('#change-email').addEventListener('click', () => {
  clearInterval(resendTimer);
  $('#code-form').hidden = true; $('#email-form').hidden = false; $('#email').focus();
});

/* ---------------- profile form (shared by onboarding and drawer) ---------------- */
function fillForm(form, u) {
  form.elements.name.value = u.name || '';
  form.elements.phone.value = u.phone ? u.phone.replace(/^\+91/, '') : '';
  form.elements.regNo.value = u.regNo || '';
  $$('input[name=gender]', form).forEach((r) => { r.checked = r.value === u.gender; });
}
function readForm(form) {
  return {
    name: form.elements.name.value,
    phone: form.elements.phone.value,
    regNo: form.elements.regNo.value,
    gender: ($('input[name=gender]:checked', form) || {}).value || '',
  };
}
function localCheck(v) {
  const f = {};
  if (v.name.trim().length < 2) f.name = 'Enter your full name.';
  if (!/^(\+?91)?[6-9]\d{9}$/.test(v.phone.replace(/[\s-]/g, ''))) f.phone = 'Enter a 10-digit Indian mobile number.';
  if (!/^\d{2}[A-Z]{2,4}\d{3,5}$/.test(v.regNo.trim().toUpperCase().replace(/\s+/g, ''))) f.regNo = 'Use the format on your ID card, like 22BCE1234.';
  if (!v.gender) f.gender = 'Choose one. Travel and PG use it to match you safely.';
  return f;
}
function showFieldErrors(form, fields) {
  $$('.field-error[data-for]', form).forEach((p) => {
    const k = p.dataset.for; p.textContent = fields[k] || '';
    const inp = form.elements[k];
    if (inp && inp.setAttribute) inp.setAttribute('aria-invalid', fields[k] ? 'true' : 'false');
  });
  const firstBad = Object.keys(fields)[0];
  if (firstBad) { const el = form.elements[firstBad]; (el.focus ? el : el[0]).focus(); }
}
async function saveProfile(form) {
  const v = readForm(form);
  const bad = localCheck(v);
  showFieldErrors(form, bad);
  if (Object.keys(bad).length) return null;
  try {
    const { user } = await api('/me', { method: 'PUT', body: v });
    remember(user); return user;
  } catch (x) {
    if (x.data?.fields) showFieldErrors(form, x.data.fields); else toast(x.message);
    return null;
  }
}
$$('#onboard-form input, #info-form input').forEach((i) => i.addEventListener('input', () => {
  const p = $(`.field-error[data-for="${i.name}"]`, i.form); if (p) { p.textContent = ''; i.setAttribute('aria-invalid', 'false'); }
}));
$('#onboard-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('button[type=submit]', e.target); btn.disabled = true;
  const u = await saveProfile(e.target);
  btn.disabled = false;
  if (u) route();
});

/* ---------------- home ---------------- */
function greet() {
  const h = new Date().getHours();
  const part = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const first = (me.name || '').split(' ')[0];
  $('#greeting').textContent = `${part}, ${first}`;
  $('#today').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const ini = initials(me.name, me.email);
  $('#avatar-initials').textContent = ini; $('#drawer-initials').textContent = ini;
}

const FOOD_ACTIVE = /PENDING|PLACED|PREPARING|READY|ACCEPTED|CONFIRMED/;
function foodOrders() {
  let list = [];
  try { list = JSON.parse(store.get('food_student_orders') || '[]'); } catch { list = []; }
  return (Array.isArray(list) ? list : []).filter((o) => o && (o.id || o.daily_token)).map((o) => ({
    source: 'food', id: 'f' + (o.id || o.daily_token), token: o.daily_token || '—', status: String(o.status || '').toUpperCase(),
    amount: Number(o.total_amount) || 0, at: o.created_at || o.token_date || null, title: 'Canteen order',
  }));
}
async function xeroxOrders() {
  const cfg = window.XEROX_CONFIG || {};
  let session = null;
  try { session = JSON.parse(store.get('xerox-student-auth') || 'null'); } catch { session = null; }
  const token = session?.access_token || session?.currentSession?.access_token;
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !token) return [];
  try {
    const r = await fetch(`${cfg.supabaseUrl}/rest/v1/orders?select=id,token,total,status,created_at,shops(name)&status=neq.pending_payment&order=created_at.desc&limit=30`, {
      headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return [];
    return (await r.json()).map((o) => ({
      source: 'xerox', id: 'x' + o.id, token: o.token, status: String(o.status || '').toUpperCase(),
      amount: Number(o.total) || 0, at: o.created_at, title: o.shops?.name ? `Print · ${o.shops.name}` : 'Print order',
    }));
  } catch { return []; }
}
let allOrders = [];
let orderFilter = 'all';
const ICONS = {
  food: '<svg viewBox="0 0 24 24"><path d="M3 11h18a9 9 0 0 1-18 0zM8 4c0 1.5 1 1.5 1 3M15 4c0 1.5 1 1.5 1 3"/></svg>',
  xerox: '<svg viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/></svg>',
};
function statusPill(s) {
  const label = cap(s.toLowerCase().replace(/_/g, ' ')) || 'Placed';
  const cls = /COMPLETED|DELIVERED|COLLECTED|PICKED/.test(s) ? 'ok' : /CANCEL|REJECT|FAIL/.test(s) ? 'bad' : 'live';
  return `<span class="pill ${cls}">${label}</span>`;
}
const when = (at) => {
  if (!at) return '';
  const d = new Date(at); if (isNaN(d)) return String(at);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderOrders() {
  const ul = $('#orders');
  const list = allOrders.filter((o) => orderFilter === 'all' || o.source === orderFilter);
  if (!list.length) {
    const where = orderFilter === 'xerox' ? 'Xerox' : orderFilter === 'food' ? 'Food' : 'Food or Xerox';
    ul.innerHTML = `<li class="empty">No orders yet. When you order from ${where}, it shows up here.</li>`;
    return;
  }
  ul.innerHTML = list.map((o) => `<li>
    <span class="o-ico ${o.source}" aria-hidden="true">${ICONS[o.source]}</span>
    <span class="o-main"><b>${esc(o.title)} · Token ${esc(o.token)}</b><span>${esc(when(o.at))}</span><br>${statusPill(o.status)}</span>
    <span class="o-amt">₹${Math.round(o.amount)}</span></li>`).join('');
}
async function loadOrders() {
  const x = await xeroxOrders();
  allOrders = [...foodOrders(), ...x].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  renderOrders();
  const live = allOrders.find((o) => FOOD_ACTIVE.test(o.status));
  const box = $('#activity');
  if (live) {
    box.hidden = false;
    box.innerHTML = `${statusPill(live.status)}<span><b>${esc(live.title)}</b> · Token ${esc(live.token)} · ${esc(when(live.at))}</span>`;
  } else box.hidden = true;
}
$$('.chip').forEach((c) => c.addEventListener('click', () => {
  orderFilter = c.dataset.filter;
  $$('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
  renderOrders();
}));

// Travel and PG need a signed hand-off from the hub; the rest are plain links.
$$('.tile').forEach((t) => t.addEventListener('click', async (e) => {
  const mod = t.dataset.open;
  if (mod !== 'travel' && mod !== 'pg') return;
  e.preventDefault();
  t.classList.add('busy'); $('#open-note').textContent = `Opening ${cap(mod)}…`;
  try {
    const r = await api('/sso/' + mod);
    if (!r.linked && r.note) store.set('hub_last_note', r.note);
    location.href = r.url;
  } catch (x) {
    t.classList.remove('busy'); $('#open-note').textContent = x.message;
  }
}));

// Room search: opens VIT Nav on that room.
$('#roomfind').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#room-q').value.trim().toUpperCase().replace(/^PRP\s*/, '');
  const err = $('#room-err');
  if (!v) { err.textContent = 'Type a room number, like 623.'; $('#room-q').focus(); return; }
  if (!/^6\d{2}[A-Z]?$/.test(v)) { err.textContent = 'VIT Nav has PRP level 6 for now: rooms 601 to 678.'; $('#room-q').focus(); return; }
  location.href = 'nav/index.html#room=' + encodeURIComponent(v);
});
$('#room-q').addEventListener('input', () => { $('#room-err').textContent = ''; });

/* ---------------- drawer ---------------- */
let lastFocus = null;
function fillInfo() {
  const v = { name: me.name, phone: prettyPhone(me.phone), email: me.email, regNo: me.regNo, gender: cap(me.gender) };
  $$('#info-view dd').forEach((dd) => { dd.textContent = v[dd.dataset.k] || '—'; });
  $('#drawer-name').textContent = me.name || 'Your profile';
  $('#drawer-email').textContent = me.email;
}
function openDrawer() {
  lastFocus = document.activeElement;
  fillInfo(); loadOrders();
  $('#scrim').hidden = false; $('#drawer').hidden = false;
  $('#avatar-btn').setAttribute('aria-expanded', 'true');
  $('#drawer-close').focus();
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  $('#scrim').hidden = true; $('#drawer').hidden = true;
  $('#avatar-btn').setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  showInfoForm(false);
  if (lastFocus) lastFocus.focus();
}
$('#avatar-btn').addEventListener('click', openDrawer);
$('#drawer-close').addEventListener('click', closeDrawer);
$('#scrim').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if ($('#drawer').hidden) return;
  if (e.key === 'Escape') closeDrawer();
  if (e.key === 'Tab') { // keep focus inside the drawer
    const f = $$('#drawer button, #drawer input, #drawer a').filter((el) => !el.closest('[hidden]') && !el.disabled);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});
function showInfoForm(on) {
  $('#info-view').hidden = on; $('#info-form').hidden = !on; $('#edit-info').hidden = on;
  if (on) { fillForm($('#info-form'), me); showFieldErrors($('#info-form'), {}); $('#pf-name').focus(); }
}
$('#edit-info').addEventListener('click', () => showInfoForm(true));
$('#cancel-info').addEventListener('click', () => showInfoForm(false));
$('#info-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = await saveProfile(e.target);
  if (u) { fillInfo(); greet(); showInfoForm(false); toast('Saved.'); }
});

function applyTheme(pref) {
  store.set('hub_theme', pref);
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  ['food_student_theme', 'food_owner_theme', 'travel_theme', 'xerox-theme'].forEach((k) => store.set(k, dark ? 'dark' : 'light'));
}
$$('#theme-seg input').forEach((r) => {
  r.checked = r.value === (store.get('hub_theme') || 'system');
  r.addEventListener('change', () => applyTheme(r.value));
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if ((store.get('hub_theme') || 'system') === 'system') applyTheme('system'); });

$('#signout').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* already signed out */ }
  remember(null); closeDrawer();
  $('#email').value = ''; $('#code-form').hidden = true; $('#email-form').hidden = false;
  show('screen-auth');
});

$('#delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = $('#del-confirm').value.trim().toUpperCase(), err = $('#del-error');
  if (v !== 'DELETE') { err.textContent = 'Type DELETE to confirm.'; $('#del-confirm').focus(); return; }
  try {
    await api('/me', { method: 'DELETE', body: { confirm: v } });
    remember(null); closeDrawer(); show('screen-auth'); toast('Your account has been deleted.');
  } catch (x) { err.textContent = x.message; }
});
$('#del-confirm').addEventListener('input', () => { $('#del-error').textContent = ''; });

// Cards whose server isn't set up yet say so, so nobody lands on an error.
async function markConnections() {
  let st;
  try { st = await fetch('/api/hub/status').then((r) => r.json()); } catch { return; }
  ['xerox', 'food', 'travel', 'pg'].forEach((k) => {
    const t = $(`.tile[data-open="${k}"]`); if (!t) return;
    let b = $('.tile-badge', t);
    if (st[k] === false) {
      if (!b) { b = document.createElement('span'); b.className = 'tile-badge'; t.appendChild(b); }
      b.textContent = 'Not connected yet';
      t.setAttribute('aria-description', 'This section’s server isn’t set up yet, so it can’t load data.');
    } else if (b) b.remove();
  });
}

/* ---------------- routing ---------------- */
function route() {
  if (!me) { show('screen-auth'); $('#email').focus(); return; }
  if (!me.complete) {
    fillForm($('#onboard-form'), me); $('#ob-email').value = me.email;
    show('screen-onboard'); $('#ob-name').focus(); return;
  }
  greet(); show('screen-main'); loadOrders(); markConnections();
  const note = store.get('hub_last_note');
  if (note) { $('#open-note').textContent = note; store.del('hub_last_note'); }
}

// Installable app: cache the hub so it opens even on a weak connection.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

(async function init() {
  try { config = { ...config, ...(await fetch('/api/hub/config').then((r) => r.json())) }; } catch { /* use defaults */ }
  $('#email').placeholder = `name.surname2024@${config.domain}`;
  try { const { user } = await api('/me'); remember(user); }
  catch { remember(null); }
  route();
})();
