import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, findingsCsv } from '../src/export.js';

test('CSV treats directory formulas as text while preserving quotes and newlines', () => {
  for (const value of ['=1+1', '+1', '-1', '@SUM(1)', ' =1', '\tformula', '\rformula', '\nformula']) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('Normal "group"'), '"Normal ""group"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
});

test('even an empty findings export records incomplete evidence and a withheld score', () => {
  const csv = findingsCsv([], { complete: false, score: null, available: 5, total: 27, snapshotAt: '2026-10-20T12:00:00Z' });
  assert.match(csv, /Incomplete; score withheld/); assert.match(csv, /MFA enforcement is unknown/);
  assert.equal(csv.split('\r\n').length, 2); assert.ok(!csv.includes('"100"'));
});
