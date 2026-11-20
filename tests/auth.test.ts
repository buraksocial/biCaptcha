import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authInput, sessionCookie } from '../src/lib/security/auth';

test('auth inputs normalize email and bound bcrypt byte length before hashing', () => {
  assert.equal(authInput({ email: ' Person@Example.COM ', password: 'long-enough-password' }).email, 'person@example.com');
  for (const value of [{ email: 'bad', password: 'long-enough-password' }, { email: 'a@example.com', password: 'short' }, { email: 'a@example.com', password: 'ü'.repeat(37) }, { email: [], password: 'long-enough-password' }]) assert.throws(() => authInput(value));
});
test('login/logout cookies share path and security flags', () => {
  const options = sessionCookie();
  assert.equal(options.path, '/');
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.maxAge, 3600);
});
