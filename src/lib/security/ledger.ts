import { randomUUID } from 'node:crypto';
import { type PoolClient, type Pool } from 'pg';
import { transaction, audit } from './postgres';
import { HttpError } from './http';
import type { Context } from './captcha';
import { domainMatches } from './domain';
export const BASE = 19990000n, INCLUDED = 100000n, UNIT = 990n;
export function periodPrice(used: bigint) {
  if (used < 0n) throw new HttpError(400);
  const microUSD = BASE + (used > INCLUDED ? used - INCLUDED : 0n) * UNIT;
  return { microUSD, cents: (microUSD + 5000n) / 10000n };
}
export function consent(enabled: unknown, cap: unknown) {
  if (typeof enabled !== 'boolean' || typeof cap !== 'number' || !Number.isSafeInteger(cap) || cap < 0 || (enabled && cap <= 0)) throw new HttpError(400);
  return { enabled, cap };
}
export async function tenant(c: PoolClient, siteKey: string) {
  const { rows } = await c.query('SELECT s."id",s."userId",s."domain",s."isVerified",t.org FROM "Site" s LEFT JOIN site_tenant t ON t.site=s.id WHERE s."siteKey"=$1', [siteKey]);
  const s = rows[0]; if (!s?.isVerified) throw new HttpError(403);
  return s;
}
export async function entitlement(c: PoolClient, org: string, lock = false) {
  const { rows } = await c.query(`SELECT * FROM pilot WHERE org=$1 ${lock ? 'FOR UPDATE' : ''}`, [org]);
  let p = rows[0]; const now = Date.now();
  if (!p || p.revoked || +p.starts > now || +p.ends <= now || +p.period_start > now) throw new HttpError(403);
  if (+p.period_end <= now) {
    p = (await c.query("UPDATE pilot SET period_start=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',period_end=(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC' WHERE org=$1 RETURNING *", [org])).rows[0];
  }
  return p;
}
/** Only call AFTER cryptographic token/context checks. DB is the sole consumption authority. */
export async function receipt(jti: string, context: Context, db?: Pool) {
  return transaction(async c => {
    const s = await tenant(c, context.siteKey);
    if (!domainMatches(context.host, s.domain)) throw new HttpError(403);
    const cloud = process.env.BICAPTCHA_MODE === 'cloud';
    const org = cloud ? s.org : s.userId;
    if (!org) throw new HttpError(403);
    const p = cloud ? await entitlement(c, org, true) : null;
    const inserted = await c.query('INSERT INTO verification_receipt(deployment,tenant,site,jti) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING jti', [process.env.BICAPTCHA_DEPLOYMENT_ID, org, s.id, jti]);
    if (!inserted.rowCount) throw new HttpError(403);
    if (p) {
      const lockedSite=await c.query('SELECT site FROM site_tenant WHERE site=$1 AND org=$2 FOR UPDATE',[s.id,org]);
      if(!lockedSite.rowCount) throw new HttpError(403);
      await c.query('INSERT INTO usage_period(deployment,org,start_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [process.env.BICAPTCHA_DEPLOYMENT_ID, org, p.period_start]);
      const usage = await c.query('SELECT used FROM usage_period WHERE deployment=$1 AND org=$2 AND start_at=$3 FOR UPDATE', [process.env.BICAPTCHA_DEPLOYMENT_ID, org, p.period_start]);
      const next = BigInt(usage.rows[0].used) + 1n;
      // cap is additional overage spend, excluding base price. Default denies any overage.
      if (next > INCLUDED && (!p.overage || !p.consent_at || (next - INCLUDED) * UNIT > BigInt(p.cap))) throw new HttpError(429);
      await c.query('UPDATE usage_period SET used=$4 WHERE deployment=$1 AND org=$2 AND start_at=$3', [process.env.BICAPTCHA_DEPLOYMENT_ID, org, p.period_start, next.toString()]);
    }
  }, db);
}
export async function createOrganization(account: string, name: string) {
  return transaction(async c => {
    const id = randomUUID();
    await c.query('INSERT INTO organization(id,name) VALUES($1,$2)', [id, name]);
    await c.query("INSERT INTO membership(org,account,role) VALUES($1,$2,'owner')", [id, account]);
    // Preserve Site ownership. Only an owner may opt their currently owned sites into the org.
    await audit(c, account, 'organization.create', id);
    return id;
  });
}
