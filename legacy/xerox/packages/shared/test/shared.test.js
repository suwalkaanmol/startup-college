import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetsForFile, calcOrder, validateRange, tokenLetter, formatToken, isShopOpen } from '../src/index.js';

const f = (o) => ({ name: 'a.pdf', pages: 10, color: 'bw', sides: 'single', layout: 1, copies: 1, spiral: false, ...o });

test('4-in-1 of 8 pages is 2 faces, same as a plain 2-page print', () => {
  assert.equal(sheetsForFile(f({ pages: 8, layout: 4 })), 2);
});
test('double-sided rounds sheets up', () => {
  assert.equal(sheetsForFile(f({ pages: 5, sides: 'double' })), 3);
});
test('manual range and copies', () => {
  assert.equal(sheetsForFile(f({ from: 3, to: 6, copies: 3 })), 12);
});
test('mixed order with spiral', () => {
  const r = calcOrder([f({ pages: 4, sides: 'double' }), f({ pages: 3, color: 'color', spiral: true })]);
  assert.equal(r.bwCost, 2 * 3);
  assert.equal(r.colorCost, 3 * 10);
  assert.equal(r.spiralCost, 30);
  assert.equal(r.total, 66);
});
test('sheets are totalled per type across files', () => {
  const r = calcOrder([f({ pages: 2 }), f({ pages: 3 })]);
  assert.equal(r.sheets.bw.single, 5);
  assert.equal(r.total, 10);
});
test('range validation', () => {
  assert.equal(validateRange(2, 5, 10), null);
  assert.ok(validateRange(0, 5, 10));
  assert.ok(validateRange(6, 5, 10));
  assert.ok(validateRange(1, 11, 10));
  assert.ok(validateRange(1.5, 3, 10));
});
test('token letter advances daily and wraps after Z', () => {
  assert.equal(tokenLetter('2026-11-01', '2026-11-01'), 'A');
  assert.equal(tokenLetter('2026-11-02', '2026-11-01'), 'B');
  assert.equal(tokenLetter('2026-11-27', '2026-11-01'), 'A');
  assert.equal(formatToken('B', 7), 'B7');
});
const shop = { override: null, closedDate: null, openTime: '09:00', closeTime: '18:00' };
test('open/closed by hours (IST)', () => {
  assert.equal(isShopOpen(shop, new Date('2026-10-27T05:00:00Z')), true);
  assert.equal(isShopOpen(shop, new Date('2026-10-27T14:00:00Z')), false);
});
test('override and closed-today beat hours', () => {
  const noon = new Date('2026-10-27T06:30:00Z');
  assert.equal(isShopOpen({ ...shop, override: 'closed' }, noon), false);
  assert.equal(isShopOpen({ ...shop, closedDate: '2026-10-27' }, noon), false);
  assert.equal(isShopOpen({ ...shop, override: 'open', closedDate: '2026-10-27' }, noon), true);
});
test('overnight hours', () => {
  const s = { ...shop, openTime: '20:00', closeTime: '02:00' };
  assert.equal(isShopOpen(s, new Date('2026-10-27T19:00:00Z')), true);
  assert.equal(isShopOpen(s, new Date('2026-10-27T06:00:00Z')), false);
});
test('several ranges are summed', () => { assert.equal(sheetsForFile(f({ pages: 40, ranges: [{ from: 4, to: 20 }, { from: 30, to: 35 }] })), 23); });
