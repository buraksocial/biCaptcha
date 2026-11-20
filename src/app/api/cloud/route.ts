import { requireUser } from '@/lib/security/auth';
import { csrf, failure, HttpError, json, rate, readJson, text } from '@/lib/security/http';
import { transaction, audit } from '@/lib/security/postgres';
import { consent, createOrganization, periodPrice } from '@/lib/security/ledger';
export const runtime = 'nodejs';
function enabled() { if (process.env.BICAPTCHA_MODE !== 'cloud') throw new HttpError(404); }
export async function GET(request: Request) {
  try {
    enabled(); const user = await requireUser(request);
    const rows = await transaction(async c => (await c.query(`SELECT o.id,o.name,m.role,p.starts,p.ends,p.revoked,p.period_start,p.period_end,p.overage,p.cap,COALESCE(u.used,0) AS used,r.status AS request_status
      FROM membership m JOIN organization o ON o.id=m.org LEFT JOIN pilot p ON p.org=o.id
      LEFT JOIN pilot_request r ON r.org=o.id LEFT JOIN usage_period u ON u.org=o.id AND u.start_at=p.period_start AND u.deployment=$2 WHERE m.account=$1 ORDER BY o.id LIMIT 100`, [user.id, process.env.BICAPTCHA_DEPLOYMENT_ID])).rows);
    const admin=(process.env.BICAPTCHA_ADMIN_IDS??'').split(',').filter(Boolean).includes(user.id);
    const requests=admin?await transaction(async c=>(await c.query("SELECT r.org,r.requested_by,r.requested_at,o.name FROM pilot_request r JOIN organization o ON o.id=r.org WHERE r.status='pending' ORDER BY r.requested_at LIMIT 100")).rows):[];
    return json({ mode: 'administrator-approved-pilot', realPayments: false, requests, organizations: rows.map(r => ({ ...r, expired: r.ends ? +r.ends <= Date.now() : true, estimateMicroUSD: periodPrice(BigInt(r.used)).microUSD.toString(), periodEndRoundedCents: periodPrice(BigInt(r.used)).cents.toString(), included: 100000, warning: BigInt(r.used) >= 90000n })) });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    enabled(); csrf(request); const user = await requireUser(request); await rate('cloud-write', user.id, 20);
    const body = await readJson(request, 4096), op = text(body.op, 30);
    if (op === 'create') return json({ id: await createOrganization(user.id, text(body.name, 100)) }, 201);
    const org = text(body.org, 100);
    await transaction(async c => {
      if (op==='request-pilot') {
        const owner=await c.query("SELECT 1 FROM membership WHERE org=$1 AND account=$2 AND role='owner' FOR UPDATE",[org,user.id]);if(!owner.rowCount)throw new HttpError(403);
        await c.query("INSERT INTO pilot_request(org,requested_by,status) VALUES($1,$2,'pending') ON CONFLICT(org) DO UPDATE SET requested_by=EXCLUDED.requested_by,requested_at=now(),status=CASE WHEN pilot_request.status='approved' THEN 'approved' ELSE 'pending' END",[org,user.id]);
      } else if (['approve', 'revoke'].includes(op)) {
        // Server allowlist only. No default admin; no client-assigned administrative role.
        if (!(process.env.BICAPTCHA_ADMIN_IDS ?? '').split(',').filter(Boolean).includes(user.id)) throw new HttpError(403);
        if (op === 'revoke') await c.query('UPDATE pilot SET revoked=true WHERE org=$1', [org]);
        else {
          const existed=await c.query('SELECT org FROM pilot WHERE org=$1 FOR UPDATE',[org]);
          if(!existed.rowCount && op!=='approve') throw new HttpError(404);
          const ends = new Date(text(body.ends, 40)), start = new Date(), periodEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
          const periodStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
          if (!Number.isFinite(+ends) || +ends <= +start || +ends - +start > 31 * 86400000) throw new HttpError(400);
          // Approval/extension never resets period usage or an owner's overage preferences.
          await c.query(`INSERT INTO pilot(org,starts,ends,period_start,period_end) VALUES($1,$2,$3,$4,$5)
            ON CONFLICT(org) DO UPDATE SET ends=EXCLUDED.ends,revoked=false`, [org, start, ends, periodStart, periodEnd]);
        }
        await c.query("UPDATE pilot_request SET status=$2 WHERE org=$1",[org,op==='approve'?'approved':'revoked']);
      } else {
        const owner = await c.query("SELECT 1 FROM membership WHERE org=$1 AND account=$2 AND role='owner' FOR UPDATE", [org, user.id]);
        if (!owner.rowCount && op!=='request-pilot') throw new HttpError(403);
        if (op === 'overage') {
          const x = consent(body.enabled, body.capMicroUSD);
          const updated=await c.query('UPDATE pilot SET overage=$2,cap=$3,consent_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE org=$1 AND NOT revoked AND ends>now()', [org, x.enabled, x.cap]);
          if(!updated.rowCount) throw new HttpError(409);
        } else if (op === 'attach-site') {
          const site = await c.query('SELECT id FROM "Site" WHERE id=$1 AND "userId"=$2 FOR UPDATE', [text(body.site, 100), user.id]);
          if (!site.rowCount) throw new HttpError(403);
          // No silent reassignment from another organization.
          await c.query('INSERT INTO site_tenant(site,org) VALUES($1,$2)', [body.site, org]);
        } else if (op === 'add-member') {
          await c.query("INSERT INTO membership(org,account,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING", [org, text(body.account, 100)]);
        } else if (op === 'remove-member') {
          await c.query("DELETE FROM membership WHERE org=$1 AND account=$2 AND role='member'", [org, text(body.account, 100)]);
        } else throw new HttpError(400);
      }
      await audit(c, user.id, `pilot.${op}`, org);
    });
    return json({ success: true, realPayments: false });
  } catch (e) { return failure(e); }
}
