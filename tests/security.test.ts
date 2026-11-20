import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { CaptchaService, type CaptchaSite } from '../src/lib/security/captcha';
import { MemoryState, getState } from '../src/lib/security/state';
import { canonicalDomain, sourceOrigin, domainMatches, txtMatches } from '../src/lib/security/domain';
import { readJson } from '../src/lib/security/http';
import { signingKey } from '../src/lib/security/config';
import { SignJWT } from 'jose';

const site: CaptchaSite = { id: 'site-id', siteKey: 'bicaptcha_test', domain: 'example.com', isVerified: true };
const context = { siteKey: site.siteKey, action: 'contact', host: 'www.example.com' };
const key = new TextEncoder().encode('a'.repeat(64));
function setup(now = { value: Date.now() }) {
  const state = new MemoryState(() => now.value);
  const service = new CaptchaService({ state, findSite: async (k) => k === site.siteKey ? site : null,
    challengeKey: key, tokenKey: new TextEncoder().encode('b'.repeat(64)), now: () => now.value, difficulty: 1 });
  return { state, service, now };
}
function solve(challenge: string, difficulty: number) {
  for (let nonce = 0; nonce < 100000; nonce++) {
    if (createHash('sha256').update(`${challenge}:${nonce}`).digest('hex').startsWith('0'.repeat(difficulty))) return String(nonce);
  }
  throw Error('unsolved');
}
async function verified(service: CaptchaService) {
  const c = await service.challenge(context);
  return service.verify({ ...context, challenge: c.challenge, nonce: solve(c.challenge, c.difficulty), telemetry: {} });
}

