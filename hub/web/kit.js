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
  let list = [];
  if (expect) { try { list = (await api('/api/staff/places'))[expect] || []; } catch { /* admin mode only */ } }
  const what = expect === 'canteen' ? 'canteen' : 'shop';
  let byPlace = Boolean(expect && list.length);
  const draw = () => {
    mount.innerHTML = `<div class="signin"><form class="card" id="staff-login" novalidate>
      <h2>${esc(title)}</h2><p class="muted" style="margin-bottom:16px">${byPlace ? `Pick your ${what} and enter its owner password.` : 'Sign in with your staff ID and password.'}</p>
      ${byPlace ? `<div class="field"><label for="splace">Your ${what}</label><select id="splace"><option value="">Choose your ${what}</option>${list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>`
        : '<div class="field"><label for="sid">Staff ID</label><input id="sid" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>'}
      <div class="field"><label for="spw">Password</label><input id="spw" type="password" autocomplete="current-password" required></div>
      <p class="err" id="serr" role="alert"></p>
      <button class="btn primary block" type="submit">Sign in to dashboard</button>
      ${expect && list.length ? `<button type="button" class="link small" id="swap" style="margin-top:12px">${byPlace ? 'UniHub admin? Sign in with a staff ID' : `Sign in as a ${what} owner`}</button>` : ''}</form></div>`;
    (byPlace ? $('#splace') : $('#sid')).focus();
    $('#swap')?.addEventListener('click', () => { byPlace = !byPlace; draw(); });
    $('#staff-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#serr'), password = $('#spw').value;
      const body = byPlace ? { place: $('#splace').value, password, expect } : { username: $('#sid').value.trim(), password, expect };
      if ((byPlace ? !body.place : !body.username) || !password) { err.textContent = byPlace ? `Pick your ${what} and enter the password.` : 'Enter your staff ID and password.'; return; }
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Signing in…';
      try { const { staff } = await api('/api/staff/login', { method: 'POST', body }); start(staff); }
      catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'Sign in to dashboard'; $('#spw').select(); }
    });
  };
  draw();
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

// Pay by UPI before an order is sent. The money goes to that canteen's or shop's own UPI ID.
// Step 1: mobile number linked to UPI. Step 2: the 6-digit code. Then onPay({ phone, otp }) places the order;
// if it throws, the message shows here and the student can fix the code.
export function paySheet({ amount, payee, upi = '', phone = '', onPay }) {
  const ph = String(phone).replace(/^\+91/, '');
  const s = sheet({
    title: 'Pay with UPI',
    body: `<div class="pay">
      <div class="upi-card">
        <div class="upi-to"><span class="upi-av" aria-hidden="true">${esc((payee || '?').trim()[0] || '?')}</span>
          <div><b>${esc(payee)}</b><span>${upi ? esc(upi) : 'Paid straight to the owner'}</span></div></div>
        <div class="upi-amt num">${money(amount)}</div>
      </div>
      <form id="pay-1" class="stack" novalidate>
        <div class="field"><label for="pay-ph">Mobile number linked to your UPI</label>
          <div class="pay-ph"><span>+91</span><input id="pay-ph" inputmode="numeric" autocomplete="tel-national" maxlength="10" value="${esc(ph)}" placeholder="98765 43210"></div></div>
        <button class="btn upi block" type="submit">Proceed to pay</button>
      </form>
      <form id="pay-2" class="stack" novalidate hidden>
        <p class="small">Enter the 6-digit code sent to <b id="pay-to"></b>. <button type="button" class="link" id="pay-edit">Change</button></p>
        <div class="field"><label for="pay-otp" class="sr">6-digit code</label>
          <div class="otp-wrap"><input id="pay-otp" class="pay-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-describedby="pay-hint">
          <div class="otp-boxes" aria-hidden="true">${'<span></span>'.repeat(6)}</div></div></div>
        <p class="notice small" id="pay-hint">Demo payment: no money is taken. Use the code <b>123456</b>.</p>
        <button class="btn upi block" type="submit" id="pay-go">Pay ${money(amount)}</button>
      </form>
      <div id="pay-done" class="pay-done" hidden aria-live="polite"><div class="pay-tick" aria-hidden="true">✓</div><b>Payment successful</b><span class="muted small" id="pay-ref"></span></div>
      <p class="err" id="pay-err" role="alert"></p></div>`,
  });
  const q = (sel) => s.el.querySelector(sel);
  const err = (m = '') => { q('#pay-err').textContent = m; };
  const boxes = () => { const v = q('#pay-otp').value; s.el.querySelectorAll('.otp-boxes span').forEach((b, i) => { b.textContent = v[i] ? '•' : ''; b.classList.toggle('on', i === v.length); }); };
  q('#pay-ph').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
  q('#pay-otp').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); err(); boxes(); });
  q('#pay-1').addEventListener('submit', (e) => {
    e.preventDefault(); const v = q('#pay-ph').value;
    if (!/^[6-9]\d{9}$/.test(v)) { err('Enter a 10-digit Indian mobile number.'); return; }
    err(); q('#pay-to').textContent = `+91 ${v.slice(0, 5)} ${v.slice(5)}`;
    q('#pay-1').hidden = true; q('#pay-2').hidden = false; q('#pay-otp').focus(); boxes();
  });
  q('#pay-edit').addEventListener('click', () => { q('#pay-2').hidden = true; q('#pay-1').hidden = false; q('#pay-ph').focus(); err(); });
  q('#pay-2').addEventListener('submit', async (e) => {
    e.preventDefault(); const otp = q('#pay-otp').value;
    if (otp.length !== 6) { err('Enter the 6-digit code.'); return; }
    const btn = q('#pay-go'); btn.disabled = true; btn.textContent = 'Paying…'; err();
    try {
      const res = await onPay({ phone: q('#pay-ph').value, otp });
      q('#pay-2').hidden = true; q('#pay-done').hidden = false; q('#pay-ref').textContent = res?.ref ? `UPI ref ${res.ref}` : '';
      setTimeout(() => { s.close(); res?.after?.(); }, 1100);
    } catch (x) { err(x.message); btn.disabled = false; btn.textContent = `Pay ${money(amount)}`; if (x.code === 'PAY_CODE') { q('#pay-otp').value = ''; boxes(); q('#pay-otp').focus(); } else if (!String(x.code || '').startsWith('PAY')) setTimeout(s.close, 1800); }
  });
  return s;
}

