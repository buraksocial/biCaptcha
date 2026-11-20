import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('distribution keeps user databases/secrets/vendor solvers outside Docker context and only ingress publishes ports', async()=>{
  const ignore=await readFile('.dockerignore','utf8');
  assert.ok(ignore.includes('**')&&ignore.includes('!src/**')&&!ignore.includes('!prisma/dev.db'));
  const compose=await readFile('compose.yaml','utf8');
  assert.match(compose,/ports: \["443:443"\]/);assert.doesNotMatch(compose,/ports: \[.*5432|ports: \[.*6379/);
  assert.match(compose,/internal: true/);assert.match(compose,/REDIS_PASSWORD/);
  const nginx=await readFile('deploy/nginx.conf','utf8');
  assert.match(nginx,/proxy_set_header X-Forwarded-For ""/);assert.match(nginx,/client_body_timeout/);assert.match(nginx,/ssl_protocols TLSv1\.2 TLSv1\.3/);
});
