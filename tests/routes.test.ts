import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST as registerPass } from '../src/app/api/bi-captcha/register-pass/route';
import { POST as verify } from '../src/app/api/bi-captcha/verify/route';
import { POST as siteverify } from '../src/app/api/bi-captcha/siteverify/route';
import { csrf } from '../src/lib/security/http';
import { createCredential, credentialMatches } from '../src/lib/security/credentials';

test('Trust Pass enrollment is gone even for malformed bodies', async () => {
  const response = await registerPass(new Request('https://api.example.com', { method: 'POST', body: '{' }));
  assert.equal(response.status, 410);
  assert.equal((await response.json()).success, false);
});
test('verify and siteverify fail closed with no configured state/secrets', async () => {
  for (const handler of [verify, siteverify]) {
    const response = await handler(new Request('https://api.example.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
});
test('cookie mutations require exact configured Origin; fetch metadata cannot override it', () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://dashboard.example.com';
  try {
    assert.throws(() => csrf(new Request('https://dashboard.example.com')));
    assert.throws(() => csrf(new Request('https://dashboard.example.com', { headers: { origin: 'https://evil.example.com' } })));
    assert.throws(() => csrf(new Request('https://dashboard.example.com', { headers: { origin: 'https://dashboard.example.com', 'sec-fetch-site': 'cross-site' } })));
    assert.doesNotThrow(() => csrf(new Request('https://dashboard.example.com', { headers: { origin: 'https://dashboard.example.com' } })));
  } finally { if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous; }
});
test('per-site credentials are random, hashed, rotatable, and legacy secrets fail', () => {
  const a = createCredential(), b = createCredential();
  assert.notEqual(a.secret, b.secret);
  assert.notEqual(a.secret, a.hash);
  assert.equal(credentialMatches(a.secret, a.hash), true);
  assert.equal(credentialMatches(a.secret, b.hash), false);
  assert.equal(credentialMatches('sec_old-secret', a.hash), false);
  assert.equal(credentialMatches(a.secret, null), false);
});
