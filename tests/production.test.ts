import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { productionConfig } from '../src/lib/security/production';
import { redisState } from '../src/lib/security/state';
test('production requires durable stores, isolated ingress, mode, namespace and independent secrets', () => {
  const env:Record<string,string>={NODE_ENV:'production',BICAPTCHA_STATE:'redis',REDIS_URL:'redis://:redis-secret@redis:6379',DATABASE_URL:'postgresql://user:db-secret@postgres/bicaptcha',REDIS_PASSWORD:'redis-secret',POSTGRES_PASSWORD:'db-secret',BICAPTCHA_DEPLOYMENT_ID:'deployment-1',BICAPTCHA_MODE:'selfhost',BICAPTCHA_INGRESS:'isolated-tls',APP_ORIGIN:'https://captcha.example.com',JWT_SECRET:randomBytes(32).toString('hex'),BICAPTCHA_SECRET:randomBytes(32).toString('hex'),BICAPTCHA_VERIFY_SECRET:randomBytes(32).toString('hex')};
  assert.doesNotThrow(()=>productionConfig(env));
  for(const key of Object.keys(env).filter(k=>k!=='NODE_ENV')) { const broken={...env};delete broken[key];assert.throws(()=>productionConfig(broken),key); }
  assert.throws(()=>productionConfig({...env,BICAPTCHA_STATE:'memory'}));
  assert.throws(()=>productionConfig({...env,REDIS_PASSWORD:'incorrect'}));
  assert.throws(()=>productionConfig({...env,DATABASE_URL:'postgresql://db/bicaptcha'}));
});
test('blackholed Redis connection returns unavailable within bounded time', async () => {
  const sockets=new Set<import('node:net').Socket>();
  const server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  try {
    const port=(server.address() as import('node:net').AddressInfo).port;
    const state=redisState(`redis://127.0.0.1:${port}`,'test-deployment');
    const start=Date.now();await assert.rejects(state.consume('nonce','value'),/unavailable/);assert.ok(Date.now()-start<3500);
  } finally {for(const s of sockets)s.destroy();await new Promise<void>(r=>server.close(()=>r()));}
});
