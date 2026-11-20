import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { randomUUID, randomBytes, generateKeyPairSync, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { receipt } from '../src/lib/security/ledger';
import { consumeProof, proofMessage, nonce, options, finish } from '../src/lib/security/trust-v2';
import { authenticator } from './helpers/webauthn';
import { createClient } from 'redis';
import { RedisState } from '../src/lib/security/redis-state';
import { CaptchaService } from '../src/lib/security/captcha';
import { postgres } from '../src/lib/security/postgres';
const url = process.env.TEST_DATABASE_URL;
test('real Postgres: additive baseline, multi-process receipts, billing cap, restart persistence and Trust budget races', { skip: !url }, async () => {
  const schema = `fixture_${randomUUID().replaceAll('-', '')}`;
  const root = new Pool({ connectionString: url });
  await root.query(`CREATE SCHEMA ${schema}`);
  const connection = new URL(url!); connection.searchParams.set('options', `-c search_path=${schema}`); connection.searchParams.set('schema',schema);
  Object.assign(process.env, { DATABASE_URL: connection.href, BICAPTCHA_MODE: 'cloud', BICAPTCHA_DEPLOYMENT_ID: 'fixture-deployment', APP_ORIGIN: 'https://dashboard.example.com' });
  const db = new Pool({ connectionString: connection.href });
  const ctx = { siteKey: 'fixture-site', action: 'contact', host: 'example.com' };
  try {
    await db.query(await readFile('prisma/postgres/migrations/202611200001_baseline/migration.sql','utf8'));
    await db.query(`INSERT INTO "User"(id,email,password,"updatedAt") VALUES('u','fixture@example.com','unused',now());
      INSERT INTO "Site"(id,domain,"siteKey","secretKey","isVerified","userId","updatedAt") VALUES('s','example.com','fixture-site','unused',true,'u',now());
      INSERT INTO organization VALUES('o','Fixture'); INSERT INTO membership VALUES('o','u','owner'); INSERT INTO site_tenant VALUES('s','o');
      INSERT INTO pilot(org,starts,ends,period_start,period_end) VALUES('o',now()-interval '1 day',now()+interval '1 day',date_trunc('month',now()),date_trunc('month',now())+interval '1 month');`);
    await assert.rejects(db.query('INSERT INTO "User"(id,email,password,"updatedAt") VALUES($1,$2,$3,now())',['other','fixture@example.com','unused']));
    await db.query("INSERT INTO \"User\"(id,email,password,\"updatedAt\") VALUES('other','other@example.com','unused',now());INSERT INTO \"Site\"(id,domain,\"siteKey\",\"secretKey\",\"isVerified\",\"userId\",\"updatedAt\") VALUES('other-site','example.com','other-site-key','unused',true,'other',now())");
    await assert.rejects(receipt('cross-tenant-site',{siteKey:'other-site-key',action:'contact',host:'example.com'},db));
    const worker = () => new Promise<string>((ok, bad) => {
      const child=spawn(process.execPath,['--import','tsx','tests/helpers/ledger-worker.ts','same-jti'],{env:process.env}); let out='';child.stdout.on('data',b=>out+=b);child.on('error',bad);child.on('exit',code=>code===0?ok(out.trim()):bad(Error(`worker ${code}`)));
    });
    const outcomes=await Promise.all(Array.from({length:8},worker));
    assert.equal(outcomes.filter(x=>x==='accepted').length,1);
    assert.equal((await db.query('SELECT used FROM usage_period')).rows[0].used,'1');
    await assert.rejects(receipt('same-jti',ctx,db)); // after process restart, no new authorization
    await db.query('UPDATE usage_period SET used=100000');
    await assert.rejects(receipt('over-disabled',ctx,db));
    assert.equal((await db.query("SELECT count(*) FROM verification_receipt WHERE jti='over-disabled'")).rows[0].count,'0');
    await db.query('UPDATE pilot SET overage=true,consent_at=now(),cap=1980');
    const race = await Promise.allSettled(Array.from({length:12},(_,i)=>receipt(`cap-${i}`,ctx,db)));
    assert.equal(race.filter(r=>r.status==='fulfilled').length,2);
    assert.equal((await db.query('SELECT used FROM usage_period')).rows[0].used,'100002');
    await db.query('UPDATE pilot SET revoked=true');
    await assert.rejects(receipt('revoked',ctx,db));
    await db.query('UPDATE pilot SET revoked=false');
    if (process.env.TEST_REDIS_URL) {
      // TEST_REDIS_URL must be an isolated disposable fixture: FLUSHDB is intentional here.
      const redis=createClient({url:process.env.TEST_REDIS_URL,socket:{reconnectStrategy:false}});redis.on('error',()=>{});await redis.connect();
      try {
        process.env.BICAPTCHA_MODE='selfhost';
        const service=new CaptchaService({state:new RedisState(redis,'fixture-deployment'),deployment:'fixture-deployment',challengeKey:randomBytes(32),tokenKey:randomBytes(32),findSite:async()=>({id:'s',siteKey:ctx.siteKey,domain:'example.com',isVerified:true}),durableConsume:(jti,c)=>receipt(jti,c,db)});
        const token=await service.issue(ctx);
        await assert.rejects(service.consume(token,{...ctx,action:'different'}));
        await service.consume(token,ctx);
        await redis.flushDb();
        await assert.rejects(service.consume(token,ctx)); // Redis loss cannot recreate authorization.
        const second=await service.issue(ctx);
        await redis.quit();
        // Postgres remains authority even if Redis is disconnected after token issuance.
        await service.consume(second,ctx);await assert.rejects(service.consume(second,ctx));
      } finally {if(redis.isOpen)await redis.quit();process.env.BICAPTCHA_MODE='cloud';}
    }
    const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}), pub=pair.publicKey.export({format:'jwk'});
    const uv=authenticator();
    const enroll=await options('u','fixture@example.com','register',{publicKey:pub,scope:[ctx]});
    await assert.rejects(options('other','other@example.com','register',{publicKey:pub,scope:[ctx]}));
    for (const response of [uv.register(enroll.options.challenge,'https://evil.example.com'),uv.register(enroll.options.challenge,undefined,'evil.example.com'),uv.register(enroll.options.challenge,undefined,undefined,0x41),uv.register('wrong-challenge')]) await assert.rejects(finish('u',enroll.id,response));
    await assert.rejects(finish('other-account',enroll.id,uv.register(enroll.options.challenge)));
    const enrolled=await finish('u',enroll.id,uv.register(enroll.options.challenge));
    assert.equal(enrolled.budget,20);assert.equal(enrolled.expiresIn,900);
    const sameDevice=await options('u','fixture@example.com','grant',{publicKey:pub,scope:[ctx]});
    const renewed=await finish('u',sameDevice.id,uv.authenticate(sameDevice.options.challenge,undefined,undefined,5,1));
    assert.equal(renewed.device,enrolled.device);
    await assert.rejects(options('other','other@example.com','grant',{publicKey:pub,scope:[ctx]}));
    await assert.rejects(finish('u',enroll.id,uv.register(enroll.options.challenge)));
    const renewal=await options('u','fixture@example.com','grant',{publicKey:pub,scope:[ctx]});
    for (const response of [uv.authenticate(renewal.options.challenge,'https://evil.example.com'),uv.authenticate(renewal.options.challenge,undefined,'evil.example.com'),uv.authenticate(renewal.options.challenge,undefined,undefined,1),uv.authenticate('wrong-challenge')]) await assert.rejects(finish('u',renewal.id,response));
    await finish('u',renewal.id,uv.authenticate(renewal.options.challenge,undefined,undefined,5,2));
    await assert.rejects(finish('u',renewal.id,uv.authenticate(renewal.options.challenge)));
    await db.query("INSERT INTO trust_device(id,account,public_key) VALUES('d','u',$1)",[pub]);
    await db.query("INSERT INTO trust_grant(id,account,device,deployment,scope,expires,budget) VALUES('g','u','d','fixture-deployment',$1,now()+interval '15 minutes',20)",[JSON.stringify([ctx])]);
    const proofs=[];
    for(let i=0;i<25;i++) {
      const n=await nonce('g',ctx), p={...ctx,grant:'g',deployment:'fixture-deployment',nonce:n.nonce};
      proofs.push({p,signature:sign('sha256',Buffer.from(proofMessage(p)),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')});
    }
    for(const field of ['host','action','siteKey','deployment','grant','nonce'] as const) await assert.rejects(consumeProof({...proofs[0].p,[field]:'other'},proofs[0].signature,db));
    const budget=await Promise.allSettled(proofs.map(x=>consumeProof(x.p,x.signature,db)));
    assert.equal(budget.filter(r=>r.status==='fulfilled').length,20);
    assert.equal((await db.query("SELECT budget FROM trust_grant WHERE id='g'")).rows[0].budget,0);
    await assert.rejects(consumeProof(proofs[0].p,proofs[0].signature,db));
    await db.query("UPDATE trust_grant SET budget=20,revoked=true WHERE id='g'");
    await assert.rejects(consumeProof(proofs[24].p,proofs[24].signature,db));
    await db.query("UPDATE trust_grant SET revoked=false,expires=now()-interval '1 second' WHERE id='g'");
    await assert.rejects(consumeProof(proofs[24].p,proofs[24].signature,db));
    const unavailable=new Pool({connectionString:'postgresql://none:none@127.0.0.1:1/nope',connectionTimeoutMillis:500});
    await assert.rejects(receipt('outage',ctx,unavailable),/unavailable/); await unavailable.end();
    Object.assign(process.env,{NODE_ENV:'test',BICAPTCHA_STATE:'memory',JWT_SECRET:randomBytes(32).toString('hex'),BICAPTCHA_SECRET:randomBytes(32).toString('hex'),BICAPTCHA_VERIFY_SECRET:randomBytes(32).toString('hex')});
    const {issueSession}=await import('../src/lib/security/auth');
    const cloud=await import('../src/app/api/cloud/route');
    const control=await import('../src/app/api/trust/v2/control/route');
    const cookie=`bicaptcha_session=${await issueSession('u')}`;
    const request=(body:unknown,origin='https://dashboard.example.com')=>new Request('https://dashboard.example.com/api/cloud',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});
    const authModule=await import('../src/lib/security/auth');
    assert.equal((await authModule.requireUser(request({}))).id,'u');
    const {analyticsFor}=await import('../src/lib/security/analytics');
    assert.equal((await analyticsFor('u',{days:1,page:1})).stats.total,0);
    delete process.env.BICAPTCHA_ADMIN_IDS;
    assert.equal((await cloud.POST(request({op:'approve',org:'o',ends:new Date(Date.now()+3600000).toISOString(),role:'admin'}))).status,403);
    assert.equal((await cloud.POST(request({op:'overage',org:'o',enabled:true,capMicroUSD:990},'https://evil.example.com'))).status,403);
    assert.equal((await cloud.POST(request({op:'overage',org:'o',enabled:true,capMicroUSD:0}))).status,400);
    assert.equal((await control.POST(request({op:'register-options',password:'incorrect-password',publicKey:pub,scope:[ctx]}))).status,403);
    assert.equal((await control.POST(request({op:'grant-options',publicKey:pub,scope:[ctx]},'https://evil.example.com'))).status,403);
    process.env.BICAPTCHA_ADMIN_IDS='u';
    assert.equal((await cloud.POST(request({op:'approve',org:'o',ends:new Date(Date.now()+3600000).toISOString()}))).status,200);
    assert.equal((await cloud.POST(request({op:'revoke',org:'o'}))).status,200);
    await assert.rejects(receipt('after-admin-revoke',ctx,db));
    assert.equal((await cloud.POST(request({op:'request-pilot',org:'o'}))).status,200);
    assert.equal((await (await cloud.GET(request({}))).json()).requests[0].org,'o');
    const otherOrg=await db.query("INSERT INTO organization VALUES('other-org','Other');INSERT INTO membership VALUES('other-org','u','member')");void otherOrg;
    assert.equal((await cloud.POST(request({op:'overage',org:'other-org',enabled:true,capMicroUSD:990}))).status,403);
    assert.equal((await control.POST(request({op:'revoke',kind:'account'}))).status,200);
    assert.equal((await db.query('SELECT count(*) FROM trust_grant WHERE NOT revoked')).rows[0].count,'0');
    assert.ok(Number((await db.query('SELECT count(*) FROM audit_event')).rows[0].count)>=4);
    const {prisma}=await import('../src/lib/prisma');await prisma.$disconnect();
  } finally { await db.end(); await postgres().end(); await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.end(); }
});