test('only one concurrent challenge replay succeeds, even with forged advisory telemetry', async () => {
  const { service } = setup();
  const c = await service.challenge(context);
  const request = { ...context, challenge: c.challenge, nonce: solve(c.challenge, c.difficulty), telemetry: { webdriver: true } };
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => service.verify(request)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
test('site/action/host mismatches do not consume a valid challenge', async () => {
  const { service } = setup();
  const c = await service.challenge(context);
  const request = { ...context, challenge: c.challenge, nonce: solve(c.challenge, c.difficulty), telemetry: {} };
  for (const change of [{ siteKey: 'other' }, { action: 'login' }, { host: 'example.com' }]) {
    await assert.rejects(service.verify({ ...request, ...change }));
  }
  assert.ok((await service.verify(request)).token);
});
test('parallel token consume succeeds exactly once; context mismatch does not burn it', async () => {
  const { service } = setup();
  const { token } = await verified(service);
  await assert.rejects(service.consume(token, { ...context, action: 'login' }));
  await assert.rejects(service.consume(token, { ...context, siteKey: 'other' }));
  await assert.rejects(service.consume(token, { ...context, host: 'example.com' }));
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => service.consume(token, context)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
test('expired challenge and success token fail', async () => {
  const { service, now } = setup();
  const c = await service.challenge(context);
  const { token } = await verified(service);
  now.value += 121000;
  await assert.rejects(service.consume(token, context));
  await assert.rejects(service.verify({ ...context, challenge: c.challenge, nonce: solve(c.challenge, c.difficulty), telemetry: {} }));
});
test('unverified/unknown sites and unrelated hosts cannot get a challenge', async () => {
  const { service } = setup();
  await assert.rejects(service.challenge({ ...context, siteKey: 'unknown' }));
  await assert.rejects(service.challenge({ ...context, host: 'evil-example.com' }));
  const unverified = new CaptchaService({ state: new MemoryState(), findSite: async () => ({ ...site, isVerified: false }), challengeKey: key, tokenKey: key });
  await assert.rejects(unverified.challenge(context));
});
test('invalid PoW, legacy encrypted payload and oversized telemetry fail', async () => {
  const { service } = setup();
  const c = await service.challenge(context);
  const request = { ...context, challenge: c.challenge, nonce: solve(c.challenge, c.difficulty), telemetry: {} };
  await assert.rejects(service.verify({ ...request, nonce: '-1' }));
  await assert.rejects(service.verify({ ...request, telemetry: { movement: Array(1000).fill(1) } }));
  await assert.rejects(service.verify({ ...request, telemetry: { duration: Infinity } }));
  await assert.rejects(service.verify({ ...request, data: 'legacy' }));
  assert.ok((await service.verify(request)).token);
});
test('state atomically consumes, expires, and rate limits without blanket clearing', async () => {
  let now = 0;
  const state = new MemoryState(() => now);
  assert.equal(await state.putIfAbsent('x', 'value', 1), true);
  assert.equal(await state.putIfAbsent('x', 'value', 1), false);
  const results = await Promise.all(Array.from({ length: 20 }, () => state.consume('x', 'value')));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await state.limit('account', 1, 60), true);
  assert.equal(await state.limit('account', 1, 60), false);
  now = 61000;
  assert.equal(await state.limit('account', 1, 60), true);
});
test('strict DNS policy handles IDN, private suffixes, boundaries and exact TXT', () => {
  assert.equal(canonicalDomain('EXAMPLE.COM.'), 'example.com');
  assert.equal(canonicalDomain('bücher.de'), 'xn--bcher-kva.de');
  for (const input of ['com', 'co.uk', 'github.io', '127.0.0.1', 'localhost', 'example.com:443', 'https://example.com', 'a..com', 'example.com..']) assert.throws(() => canonicalDomain(input));
  assert.equal(domainMatches('a.example.com', 'example.com'), true);
  assert.equal(domainMatches('evil-example.com', 'example.com'), false);
  assert.equal(sourceOrigin('https://www.example.com').host, 'www.example.com');
  for (const origin of ['http://example.com', 'https://example.com:8443', 'https://example.com/path', 'null']) assert.throws(() => sourceOrigin(origin));
  assert.equal(txtMatches([['prefix-bicaptcha-verification=key-suffix']], 'key'), false);
  assert.equal(txtMatches([['bicaptcha-verification=', 'key']], 'key'), true);
});
test('bounded JSON rejects malformed, oversized and wrong content-type bodies', async () => {
  await assert.rejects(readJson(new Request('https://api.example.com', { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } })));
  await assert.rejects(readJson(new Request('https://api.example.com', { method: 'POST', body: 'x'.repeat(100), headers: { 'content-type': 'application/json' } }), 10));
  await assert.rejects(readJson(new Request('https://api.example.com', { method: 'POST', body: '{}' })));
});
test('missing/default secrets and production memory state fail closed', () => {
  assert.throws(() => signingKey('JWT_SECRET', {}));
  assert.throws(() => signingKey('JWT_SECRET', { JWT_SECRET: 'bi-captcha-super-secret-jwt-key' }));
  assert.throws(() => getState({ NODE_ENV: 'production', BICAPTCHA_STATE: 'memory' }));
  assert.throws(() => getState({ NODE_ENV: 'development' }));
});
test('legacy/default-key tokens and malformed signatures cannot mint or consume state', async () => {
  const { service } = setup();
  const legacy = await new SignJWT({ siteKey: site.siteKey, verified: true })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m')
    .sign(new TextEncoder().encode('another-super-secret-key-32-chars-long'));
  await assert.rejects(service.consume(legacy, context));
  const c = await service.challenge(context);
  const segments = c.challenge.split('.');
  segments[1] = Buffer.from(JSON.stringify({ ...context, verified: true })).toString('base64url');
  await assert.rejects(service.verify({ ...context, challenge: segments.join('.'), nonce: '0', telemetry: {} }));
  assert.ok((await service.verify({ ...context, challenge: c.challenge, nonce: solve(c.challenge, c.difficulty), telemetry: {} })).token);
});
test('state capacity fails closed without deleting live replay state', async () => {
  const state = new MemoryState(() => 0, 2);
  await state.putIfAbsent('a', 'value', 100);
  await state.putIfAbsent('b', 'value', 100);
  await assert.rejects(state.putIfAbsent('c', 'value', 100));
  assert.equal(await state.consume('a', 'value'), true);
  assert.equal(await state.consume('a', 'value'), false);
  assert.equal(await state.consume('b', 'wrong-value'), false);
  assert.equal(await state.consume('b', 'value'), true);
});
test('signing keys must be distinct after hex decoding, not just text comparison', () => {
  const secret = '0123456789abcdef'.repeat(4);
  assert.throws(() => signingKey('JWT_SECRET', { JWT_SECRET: secret, BICAPTCHA_SECRET: secret.toUpperCase() }));
});
