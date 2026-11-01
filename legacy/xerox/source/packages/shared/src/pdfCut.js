// Cuts the ordered page range and lays out N-in-1 sheets exactly as ordered.
import { PDFDocument } from 'pdf-lib';
import { GRID } from './layout.js';
const A4 = [595.28, 841.89];

/** Returns PDF bytes with pages from..to (1-based, inclusive) placed `layout` per face, repeated `copies` times. */
export async function buildPrintPdf(bytes, { from, to, ranges, layout = 1, arrangement = 'horizontal', copies = 1 }) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  // Several ranges (e.g. 4-20 and 30-35) are printed one after the other, in the order given.
  const rs = ranges?.length ? ranges : [{ from: from ?? 1, to: to ?? src.getPageCount() }];
  const idx = rs.flatMap((r) => Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from - 1 + i));
  const out = await PDFDocument.create();
  const all = Array.from({ length: copies }, () => idx).flat();
  if (layout === 1) { (await out.copyPages(src, all)).forEach((p) => out.addPage(p)); return out.save(); }
  const [cols, rows] = GRID[arrangement][layout];
  const [w, h] = cols > rows ? [A4[1], A4[0]] : A4, cw = w / cols, ch = h / rows;
  // pdf-lib cannot embed pages without a content stream (truly blank pages); those stay as empty cells.
  const byIndex = new Map();
  for (const n of new Set(all)) byIndex.set(n, src.getPage(n).node.Contents() ? (await out.embedPdf(src, [n]))[0] : null);
  for (let i = 0; i < all.length; i += layout) {
    const sheet = out.addPage([w, h]);
    all.slice(i, i + layout).forEach((n, k) => {
      const pg = byIndex.get(n); if (!pg) return;
      const s = Math.min(cw / pg.width, ch / pg.height) * 0.95;
      // horizontal fills rows left-to-right; vertical fills columns top-to-bottom
      const c = arrangement === 'horizontal' ? k % cols : Math.floor(k / rows), r = arrangement === 'horizontal' ? Math.floor(k / cols) : k % rows;
      sheet.drawPage(pg, { x: c * cw + (cw - pg.width * s) / 2, y: h - (r + 1) * ch + (ch - pg.height * s) / 2, xScale: s, yScale: s });
    });
  }
  return out.save();
}

/** Wraps a PNG/JPG in a one-page PDF (page = image size) so images are cut and laid out like documents. */
export async function imageToPdf(bytes, name) {
  const doc = await PDFDocument.create();
  const img = /\.png$/i.test(name) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  doc.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return doc.save();
}
