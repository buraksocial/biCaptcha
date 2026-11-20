import { createHash, createPublicKey, randomBytes, randomUUID, verify, type JsonWebKey } from 'node:crypto';
import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse, type RegistrationResponseJSON, type AuthenticationResponseJSON } from '@simplewebauthn/server';
import { transaction, audit } from './postgres';
import { entitlement, tenant } from './ledger';
import { appOrigin, Unavailable } from './config';
import { context, type Context } from './captcha';
import { domainMatches } from './domain';
import { HttpError, object } from './http';
import type { Pool, PoolClient } from 'pg';
export function scope(value: unknown): Context[] {
  if (!Array.isArray(value) || !value.length || value.length > 10) throw new HttpError(400);
  return value.map(context).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
export function deviceKey(value: unknown): JsonWebKey {
  const k = object(value);
  if (k.kty !== 'EC' || k.crv !== 'P-256' || typeof k.x !== 'string' || typeof k.y !== 'string' || !/^[\w-]{43}$/.test(k.x) || !/^[\w-]{43}$/.test(k.y) || Object.keys(k).some(x => !['kty','crv','x','y','ext','key_ops'].includes(x))) throw new HttpError(400);
  const pub = { kty: 'EC', crv: 'P-256', x: k.x, y: k.y };
  createPublicKey({ key: pub, format: 'jwk' }); return pub;
}
export interface Proof extends Context { deployment: string; grant: string; nonce: string }
export function proofMessage(p: Proof) { return JSON.stringify(['urn:bicaptcha:trust:v2', p.deployment, p.grant, p.nonce, p.siteKey, p.action, p.host]); }
export function validProof(key: JsonWebKey, p: Proof, signature: string) {
  try { return /^[\w-]{86}$/.test(signature) && verify('sha256', Buffer.from(proofMessage(p)), { key: createPublicKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')); } catch { return false; }
}
function deployment() { const d = process.env.BICAPTCHA_DEPLOYMENT_ID; if (!d) throw new Unavailable('Deployment required'); return d; }
function rp() { return new URL(appOrigin()).hostname; }
async function allowed(c: PoolClient, account: string, contexts: Context[]) {
  for (const v of contexts) {
    const s = await tenant(c, v.siteKey);
    if (!domainMatches(v.host, s.domain)) throw new HttpError(403);
    if (process.env.BICAPTCHA_MODE === 'cloud') {
      if (!s.org || !(await c.query('SELECT 1 FROM membership WHERE org=$1 AND account=$2',[s.org,account])).rowCount) throw new HttpError(403);
      await entitlement(c, s.org);
    } else if(s.userId!==account) throw new HttpError(403);
  }
}
export async function options(account: string, email: string, kind: 'register' | 'grant', input: unknown) {
  const b = object(input), key = deviceKey(b.publicKey), scopes = scope(b.scope), d = deployment();
  return transaction(async c => {
    await allowed(c, account, scopes);
    const credentials = (await c.query('SELECT id FROM passkey WHERE account=$1', [account])).rows;
    if (kind === 'grant' && !credentials.length) throw new HttpError(403);
    const binding = { key, scope: scopes, deployment: d, account };
    // Server-generated challenge commits the device, account, deployment and exact scopes.
    const challenge = createHash('sha256').update(randomBytes(32)).update(JSON.stringify(binding)).digest();
    const opts = kind === 'register'
      ? await generateRegistrationOptions({ rpName: 'biCaptcha Trust Pass', rpID: rp(), userName: email, userID: Buffer.from(account), challenge, attestationType: 'none', authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' }, excludeCredentials: credentials.map(x => ({ id: x.id })) })
      : await generateAuthenticationOptions({ rpID: rp(), challenge, userVerification: 'required', allowCredentials: credentials.map(x => ({ id: x.id })) });
    const id = randomUUID();
    await c.query('INSERT INTO trust_challenge(id,account,kind,challenge,binding,expires) VALUES($1,$2,$3,$4,$5,now()+interval \'120 seconds\')', [id, account, kind, opts.challenge, binding]);
    return { id, kind, options: opts, binding };
  });
}
export async function finish(account: string, id: string, response: RegistrationResponseJSON | AuthenticationResponseJSON) {
  return transaction(async c => {
    const row = (await c.query('SELECT * FROM trust_challenge WHERE id=$1 AND account=$2 AND expires>now() FOR UPDATE', [id, account])).rows[0];
    if (!row || row.binding.deployment !== deployment() || row.binding.account !== account) throw new HttpError(403);
    if((await c.query('SELECT 1 FROM "User" WHERE id=$1',[account])).rowCount!==1) throw new HttpError(403);
    const data = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString());
    if (data.crossOrigin === true || data.topOrigin !== undefined) throw new HttpError(403);
    if (row.kind !== 'register') {
      const handle = (response as AuthenticationResponseJSON).response.userHandle;
      if (handle && handle !== Buffer.from(account).toString('base64url')) throw new HttpError(403);
    }
    await allowed(c, account, scope(row.binding.scope));
    if (row.kind === 'register') {
      const checked = await verifyRegistrationResponse({ response: response as RegistrationResponseJSON, expectedChallenge: row.challenge, expectedOrigin: appOrigin(), expectedRPID: rp(), requireUserVerification: true, expectedType: 'webauthn.create' });
      if (!checked.verified || !checked.registrationInfo?.userVerified) throw new HttpError(403);
      const info = checked.registrationInfo;
      const created=await c.query('INSERT INTO passkey(id,account,public_key,counter,backed_up) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING id', [info.credential.id, account, Buffer.from(info.credential.publicKey), info.credential.counter, info.credentialBackedUp]);
      if(!created.rowCount) throw new HttpError(409);
    } else {
      const key = (await c.query('SELECT * FROM passkey WHERE id=$1 AND account=$2 FOR UPDATE', [response.id, account])).rows[0];
      if (!key) throw new HttpError(403);
      const checked = await verifyAuthenticationResponse({ response: response as AuthenticationResponseJSON, expectedChallenge: row.challenge, expectedOrigin: appOrigin(), expectedRPID: rp(), requireUserVerification: true, expectedType: 'webauthn.get', credential: { id: key.id, publicKey: key.public_key, counter: Number(key.counter) } });
      if (!checked.verified || !checked.authenticationInfo.userVerified) throw new HttpError(403);
      if (checked.authenticationInfo.newCounter > Number(key.counter)) await c.query('UPDATE passkey SET counter=$2,backed_up=$3 WHERE id=$1', [key.id, checked.authenticationInfo.newCounter, checked.authenticationInfo.credentialBackedUp]);
    }
    await c.query('DELETE FROM trust_challenge WHERE id=$1', [id]);
    const device = randomUUID(), grant = randomUUID();
    const known=await c.query('SELECT id,revoked FROM trust_device WHERE account=$1 AND public_key=$2::jsonb FOR UPDATE',[account,JSON.stringify(row.binding.key)]);
    if(known.rows[0]?.revoked) throw new HttpError(403);
    if(known.rows[0]) await c.query('UPDATE trust_device SET revoked=false WHERE id=$1',[known.rows[0].id]);
    else await c.query('INSERT INTO trust_device(id,account,public_key) VALUES($1,$2,$3)', [device, account, row.binding.key]);
    const deviceId=known.rows[0]?.id??device;
    const seconds = Math.min(900, Math.max(1, Number(process.env.TRUST_GRANT_SECONDS ?? 900)));
    const budget = Math.min(20, Math.max(1, Number(process.env.TRUST_GRANT_BUDGET ?? 20)));
    if (!Number.isInteger(seconds) || !Number.isInteger(budget)) throw new Unavailable('Invalid trust limits');
    await c.query('INSERT INTO trust_grant(id,account,device,deployment,scope,expires,budget) VALUES($1,$2,$3,$4,$5,now()+$6*interval \'1 second\',$7)', [grant, account, deviceId, deployment(), JSON.stringify(row.binding.scope), seconds, budget]);
    await audit(c, account, `trust.${row.kind}`, grant);
    return { grant, device:deviceId, deployment: deployment(), scope: row.binding.scope, expiresIn: seconds, budget };
  });
}
export async function nonce(grant: string, ctx: Context) {
  return transaction(async c => {
    const g = (await c.query('SELECT * FROM trust_grant WHERE id=$1 AND NOT revoked AND expires>now() AND budget>0', [grant])).rows[0];
    if (!g || g.deployment !== deployment() || !g.scope.some((s: Context) => JSON.stringify(context(s)) === JSON.stringify(context(ctx)))) throw new HttpError(403);
    await allowed(c, g.account, [ctx]);
    const id = randomBytes(32).toString('base64url');
    await c.query('INSERT INTO trust_nonce(id,grant_id,context,expires) VALUES($1,$2,$3,now()+interval \'30 seconds\')', [id, grant, ctx]);
    return { nonce: id, expiresIn: 30 };
  });
}
export async function consumeProof(p: Proof, signature: string, db?: Pool) {
  return transaction(async c => {
    const g = (await c.query('SELECT g.*,d.public_key,d.revoked AS device_revoked FROM trust_grant g JOIN trust_device d ON d.id=g.device WHERE g.id=$1 FOR UPDATE OF g,d', [p.grant])).rows[0];
    if (!g || g.revoked || g.device_revoked || +g.expires <= Date.now() || g.budget < 1 || g.deployment !== deployment() || p.deployment !== deployment()) throw new HttpError(403);
    const ctx = context(p);
    if (!g.scope.some((s: Context) => JSON.stringify(context(s)) === JSON.stringify(ctx)) || !validProof(g.public_key, p, signature)) throw new HttpError(403);
    await allowed(c, g.account, [ctx]);
    const n = await c.query('DELETE FROM trust_nonce WHERE id=$1 AND grant_id=$2 AND context=$3::jsonb AND expires>now() RETURNING id', [p.nonce, p.grant, ctx]);
    if (!n.rowCount) throw new HttpError(403);
    const siteLimit = Math.min(20, Number(process.env.TRUST_SITE_LIMIT ?? 20));
    if (!Number.isInteger(siteLimit) || siteLimit < 1) throw new Unavailable('Invalid trust limit');
    const usage = await c.query('INSERT INTO trust_site_usage(grant_id,site,used) VALUES($1,$2,1) ON CONFLICT(grant_id,site) DO UPDATE SET used=trust_site_usage.used+1 WHERE trust_site_usage.used<$3 RETURNING used', [p.grant, ctx.siteKey, siteLimit]);
    if (!usage.rowCount) throw new HttpError(429);
    await c.query('UPDATE trust_grant SET budget=budget-1 WHERE id=$1', [p.grant]);
    return ctx;
  }, db);
}
export async function revoke(account: string, kind: 'account' | 'device' | 'grant', id?: string) {
  return transaction(async c => {
    if (kind === 'device') await c.query('UPDATE trust_device SET revoked=true WHERE id=$1 AND account=$2', [id, account]);
    await c.query(`UPDATE trust_grant SET revoked=true WHERE account=$1 ${kind === 'grant' ? 'AND id=$2' : kind === 'device' ? 'AND device=$2' : ''}`, kind === 'account' ? [account] : [account, id]);
    await c.query('DELETE FROM trust_challenge WHERE account=$1', [account]);
    await audit(c, account, `trust.revoke.${kind}`, id ?? account);
  });
}
