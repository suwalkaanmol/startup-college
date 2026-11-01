// UniHub section kit: API calls, sign-in checks, live updates and small UI helpers
// shared by Food, Xerox, Travel, PG and the staff and admin pages.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '');
export function when(iso, opts = {}) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return String(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...opts });
}
export function dayLabel(ymd) {
  const t = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const tm = new Date(Date.now() + 5.5 * 3600e3 + 86400e3).toISOString().slice(0, 10);
  if (ymd === t) return 'Today'; if (ymd === tm) return 'Tomorrow';
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
export const todayYmd = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
export { store };

export async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: raw ? headers : (body ? { 'Content-Type': 'application/json', ...headers } : headers),
    body: raw ? raw : (body ? JSON.stringify(body) : undefined),
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); e.status = res.status; e.code = data.code; e.data = data; throw e; }
  return data;
}

let toastTimer;
export function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
}

// Students: must be signed in with a finished profile, otherwise back to the hub.
export async function requireStudent() {
  try {
    const { user } = await api('/api/hub/me');
    store.set('hub_user', JSON.stringify({ name: user.name, email: user.email, complete: user.complete }));
    if (!user.complete) { location.replace('../index.html'); return new Promise(() => {}); }
    return user;
  } catch (e) {
    if (e.status === 401) { store.del('hub_user'); location.replace('../index.html#signin'); return new Promise(() => {}); }
    throw e;
  }
}

// Live updates. Calls onUpdate(data) for every change on the given topics; the browser reconnects by itself.
export function live(topics, onUpdate) {
  if (!('EventSource' in window) || !topics.length) return () => {};
  const es = new EventSource('/api/live?t=' + encodeURIComponent(topics.join(',')));
  es.addEventListener('update', (e) => { try { onUpdate(JSON.parse(e.data)); } catch { /* ignore */ } });
  return () => es.close();
}

export const ICONS = {
  food: '<svg viewBox="0 0 24 24"><path d="M3 11h18a9 9 0 0 1-18 0zM7 4c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3M17 4c0 1.5 1 1.5 1 3"/></svg>',
  xerox: '<svg viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/></svg>',
  travel: '<svg viewBox="0 0 24 24"><path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 19v2M17 19v2"/></svg>',
  pg: '<svg viewBox="0 0 24 24"><path d="M3 21V10l9-6 9 6v11M9 21v-6h6v6"/></svg>',
  admin: '<svg viewBox="0 0 24 24"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/></svg>',
};

// Top bar with the back link, section icon and title, and a slot for buttons.
export function bar({ section, title, back = '../index.html', backLabel = 'Campus Hub' }) {
  const el = document.createElement('header');
  el.className = 'bar';
  el.innerHTML = `<div class="bar-in">
    <a class="back" href="${back}" aria-label="Back to ${esc(backLabel)}"><span aria-hidden="true">←</span> <span class="back-txt">${esc(backLabel)}</span></a>
    <div class="bar-title"><span class="ico ${section}" aria-hidden="true">${ICONS[section] || ''}</span><h1>${esc(title)}</h1></div>
    <div class="bar-actions" id="bar-actions"></div></div>`;
  document.body.prepend(el);
  return el.querySelector('#bar-actions');
}

export function pill(status) {
  const s = String(status || '').toUpperCase();
  const label = { PLACED: 'Placed', PREPARING: 'Preparing', READY: 'Ready to collect', COMPLETED: 'Collected', CANCELLED: 'Cancelled',
    QUEUED: 'In queue', PRINTING: 'Printing', COLLECTED: 'Collected', NEW: 'New', CONTACTED: 'Contacted', CLOSED: 'Closed' }[s] || cap(s);
  const cls = /READY/.test(s) ? 'solid' : /COMPLETED|COLLECTED|CLOSED/.test(s) ? 'ok' : /CANCEL/.test(s) ? 'bad' : 'live';
  return `<span class="pill ${cls}">${esc(label)}</span>`;
}

// A panel that slides up on phones and in from the right on desktop.
export function sheet({ title, body = '', foot = '', onClose } = {}) {
  const scrim = document.createElement('div'); scrim.className = 'sheet-scrim';
  const el = document.createElement('section'); el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', title);
  el.innerHTML = `<div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div><div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}`;
  const last = document.activeElement;
  const close = () => { scrim.remove(); el.remove(); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; if (last && last.focus) last.focus(); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', close); el.querySelector('[data-close]').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(scrim, el); document.body.style.overflow = 'hidden';
  setTimeout(() => (el.querySelector('input, select, textarea, button:not([data-close])') || el.querySelector('[data-close]')).focus(), 30);
  return { el, close, body: el.querySelector('.sheet-body') };
}

// Staff and admin pages: show the sign-in card until a staff session exists.
export async function staffGate({ expect, title, onReady }) {
  const mount = $('#app');
  const start = (staff) => { mount.innerHTML = ''; onReady(staff); };
  try { const { staff } = await api('/api/staff/me'); if (!expect || staff.role === expect || staff.role === 'admin') return start(staff); } catch { /* not signed in */ }
  mount.innerHTML = `<div class="signin"><form class="card" id="staff-login" novalidate>
      <h2>${esc(title)}</h2><p class="muted" style="margin-bottom:16px">Sign in with the staff ID and password from your UniHub admin.</p>
      <div class="field"><label for="sid">Staff ID</label><input id="sid" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      <div class="field"><label for="spw">Password</label><input id="spw" type="password" autocomplete="current-password" required></div>
      <p class="err" id="serr" role="alert"></p>
      <button class="btn primary block" type="submit">Sign in</button></form></div>`;
  $('#sid').focus();
  $('#staff-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#sid').value.trim(), password = $('#spw').value, err = $('#serr');
    if (!username || !password) { err.textContent = 'Enter your staff ID and password.'; return; }
    const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Signing in…';
    try { const { staff } = await api('/api/staff/login', { method: 'POST', body: { username, password, expect } }); start(staff); }
    catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'Sign in'; $('#spw').select(); }
  });
}

