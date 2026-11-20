import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('generated third-party SDK propagates action to absolute API, omits cookies and has no Trust Pass oracle', async () => {
  const artifact = await readFile('public/bicaptcha.js', 'utf8');
  const listeners = new Set<string>();
  const requests: Array<{ url: URL; options: RequestInit; body: Record<string, unknown> }> = [];
  const browser: { BiCaptcha?: Window['BiCaptcha']; addEventListener: (name: string) => void; removeEventListener: (name: string) => void } = {
    addEventListener: name => { listeners.add(name); }, removeEventListener: name => { listeners.delete(name); },
  };
  const fakeCrypto = { subtle: { digest: async () => new Uint8Array(32).buffer } }; // PoW unit stub, server PoW is separately tested.
  runInNewContext(artifact, {
    window: browser, URL, TextEncoder, AbortController, AbortSignal, setTimeout, performance,
    navigator: { webdriver: true }, crypto: fakeCrypto,
    fetch: async (url: URL, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      requests.push({ url, options, body });
      return Response.json(requests.length === 1 ? { challenge: 'signed-test-challenge', difficulty: 4 } : { success: true, token: 'token' });
    },
  });
  assert.throws(() => browser.BiCaptcha!.init('site', { action: 'contact', apiBase: 'http://api.example.com' }));
  const client = browser.BiCaptcha!.init('site', { action: 'contact', apiBase: 'https://api.example.com' });
  let token = '';
  await client.execute(value => { token = value; });
  assert.equal(token, 'token');
  assert.equal(requests.length, 2);
  for (const { url, options, body } of requests) {
    assert.equal(url.origin, 'https://api.example.com');
    assert.equal(url.searchParams.get('siteKey'), 'site');
    assert.equal(options.credentials, 'omit');
    assert.equal(body.action, 'contact');
  }
  assert.ok(!artifact.includes('SIGN_CHALLENGE') && !artifact.includes('BI_CAPTCHA_TRUST_PASS') && !listeners.has('message'));
  client.destroy();
  assert.equal(listeners.size, 0);
});
