// Check a receipt slip: type the verification code printed on it. Open to anyone, no sign-in.
import { $, esc, money, when, api, bar } from '../hub/web/kit.js';

bar({ section: 'admin', title: 'Check a receipt' });
const app = $('#app');
app.innerHTML = `<section class="hero admin" style="margin-top:8px"><h2>Is this slip genuine?</h2>
    <p>Type the verification code printed on a UniHub receipt slip. A real slip matches a paid order; an edited or made-up one doesn’t.</p></section>
  <form id="f" class="card stack" novalidate style="margin-top:16px;max-width:520px">
    <div class="field"><label for="code">Verification code</label><input id="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="7K2QF-9XM4B" style="font:700 22px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.08em"></div>
    <button class="btn primary block" type="submit">Check</button></form>
  <div id="out" style="margin-top:14px;max-width:520px"></div>`;
const status = { PLACED: 'Paid · being prepared', READY: 'Ready to collect', COMPLETED: 'Collected', COLLECTED: 'Collected', QUEUED: 'Paid · in the print queue', PRINTING: 'Printing', CANCELLED: 'Cancelled · refunded' };
async function check(code) {
  const out = $('#out'); out.innerHTML = '<p class="muted">Checking…</p>';
  try {
    const r = await api('/api/receipts/verify?code=' + encodeURIComponent(code));
    out.innerHTML = r.genuine
      ? `<div class="card stack verify-ok" style="gap:8px"><p class="verify-badge ok">✓ Genuine UniHub receipt</p>
          <div class="row between"><b style="font-size:18px">${esc(r.place)}</b><span class="token" style="font-size:30px">${esc(r.token)}</span></div>
          <p class="small muted">${esc(r.kind)} · ${esc(when(r.at, { year: 'numeric' }))} · UPI ref ${esc(r.ref)}</p>
          <ul class="list small">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
          <div class="row between"><b>Paid</b><b class="num" style="font-size:20px">${money(r.total)}</b></div>
          <p class="small"><b>Status now:</b> ${esc(status[r.status] || r.status)}</p></div>`
      : `<div class="card"><p class="verify-badge bad">✕ No order has this code</p><p class="small muted" style="margin-top:6px">Check each character. If it still doesn’t match, the slip isn’t a real UniHub receipt.</p></div>`;
  } catch (x) { out.innerHTML = `<p class="err">${esc(x.message)}</p>`; }
}
$('#f').addEventListener('submit', (e) => { e.preventDefault(); const c = $('#code').value.trim(); if (c) check(c); });
const pre = new URLSearchParams(location.search).get('code'); if (pre) { $('#code').value = pre; check(pre); }
