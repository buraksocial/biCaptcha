import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from 'redis';
import { RedisState } from '../src/lib/security/redis-state';

test('Redis state performs atomic consumption and fixed-window limits across clients', async () => {
  await mkdir('/tmp/opencode', { recursive: true });
  const directory = await mkdtemp('/tmp/opencode/bicaptcha-redis-');
  const path = join(directory, 'redis.sock');
  const server = spawn('redis-server', ['--port', '0', '--unixsocket', path, '--unixsocketperm', '700', '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  let spawnError: Error | undefined;
  server.on('error', e => { spawnError = e; });
  const a = createClient({ socket: { path, reconnectStrategy: false } });
  const b = createClient({ socket: { path, reconnectStrategy: false } });
  a.on('error', () => {}); b.on('error', () => {});
  try {
    let connected = false;
    for (let i = 0; i < 100 && !connected; i++) {
      if (spawnError) throw spawnError;
      try { await a.connect(); connected = true; } catch { await new Promise(r => setTimeout(r, 20)); }
    }
    assert.ok(connected, 'redis-server failed to start');
    await b.connect();
    const one = new RedisState(a, 'test-deployment');
    const two = new RedisState(b, 'test-deployment');
    const isolated = new RedisState(b, 'another-deployment');
    assert.equal(await one.putIfAbsent('nonce', 'value', 2), true);
    assert.equal(await isolated.consume('nonce', 'value'), false);
    assert.equal(await two.putIfAbsent('nonce', 'other', 2), false);
    assert.equal(await two.consume('nonce', 'wrong'), false);
    const consumed = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? one : two).consume('nonce', 'value')));
    assert.equal(consumed.filter(Boolean).length, 1);
    const limits = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? one : two).limit('account', 7, 2)));
    assert.equal(limits.filter(Boolean).length, 7);
    assert.equal(await one.putIfAbsent('expiring', 'v', 1), true);
    await new Promise(r => setTimeout(r, 1100));
    assert.equal(await two.consume('expiring', 'v'), false);
    assert.equal(await one.limit('account', 7, 2), false);
    await new Promise(r => setTimeout(r, 1000));
    assert.equal(await two.limit('account', 7, 2), true);
    await a.quit();
    await assert.rejects(one.consume('nonce', 'value'), /Shared security state unavailable/);
  } finally {
    if (a.isOpen) await a.quit();
    if (b.isOpen) await b.quit();
    server.kill('SIGTERM');
    if (server.exitCode === null && !spawnError) await new Promise(r => server.once('exit', r));
    await rm(directory, { recursive: true, force: true });
  }
});

test('Redis multi-process consume and AOF restart preserve consumed state', async () => {
  const directory=await mkdtemp('/tmp/opencode/bicaptcha-restart-'), path=join(directory,'redis.sock');
  async function start() {
    const p=spawn('redis-server',['--port','0','--unixsocket',path,'--unixsocketperm','700','--dir',directory,'--save','','--appendonly','yes','--appendfsync','always']);
    await new Promise<void>((ok,bad)=>{let out='';const timer=setTimeout(()=>{p.kill();bad(Error('Redis startup timeout'));},5000);p.on('error',e=>{clearTimeout(timer);bad(e);});p.on('exit',code=>{clearTimeout(timer);if(code)bad(Error(`Redis startup exit ${code}`));});p.stdout.on('data',b=>{out+=b;if(out.toLowerCase().includes('ready to accept connections')){clearTimeout(timer);ok();}});});
    return p;
  }
  let server=await start();
  const stop=async()=>{if(server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}};
  const client=createClient({socket:{path,reconnectStrategy:false}});client.on('error',()=>{});
  try {
    await client.connect();const state=new RedisState(client,'process-race');await state.putIfAbsent('nonce','v',30);await state.putIfAbsent('persist','v',30);
    const race=await Promise.all(Array.from({length:6},()=>new Promise<string>((ok,bad)=>{const p=spawn(process.execPath,['--import','tsx','tests/helpers/redis-worker.ts',path]);let out='';p.stdout.on('data',b=>out+=b);p.on('error',bad);p.on('exit',code=>code===0?ok(out.trim()):bad(Error(`worker ${code}`)));})));
    assert.equal(race.filter(x=>x==='accepted').length,1);
    await client.quit();await stop();server=await start();
    const fresh=createClient({socket:{path,reconnectStrategy:false}});fresh.on('error',()=>{});await fresh.connect();
    try{const restarted=new RedisState(fresh,'process-race');assert.equal(await restarted.consume('nonce','v'),false);assert.equal(await restarted.consume('persist','v'),true);}finally{await fresh.quit();}
  } finally {if(client.isOpen)await client.quit();await stop();await rm(directory,{recursive:true,force:true});}
});
