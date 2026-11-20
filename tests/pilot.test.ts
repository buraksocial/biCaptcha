import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodPrice, consent } from '../src/lib/security/ledger';
test('Cloud accounting uses integer microUSD, consent and period-end rounding', () => {
  assert.equal(periodPrice(100000n).microUSD, 19990000n);
  assert.equal(periodPrice(100001n).microUSD, 19990990n);
  assert.equal(periodPrice(100006n).cents, 2000n);
  assert.throws(() => consent(true, 0));
  assert.throws(() => consent(true, 20000000.5));
  assert.deepEqual(consent(false, 0), { enabled: false, cap: 0 });
});