export function staffMenu(actions, staff) {
  const b = document.createElement('button'); b.className = 'btn ghost sm'; b.textContent = staff.name;
  b.setAttribute('aria-haspopup', 'dialog');
  b.addEventListener('click', () => {
    const s = sheet({
      title: 'Your staff account',
      body: `<p><b>${esc(staff.name)}</b><br><span class="muted small">Staff ID: ${esc(staff.username)} · ${esc(staff.placeName)}</span></p>
        <form id="pw-form" novalidate class="card"><h3 style="margin-bottom:10px">Change password</h3>
          <div class="field"><label for="pw-cur">Current password</label><input id="pw-cur" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="pw-new">New password</label><input id="pw-new" type="password" autocomplete="new-password"><p class="muted small">At least 8 characters, with letters and numbers.</p></div>
          <p class="err" id="pw-err" role="alert"></p><button class="btn primary block" type="submit">Save new password</button></form>`,
      foot: '<button class="btn danger block" id="staff-out">Sign out</button>',
    });
    s.el.querySelector('#pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/staff/password', { method: 'POST', body: { current: $('#pw-cur').value, next: $('#pw-new').value } }); s.close(); toast('Password changed.'); }
      catch (x) { $('#pw-err').textContent = x.message; }
    });
    s.el.querySelector('#staff-out').addEventListener('click', async () => { await api('/api/staff/logout', { method: 'POST' }).catch(() => {}); location.reload(); });
  });
  actions.appendChild(b);
}

// Pay by phone (UPI) before an order is sent. Step 1: mobile number. Step 2: the 6-digit code. Then onPay({ phone, otp })
// places the order; if it throws, the message shows here and the student can fix the code.
export function paySheet({ amount, payee, phone = '', onPay }) {
  const ph = String(phone).replace(/^\+91/, '');
  const s = sheet({
    title: 'Pay online',
    body: `<div class="pay">
      <div class="pay-amt"><span class="muted small">Paying ${esc(payee)}</span><b class="num">${money(amount)}</b></div>
      <form id="pay-1" class="stack" novalidate>
        <div class="field"><label for="pay-ph">Mobile number linked to your UPI</label>
          <div class="pay-ph"><span>+91</span><input id="pay-ph" inputmode="numeric" autocomplete="tel-national" maxlength="10" value="${esc(ph)}" placeholder="98765 43210"></div></div>
        <button class="btn primary block" type="submit">Send code</button>
      </form>
      <form id="pay-2" class="stack" novalidate hidden>
        <p class="small">We sent a 6-digit code to <b id="pay-to"></b>. <button type="button" class="link" id="pay-edit">Change</button></p>
        <div class="field"><label for="pay-otp">Code</label><input id="pay-otp" class="pay-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••"></div>
        <p class="notice small">Demo payment: no money is taken. Use the code <b>123456</b>.</p>
        <button class="btn primary block" type="submit" id="pay-go">Pay ${money(amount)}</button>
      </form>
      <div id="pay-done" class="pay-done" hidden aria-live="polite"><div class="pay-tick" aria-hidden="true">✓</div><b>Payment done</b><span class="muted small" id="pay-ref"></span></div>
      <p class="err" id="pay-err" role="alert"></p></div>`,
  });
  const q = (sel) => s.el.querySelector(sel);
  const err = (m = '') => { q('#pay-err').textContent = m; };
  q('#pay-ph').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
  q('#pay-otp').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); err(); });
  q('#pay-1').addEventListener('submit', (e) => {
    e.preventDefault(); const v = q('#pay-ph').value;
    if (!/^[6-9]\d{9}$/.test(v)) { err('Enter a 10-digit Indian mobile number.'); return; }
    err(); q('#pay-to').textContent = `+91 ${v.slice(0, 5)} ${v.slice(5)}`;
    q('#pay-1').hidden = true; q('#pay-2').hidden = false; q('#pay-otp').focus();
  });
  q('#pay-edit').addEventListener('click', () => { q('#pay-2').hidden = true; q('#pay-1').hidden = false; q('#pay-ph').focus(); err(); });
  q('#pay-2').addEventListener('submit', async (e) => {
    e.preventDefault(); const otp = q('#pay-otp').value;
    if (otp.length !== 6) { err('Enter the 6-digit code.'); return; }
    const btn = q('#pay-go'); btn.disabled = true; btn.textContent = 'Paying…'; err();
    try {
      const res = await onPay({ phone: q('#pay-ph').value, otp });
      q('#pay-2').hidden = true; q('#pay-done').hidden = false; q('#pay-ref').textContent = res?.ref ? `Ref ${res.ref}` : '';
      setTimeout(() => { s.close(); res?.after?.(); }, 1100);
    } catch (x) { err(x.message); btn.disabled = false; btn.textContent = `Pay ${money(amount)}`; if (x.code === 'PAY_CODE') q('#pay-otp').select(); else if (!String(x.code || '').startsWith('PAY')) setTimeout(s.close, 1800); }
  });
  return s;
}
