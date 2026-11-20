import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retentionDays } from '../src/lib/security/retention';
test('metrics retention has no implicit policy; explicit bounded days required', () => {
  for (const value of [undefined, '0', '-1', 'NaN', '30.5', '999999']) assert.throws(() => retentionDays(value));
  assert.equal(retentionDays('30'), 30);
});
