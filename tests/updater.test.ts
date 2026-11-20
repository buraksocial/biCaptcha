import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyManifest, approvedURL, artifactValid, download } from '../scripts/updater-core';
test('signed updates reject unsigned, expired, downgrade, replay, incompatible and hostile URLs', async () => {
  const pair = generateKeyPairSync('ed25519');
  const config = { current: '2.0.1', schema: 1, origin: 'https://releases.example.com', key: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(), lastSequence: 4 };
  const m = { version: '2.0.2', sequence: 5, channel: 'stable', expires: new Date(Date.now()+60000).toISOString(), artifact: 'https://releases.example.com/app.oci.tar', sha256: 'a'.repeat(64), size: 100, schemaMin: 1, schemaMax: 1, security: true, breaking: false, imageRepository:'registry.example.com/bicaptcha/app', imagePlatform:'linux/amd64' };
  const envelope = (body: unknown) => { const payload = Buffer.from(JSON.stringify(body)).toString('base64url'); return { payload, signature: sign(null, Buffer.from(payload), pair.privateKey).toString('base64url') }; };
  assert.equal(verifyManifest(envelope(m), config).version, '2.0.2');
  assert.throws(() => verifyManifest({ ...envelope(m), signature: 'forged' }, config));
  assert.throws(() => verifyManifest(envelope(m), { ...config, key: generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString() }));
  for (const change of [{ expires: '2000-01-01' }, { version: '2.0.0' }, {version:'2.0.2;sh'}, { sequence: 4 }, { schemaMin: 2 }, {schemaMax:0}, {size:Infinity}, { artifact: 'https://evil.example/app' }, { artifact: 'https://releases.example.com/../secret' }, { artifact: 'https://releases.example.com/app;sh' }]) assert.throws(() => verifyManifest(envelope({ ...m, ...change }), config));
  assert.equal(artifactValid(Buffer.from('tampered'),m),false);
  for (const url of ['http://releases.example.com/app','https://127.0.0.1/app','https://user@releases.example.com/app','https://releases.example.com/%2e%2e/secret']) assert.throws(() => approvedURL(url, config.origin));
  await assert.rejects(download('https://releases.example.com/app',config.origin,100,async()=>[{address:'127.0.0.1',family:4}]));
});