const hm = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const clock = hm;

// A live invoice: the clock ticks and the watermark moves, so a screenshot can't pass for a real token at the counter.
// rows: [[label, value], ...]; lines: [[text, amount], ...]
// Saves a file. Inside claude.ai the viewer confirms the save; elsewhere it is a normal browser download.
export async function saveFile(filename, blob) {
  if (window.claude?.use) {
    const dl = await window.claude.use('downloads').catch(() => null);
    if (dl) { try { await dl.save({ filename, data: blob }); return true; } catch (e) { if (e?.code === 'declined') return false; } }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

// slip: data for the downloadable receipt slip (see slip.js); code: the signed verification code.
export function liveInvoice({ title = 'Invoice', token, place, at, rows = [], lines = [], total, paid = true, expired = false, note = '', code = '', slip = null }) {
  const s = sheet({
    title,
    body: `<div class="inv ${expired ? 'expired' : ''}" aria-live="off">
      <div class="inv-mark" aria-hidden="true">${esc(token)}</div>
      <p class="inv-token">${esc(token)}</p>
      <p class="muted small">${esc(place)} · ${esc(when(at, { year: 'numeric', second: '2-digit' }))}</p>
      <dl class="inv-rows">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <ul class="inv-lines">${lines.map(([t, a]) => `<li><span>${esc(t)}</span><b class="num">${money(a)}</b></li>`).join('')}</ul>
      <div class="inv-total"><span>${paid ? 'Paid' : 'Total'}</span><b class="num">${money(total)}</b></div>
      ${note ? `<p class="muted small">${esc(note)}</p>` : ''}
      ${code ? `<div class="inv-code"><span>Verification code</span><b>${esc(code)}</b></div>` : ''}
      <p class="inv-live">${expired ? 'Token expired' : '<span class="dot" aria-hidden="true"></span>LIVE <span data-clock></span> · valid today only'}</p>
    </div>`,
    foot: `${slip ? '<button class="btn primary block" id="inv-dl">⬇ Download slip</button>' : ''}<button class="btn ${slip ? 'ghost' : 'primary'} block" data-close>Close</button>`,
  });
  s.el.querySelector('.sheet-foot [data-close]').addEventListener('click', s.close);
  s.el.querySelector('#inv-dl')?.addEventListener('click', async (e) => {
    const b = e.target; b.disabled = true; b.textContent = 'Making your slip…';
    try {
      const { drawSlip } = await import('./slip.js');
      const canvas = drawSlip({ ...slip, token, place, at, total, code, verifyUrl: new URL('../../verify/index.html', import.meta.url).href.replace(/^https?:\/\//, '') });
      const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
      const name = `UniHub-${place}-${token}-${new Date(new Date(at).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10)}.png`.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-');
      toast((await saveFile(name, blob)) ? 'Slip downloaded.' : 'Download cancelled.');
    } catch (x) { toast(`Couldn’t make the slip: ${x.message || x.code}`); }
    b.disabled = false; b.textContent = '⬇ Download slip';
  });
  const tick = () => { const c = s.el.querySelector('[data-clock]'); if (!c || !document.body.contains(c)) { clearInterval(t); return; } c.textContent = new Date().toLocaleTimeString('en-IN', { hour12: false }); };
  const t = setInterval(tick, 1000); tick();
  return s;
}

// Opens a printable bill (canteen and shop counters).
export function printBill({ place, token, at, rows = [], lines = [], total }) {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) { toast('Allow pop-ups to print the bill.'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Bill ${esc(token)}</title><style>
    body{font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;margin:24px;color:#000} h1{font-size:22px;text-align:center;margin:0} .tok{font-size:44px;text-align:center;font-weight:700;margin:12px 0}
    table{width:100%;border-collapse:collapse} td{padding:3px 0} td:last-child{text-align:right} hr{border:0;border-top:1px dashed #000;margin:10px 0} .tot td{font-weight:700;font-size:16px} p{text-align:center}
    @page{size:80mm auto;margin:6mm}</style></head><body>
    <h1>${esc(place)}</h1><div class="tok">${esc(token)}</div>
    <table>${[['Date', new Date(at).toLocaleDateString('en-IN')], ...rows].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table><hr>
    <table>${lines.map(([t, a]) => `<tr><td>${esc(t)}</td><td>₹${esc(a)}</td></tr>`).join('')}</table><hr>
    <table class="tot"><tr><td>Total (paid)</td><td>₹${esc(total)}</td></tr></table><p>Thank you!</p>
    <script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}
