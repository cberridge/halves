// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePence, formatPence, computeShares, computeBalances, summarise, settlementShares } from '../js/money.js';

const A = 'alice';
const B = 'bob';
const M = [A, B];
const sum = (shares) => Object.values(shares).reduce((s, v) => s + v, 0);

test('parsePence handles common inputs', () => {
  assert.equal(parsePence('12.50'), 1250);
  assert.equal(parsePence('12.5'), 1250);
  assert.equal(parsePence('7'), 700);
  assert.equal(parsePence('£1,234.56'), 123456);
  assert.equal(parsePence('0.1'), 10);
  assert.equal(parsePence(' 3.07 '), 307);
  assert.ok(Number.isNaN(parsePence('abc')));
  assert.ok(Number.isNaN(parsePence('1.234')));
  assert.ok(Number.isNaN(parsePence('-5')));
  assert.ok(Number.isNaN(parsePence('')));
});

test('formatPence formats as GBP', () => {
  assert.equal(formatPence(1250), '£12.50');
  assert.equal(formatPence(123456), '£1,234.56');
});

test('equal split, even amount', () => {
  assert.deepEqual(computeShares(1000, A, M, { type: 'equal' }), { [A]: 500, [B]: 500 });
});

test('equal split, odd penny goes to the payer', () => {
  assert.deepEqual(computeShares(1001, A, M, { type: 'equal' }), { [A]: 501, [B]: 500 });
  assert.deepEqual(computeShares(1001, B, M, { type: 'equal' }), { [A]: 500, [B]: 501 });
});

test('percent split rounds and always sums to the total', () => {
  const s = computeShares(1000, A, M, { type: 'percent', percent: 60, uid: A });
  assert.deepEqual(s, { [A]: 600, [B]: 400 });
  for (const amount of [1, 3, 999, 12345]) {
    for (const pct of [0, 33.3, 50, 66.67, 100]) {
      assert.equal(sum(computeShares(amount, B, M, { type: 'percent', percent: pct, uid: B })), amount);
    }
  }
});

test('exact split gives the rest to the other person', () => {
  assert.deepEqual(computeShares(5000, B, M, { type: 'exact', pence: 1500, uid: A }), { [A]: 1500, [B]: 3500 });
});

test('invalid splits throw', () => {
  assert.throws(() => computeShares(0, A, M, { type: 'equal' }));
  assert.throws(() => computeShares(10.5, A, M, { type: 'equal' }));
  assert.throws(() => computeShares(100, 'carol', M, { type: 'equal' }));
  assert.throws(() => computeShares(100, A, M, { type: 'exact', pence: 101, uid: A }));
  assert.throws(() => computeShares(100, A, M, { type: 'percent', percent: 120, uid: A }));
});

test('balances: payer is owed the other share', () => {
  const entries = [{ amount: 1000, paidBy: A, shares: { [A]: 500, [B]: 500 } }];
  const bal = computeBalances(entries, M);
  assert.deepEqual(bal, { [A]: 500, [B]: -500 });
  assert.deepEqual(summarise(bal), { from: B, to: A, amount: 500 });
});

test('balances net out across several expenses and a settlement', () => {
  const entries = [
    { amount: 8640, paidBy: A, shares: computeShares(8640, A, M, { type: 'equal' }) }, // B owes 43.20
    { amount: 3150, paidBy: B, shares: computeShares(3150, B, M, { type: 'equal' }) }, // A owes 15.75
  ];
  let bal = computeBalances(entries, M);
  assert.equal(bal[A] + bal[B], 0);
  const s = summarise(bal);
  assert.deepEqual(s, { from: B, to: A, amount: 4320 - 1575 });

  entries.push({ amount: s.amount, ...settlementShares(s.from, s.to, s.amount) });
  bal = computeBalances(entries, M);
  assert.deepEqual(bal, { [A]: 0, [B]: 0 });
  assert.equal(summarise(bal), null);
});

test('overpaying a settlement flips who owes', () => {
  const entries = [
    { amount: 1000, paidBy: A, shares: { [A]: 500, [B]: 500 } },
    { amount: 800, ...settlementShares(B, A, 800) },
  ];
  assert.deepEqual(summarise(computeBalances(entries, M)), { from: A, to: B, amount: 300 });
});
