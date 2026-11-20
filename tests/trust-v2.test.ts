import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { scope, deviceKey, proofMessage, validProof } from '../src/lib/security/trust-v2';
test('Trust v2 rejects wildcard scopes and binds every possession proof field', () => {
  assert.throws(() => scope([{ siteKey: 'site', action: '*', host: 'example.com' }]));
  const s = scope([{ siteKey: 'site', action: 'contact', host: 'example.com' }]);
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = deviceKey(pair.publicKey.export({ format: 'jwk' }));
  const p = { deployment: 'test', grant: 'grant', nonce: 'nonce', ...s[0] };
  const signature = sign('sha256', Buffer.from(proofMessage(p)), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  assert.equal(validProof(pub, p, signature), true);
  for (const field of ['deployment', 'grant', 'nonce', 'siteKey', 'action', 'host'] as const) assert.equal(validProof(pub, { ...p, [field]: 'other' }, signature), false);
  assert.throws(() => deviceKey({ ...pub, d: 'private' }));
});
