// Draws a receipt slip (PNG) for a paid Food or Xerox order: torn paper edges, a PAID stamp,
// the payment reference and a verification code the server signed, which anyone can check at /verify/.
const W = 640, PAD = 44;
const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const MONO = '"DejaVu Sans Mono", ui-monospace, Menlo, Consolas, monospace';

function wrap(ctx, text, max) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}

// d: { kind, place, placeLine, token, at, rows: [[k, v]], lines: [[text, amount]], total, payment, status, code, verifyUrl }
export function drawSlip(d) {
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  // Lay out once to measure the height, then draw for real.
  const ops = []; let y = 0;
  const text = (s, { size = 22, weight = 400, align = 'left', color = '#1b1b1b', font = MONO, x } = {}) => { const yy = y; ops.push(() => { ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x ?? (align === 'center' ? W / 2 : align === 'right' ? W - PAD : PAD), yy); }); };
  const line = (h) => { y += h; };
  const pair = (k, v, o = {}) => { const yy = y; ops.push(() => { ctx.font = `${o.weight || 400} ${o.size || 21}px ${MONO}`; ctx.fillStyle = o.color || '#1b1b1b'; ctx.textAlign = 'left'; ctx.fillText(k, PAD, yy); ctx.textAlign = 'right'; ctx.fillText(v, W - PAD, yy); }); };
  const dash = () => { const yy = y; ops.push(() => { ctx.strokeStyle = '#555'; ctx.setLineDash([7, 6]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, yy); ctx.lineTo(W - PAD, yy); ctx.stroke(); ctx.setLineDash([]); }); };

  ctx.font = `400 21px ${MONO}`;
  line(78); text('UNIHUB · VIT VELLORE', { size: 18, align: 'center', color: '#666', weight: 700 });
  line(46); text(d.place, { size: 36, weight: 800, align: 'center' });
  if (d.placeLine) { line(32); text(d.placeLine, { size: 18, align: 'center', color: '#555' }); }
  line(30); text(`${d.kind === 'xerox' ? 'PRINT' : 'FOOD'} ORDER · PAYMENT RECEIPT`, { size: 18, align: 'center', color: '#444', weight: 700 });
  line(26); dash();
  line(46); text('TOKEN', { size: 18, align: 'center', color: '#666', weight: 700 });
  line(84); text(d.token, { size: 92, weight: 800, align: 'center' });
  line(24); dash();
  for (const [k, v] of d.rows) { line(34); pair(k, v); }
  line(24); dash();
  ctx.font = `400 21px ${MONO}`;
  for (const [t, a] of d.lines) {
    const ls = wrap(ctx, t, W - PAD * 2 - 120);
    ls.forEach((l, i) => { line(32); if (i === ls.length - 1) pair(l, money(a)); else text(l, { size: 21 }); });
  }
  line(26); dash();
  line(48); pair('TOTAL PAID', money(d.total), { size: 30, weight: 800 });
  line(36); pair('Paid by', d.payment?.method === 'UPI' ? `UPI ${d.payment.phone || ''}` : 'Online');
  if (d.payment?.payeeUpi || d.payment?.payee) { line(32); pair('Paid to', d.payment.payeeUpi || d.payment.payee); }
  if (d.payment?.ref) { line(32); pair('UPI ref', d.payment.ref); }
  if (d.payment?.paidAt) { line(32); pair('Paid at', new Date(d.payment.paidAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })); }
  line(32); pair('Status', d.status);
  const stampY = y - 120;
  line(26); dash();
  line(42); text('VERIFICATION CODE', { size: 18, align: 'center', color: '#666', weight: 700 });
  line(54); text(d.code || '—', { size: 44, weight: 800, align: 'center' });
  const fpY = y + 22; line(22 + 72);
  line(34); text('Check this slip at', { size: 17, align: 'center', color: '#444' });
  ctx.font = `700 16px ${MONO}`;
  for (const l of wrap(ctx, d.verifyUrl.replace(/\//g, '/ ').trim(), W - PAD * 2)) { line(26); text(l.replace(/\/ /g, '/'), { size: 16, align: 'center', color: '#222', weight: 700 }); }
  line(28); text('A slip is genuine only if this code matches the order there.', { size: 16, align: 'center', color: '#666' });
  if (d.payment?.demo) { line(28); text('Demo payment: no money was taken.', { size: 16, align: 'center', color: '#a15c07' }); }
  line(34); text(`Slip made ${new Date().toLocaleString('en-IN')}`, { size: 15, align: 'center', color: '#888' });
  line(70);
  const H = Math.ceil(y);

  c.width = W; c.height = H;
  // Paper with torn (zigzag) top and bottom edges.
  ctx.fillStyle = '#e9e5dc'; ctx.fillRect(0, 0, W, H);
  ctx.beginPath(); ctx.moveTo(0, 14);
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, x / 16 % 2 ? 2 : 14);
  ctx.lineTo(W, H - 14);
  for (let x = W; x >= 0; x -= 16) ctx.lineTo(x, x / 16 % 2 ? H - 2 : H - 14);
  ctx.closePath(); ctx.fillStyle = '#fffdf6'; ctx.fill();
  // Faint repeated security text across the paper.
  ctx.save(); ctx.globalAlpha = 0.05; ctx.fillStyle = '#000'; ctx.font = `700 15px ${MONO}`; ctx.translate(W / 2, H / 2); ctx.rotate(-0.42);
  for (let yy = -H; yy < H; yy += 44) for (let xx = -W; xx < W; xx += 250) ctx.fillText(`UNIHUB ${d.code || ''}`, xx + (yy / 44 % 2 ? 120 : 0), yy);
  ctx.restore();
  for (const op of ops) op();

  // Fingerprint strip from the code: changes completely if the code changes.
  const bits = [...(d.code || '').replace('-', '')].map((ch) => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.indexOf(ch)).flatMap((n) => [n & 1, n & 2, n & 4, n & 8, n & 16].map(Boolean));
  const cols = 25, rows = 2, cell = 18, gx = (W - cols * cell) / 2;
  bits.forEach((on, i) => { const cx = gx + (i % cols) * cell, cy = fpY + Math.floor(i / cols) * cell; ctx.fillStyle = on ? '#1b1b1b' : '#d8d4ca'; ctx.fillRect(cx + 2, cy + 2, cell - 4, cell - 4); });

  // PAID stamp.
  ctx.save(); ctx.translate(W - 150, stampY); ctx.rotate(-0.28); ctx.globalAlpha = 0.6;
  const ink = d.status === 'Cancelled · refunded' ? '#b42335' : '#12795a';
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 78, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'center'; ctx.font = `900 38px ${MONO}`; ctx.fillText(d.status === 'Cancelled · refunded' ? 'REFUND' : 'PAID', 0, 13);
  ctx.font = `700 13px ${MONO}`; ctx.fillText('UNIHUB · UPI', 0, -32); ctx.fillText(new Date(d.payment?.paidAt || d.at).toLocaleDateString('en-IN'), 0, 44);
  ctx.restore();
  return c;
}
