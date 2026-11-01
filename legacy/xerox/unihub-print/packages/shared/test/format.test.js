import test from 'node:test';
import assert from 'node:assert/strict';
import { plural, formatTime } from '../src/format.js';
test('plural', () => { assert.equal(plural(1, 'page'), '1 page'); assert.equal(plural(13, 'page'), '13 pages'); });
test('time uses AM/PM', () => { assert.match(formatTime(new Date('2026-10-28T06:39:00Z')), /^\d{1,2}:\d{2} (AM|PM)$/); });
