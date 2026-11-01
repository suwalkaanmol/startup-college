import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildPrintPdf } from '../src/pdfCut.js';

async function sample(n) { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([595, 842]); return d.save(); }
const count = async (b) => (await PDFDocument.load(b)).getPageCount();

test('cuts exactly the ordered range', async () => { assert.equal(await count(await buildPrintPdf(await sample(10), { from: 3, to: 5 })), 3); });
test('full document when no range', async () => { assert.equal(await count(await buildPrintPdf(await sample(4), {})), 4); });
test('copies repeat the range', async () => { assert.equal(await count(await buildPrintPdf(await sample(4), { from: 1, to: 2, copies: 3 })), 6); });
test('4-in-1 of 8 pages makes 2 sheets', async () => { assert.equal(await count(await buildPrintPdf(await sample(8), { layout: 4, arrangement: 'horizontal' })), 2); });
test('2-in-1 horizontal is landscape, vertical is portrait', async () => {
  const h = (await PDFDocument.load(await buildPrintPdf(await sample(2), { layout: 2, arrangement: 'horizontal' }))).getPage(0).getSize();
  const v = (await PDFDocument.load(await buildPrintPdf(await sample(2), { layout: 2, arrangement: 'vertical' }))).getPage(0).getSize();
  assert.ok(h.width > h.height); assert.ok(v.height > v.width);
});
test('several ranges are joined in order', async () => { assert.equal(await count(await buildPrintPdf(await sample(8), { ranges: [{ from: 2, to: 3 }, { from: 6, to: 6 }] })), 3); });
