// Lays out the chosen pages N-in-1 on A4 or A3 sheets, for the student's preview and for the shop's print.
// The same code draws both, so what the student previews is what the shop prints.
import { openPdf } from './pdf.js';
import { esc } from './kit.js';

const SIZE = { A4: [210, 297], A3: [297, 420] }; // mm, portrait
// cols × rows per side; horizontal = side by side (row by row), vertical = top to bottom (column by column)
export function grid(nup, arrangement = 'horizontal') {
  const h = arrangement !== 'vertical';
  return ({
    1: { cols: 1, rows: 1, landscape: false },
    2: h ? { cols: 2, rows: 1, landscape: true } : { cols: 1, rows: 2, landscape: false },
    3: h ? { cols: 3, rows: 1, landscape: true } : { cols: 1, rows: 3, landscape: false },
    4: { cols: 2, rows: 2, landscape: false, colMajor: !h },
    6: h ? { cols: 3, rows: 2, landscape: true } : { cols: 2, rows: 3, landscape: false, colMajor: true },
  })[nup] || { cols: 1, rows: 1, landscape: false };
}
export function pageList(ranges) { return ranges.flatMap((r) => Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i)); }
export function sheetSize(size, nup, arrangement) { const [w, h] = SIZE[size] || SIZE.A4; return grid(nup, arrangement).landscape ? [h, w] : [w, h]; }

// Returns a function (n) -> canvas | null that draws page n of the file at the given pixel width.
export async function pageSource(file) {
  if (file.kind === 'pdf') {
    const doc = await openPdf(file.bytes);
    return async (n, px) => {
      if (n < 1 || n > doc.numPages) return null;
      const pg = await doc.getPage(n); const v1 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: px / v1.width });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise; return c;
    };
  }
  if (file.kind === 'image') {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(new Blob([file.bytes], { type: file.mime || 'image/png' })); });
    return async (n, px) => { if (n !== 1) return null; const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * img.height / img.width); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; };
  }
  return null; // Word and PowerPoint: the shop opens the file itself
}

// Draws one sheet (a canvas) with its pages placed in the grid.
async function drawSheet(src, pages, opt, pxWidth) {
  const g = grid(opt.nup, opt.arrangement); const [wmm, hmm] = sheetSize(opt.size, opt.nup, opt.arrangement);
  const W = pxWidth, H = Math.round(pxWidth * hmm / wmm), pad = Math.round(W * 0.03), gap = Math.round(W * 0.015);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const cw = (W - pad * 2 - gap * (g.cols - 1)) / g.cols, ch = (H - pad * 2 - gap * (g.rows - 1)) / g.rows;
  for (let i = 0; i < pages.length; i++) {
    const col = g.colMajor ? Math.floor(i / g.rows) : i % g.cols, row = g.colMajor ? i % g.rows : Math.floor(i / g.cols);
    const x = pad + col * (cw + gap), y = pad + row * (ch + gap);
    const p = src ? await src(pages[i], Math.round(cw * 1.5)) : null;
    if (p) { const s = Math.min(cw / p.width, ch / p.height); const dw = p.width * s, dh = p.height * s; ctx.drawImage(p, x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh); ctx.strokeStyle = '#d0d0d0'; ctx.strokeRect(x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh); }
    else { ctx.strokeStyle = '#9aa'; ctx.setLineDash([6, 4]); ctx.strokeRect(x, y, cw, ch); ctx.setLineDash([]); ctx.fillStyle = '#566'; ctx.font = `${Math.round(Math.min(cw, ch) / 6)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(`Page ${pages[i]}`, x + cw / 2, y + ch / 2); }
  }
  if (opt.color === 'bw') { const d = ctx.getImageData(0, 0, W, H); const a = d.data; for (let k = 0; k < a.length; k += 4) { const l = a[k] * 0.3 + a[k + 1] * 0.59 + a[k + 2] * 0.11; a[k] = a[k + 1] = a[k + 2] = l; } ctx.putImageData(d, 0, 0); }
  return c;
}

// Returns canvases for the sheet faces (up to max) for one file's options.
export async function buildSheets(file, opt, { pxWidth = 360, max = 12 } = {}) {
  const src = await pageSource(file);
  const pages = pageList(opt.ranges); const faces = [];
  for (let i = 0; i < pages.length && faces.length < max; i += opt.nup) faces.push(await drawSheet(src, pages.slice(i, i + opt.nup), opt, pxWidth));
  return { faces, total: Math.ceil(pages.length / opt.nup), rendered: Boolean(src) };
}

// Opens a print window with every sheet face at print size; the shop prints it with the settings shown.
export async function printSheets(file, opt, label) {
  const w = window.open('', '_blank'); if (!w) throw new Error('Allow pop-ups to print.');
  w.document.write('<!doctype html><title>Preparing print…</title><p style="font:16px sans-serif;margin:30px">Preparing pages for printing…</p>');
  const { faces } = await buildSheets(file, opt, { pxWidth: opt.size === 'A3' ? 2200 : 1600, max: 2000 });
  const [wmm, hmm] = sheetSize(opt.size, opt.nup, opt.arrangement);
  const imgs = faces.map((c) => `<img src="${c.toDataURL('image/jpeg', 0.92)}">`).join('');
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(label)}</title><style>
    @page { size: ${wmm}mm ${hmm}mm; margin: 0 } html,body{margin:0;background:#888}
    img{display:block;width:${wmm}mm;height:${hmm}mm;page-break-after:always;background:#fff;margin:0 auto 8px} @media print{body{background:#fff} img{margin:0}}
    .bar{font:14px sans-serif;background:#111;color:#fff;padding:10px 14px;position:sticky;top:0} @media print{.bar{display:none}}</style></head>
    <body><div class="bar">${esc(label)}. Printer settings: ${opt.size} · ${opt.color === 'bw' ? 'black & white' : 'colour'} · ${opt.sides === 'double' ? 'both sides (flip on long edge)' : 'one side'} · ${opt.copies} cop${opt.copies === 1 ? 'y' : 'ies'} · 1 page per sheet (already arranged)</div>${imgs}
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
  w.document.close();
}
