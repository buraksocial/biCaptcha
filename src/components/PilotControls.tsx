'use client';
import { useState, useEffect } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
type Org = { id:string; name:string; role:string; ends:string|null; revoked:boolean; expired:boolean; request_status:string|null; period_start:string|null; period_end:string|null; used:string; cap:string; overage:boolean; estimateMicroUSD:string; warning:boolean };
type RequestRow={org:string;requested_by:string;requested_at:string;name:string};
const field = 'block w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 mt-1 focus-visible:outline-2 focus-visible:outline-blue-400';
const button = 'rounded-lg bg-blue-600 hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-blue-300 px-4 py-2 disabled:opacity-50';
async function post(path:string,body:unknown) { const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(!r.ok) throw Error(r.status===503?'Service unavailable. Retry later.':'Request refused. Check permission, configuration and limits.');return r.json(); }
export default function PilotControls() {
  const [orgs,setOrgs]=useState<Org[]>([]), [requests,setRequests]=useState<RequestRow[]>([]), [cloud,setCloud]=useState(false), [status,setStatus]=useState(''),[busy,setBusy]=useState(false),[grant,setGrant]=useState('');
  async function load() { const r=await fetch('/api/cloud');if(r.ok){const data=await r.json();setCloud(true);setOrgs(data.organizations);setRequests(data.requests??[]);} }
  useEffect(()=>{const controller=new AbortController();void fetch('/api/cloud',{signal:controller.signal}).then(async r=>{if(r.ok){const data=await r.json();if(!controller.signal.aborted){setCloud(true);setOrgs(data.organizations);setRequests(data.requests??[]);}}}).catch(()=>{if(!controller.signal.aborted)setStatus('Pilot information unavailable.');});return()=>controller.abort();},[]);
  async function run(fn:()=>Promise<void>) {setBusy(true);setStatus('');try{await fn();setStatus('Saved.');}catch(e){setStatus(e instanceof Error?e.message:'Operation failed.');}finally{setBusy(false);} }
  return <details className="border border-zinc-800 rounded-xl p-5 mb-8">
    <summary className="font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-400">Deployment, Cloud pilot and Trust Pass</summary>
    <div className="mt-5 space-y-6 max-w-3xl">
      {cloud ? <section aria-label="Cloud pilot">
        <h2 className="text-xl font-semibold">Administrator-approved pilot</h2>
        <p className="text-zinc-300 mt-2">Pro estimate: $19.99/month, 100,000 first successful backend verifications. Overage: $0.00099 each. No payment processing or tax collection. Crypto is not available.</p>
        <a className="underline underline-offset-4 text-blue-300" href="https://developer.org.tr/contact">Contact Enterprise</a>
        {requests.length>0&&<section className="mt-5 border-t border-zinc-800 pt-4" aria-label="Pilot requests"><h3 className="font-medium">Pending pilot requests</h3>{requests.map(r=><form key={r.org} className="mt-3 flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);void run(async()=>{await post('/api/cloud',{op:'approve',org:r.org,ends:new Date(Date.now()+Number(d.get('days'))*86400000).toISOString()});await load();});}}><p className="mr-auto">{r.name} · requested by {r.requested_by} · {new Date(r.requested_at).toLocaleString()}</p><label className="block">Pilot days<input className={field} name="days" type="number" min="1" max="31" defaultValue="7" /></label><button className={button} disabled={busy}>Approve time-limited pilot</button><button type="button" className="rounded-lg border border-zinc-600 px-4 py-2" disabled={busy} onClick={()=>void run(async()=>{await post('/api/cloud',{op:'revoke',org:r.org});await load();})}>Deny / revoke</button></form>)}</section>}
        <form className="mt-4 flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);void run(async()=>{await post('/api/cloud',{op:'create',name:d.get('name')});await load();});}}>
          <label className="block">Organization name<input className={field} name="name" maxLength={100} required /></label><button className={button} disabled={busy}>Create organization</button>
        </form>
        {orgs.length===0 && <p className="mt-3 text-zinc-300">No organization yet. Create one, attach an owned site, then request administrator approval.</p>}
        {orgs.map(o=><div key={o.id} className="mt-5 border-t border-zinc-800 pt-4">
          <h3 className="font-medium break-all">{o.name}</h3><p className="text-sm text-zinc-300 break-all">Organization: {o.id} · Role: {o.role}</p>
          {!o.ends && o.role==='owner' && <><p className="text-sm mt-2">Pilot request: {o.request_status??'Not requested'}.</p><button type="button" className={`${button} mt-2`} disabled={busy||o.request_status==='pending'} onClick={()=>void run(async()=>{await post('/api/cloud',{op:'request-pilot',org:o.id});await load();})}>Request administrator-approved pilot</button></>}
          <dl className="mt-2 grid sm:grid-cols-2 gap-2 text-sm tabular-nums">
            <div><dt>Pilot</dt><dd>{!o.ends?'Not approved':o.revoked?'Revoked':o.expired?'Expired':`Until ${new Date(o.ends).toLocaleString()}`}</dd></div>
            <div><dt>Period (UTC)</dt><dd>{o.period_start??'Not set'} — {o.period_end??'Not set'}</dd></div>
            <div><dt>Successful first uses</dt><dd>{o.used} / 100,000 {o.warning?'— quota warning':''}</dd></div>
            <div><dt>Estimated period price, not charged</dt><dd>${(Number(o.estimateMicroUSD)/1000000).toFixed(5)}</dd></div>
          </dl>
          {o.role==='owner' && <>
            <form className="mt-3 space-y-3" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);void run(async()=>{await post('/api/cloud',{op:'overage',org:o.id,enabled:d.get('consent')==='on',capMicroUSD:Number(d.get('cap'))});await load();});}}>
              <label className="block"><input name="consent" type="checkbox" defaultChecked={o.overage} /> I explicitly allow overage within the additional spending cap below.</label>
              <label className="block">Additional cap (integer microUSD; 1 USD = 1,000,000)<input className={field} name="cap" type="number" min="0" step="1" required defaultValue={o.cap??'0'} /></label>
              <button className={button} disabled={busy}>Save overage consent and cap</button>
            </form>
            <form className="mt-3" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);void run(async()=>{await post('/api/cloud',{op:'attach-site',org:o.id,site:d.get('site')});await load();});}}>
              <label className="block">Owned site ID to attach<input className={field} name="site" maxLength={100} required /></label><button className={`${button} mt-2`} disabled={busy}>Attach owned site</button>
            </form>
          </>}
        </div>)}
      </section> : <p className="text-zinc-300">Self-host has no Cloud subscription requirement. If this is a Cloud deployment and its status is unavailable, contact the operator.</p>}
      <section aria-label="Trust Pass v2">
        <h2 className="text-xl font-semibold">Trust Pass v2</h2>
        <p className="text-zinc-300 mt-2">Use the deployment-configured v2 extension. Copy its public device key here. User-verified WebAuthn binds the key and the exact permission below for at most 15 minutes and 20 passes. A passkey or device signature alone is not proof of humanity. An allowed site may use your grant within these limits.</p>
        <form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);const registration=d.get('kind')==='register';void run(async()=>{
          const b=await post('/api/trust/v2/control',{op:registration?'register-options':'grant-options',password:d.get('password'),publicKey:JSON.parse(String(d.get('key'))),scope:[{siteKey:d.get('siteKey'),action:d.get('action'),host:d.get('host')}]});
          const response=registration?await startRegistration({optionsJSON:b.options}):await startAuthentication({optionsJSON:b.options});
          const g=await post('/api/trust/v2/control',{op:'finish',id:b.id,response});setGrant(JSON.stringify(g));
        });}}>
          <label className="block">Extension public device key (JSON)<textarea className={field} name="key" maxLength={2048} required /></label>
          <div className="grid sm:grid-cols-3 gap-3"><label>Verified site key<input className={field} name="siteKey" maxLength={80} required /></label><label>Allowed action<input className={field} name="action" maxLength={64} required /></label><label>Exact HTTPS hostname<input className={field} name="host" maxLength={253} required /></label></div>
          <label className="block">Operation<select name="kind" className={field}><option value="grant">Renew with existing passkey</option><option value="register">Register passkey and create grant</option></select></label>
          <label className="block">Current password (required only for new passkey)<input className={field} name="password" type="password" autoComplete="current-password" maxLength={72} /></label>
          <button className={button} disabled={busy}>Confirm scope and verify with WebAuthn</button>
        </form>
        {grant && <label className="block mt-4">Copy this grant configuration into the extension<textarea className={field} readOnly value={grant} aria-label="Grant configuration" /><button type="button" className="underline mt-2" onClick={()=>setGrant('')}>Hide configuration</button></label>}
        <button type="button" disabled={busy} className="mt-4 rounded-lg border border-zinc-600 px-4 py-2 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-blue-400" onClick={()=>void run(async()=>{await post('/api/trust/v2/control',{op:'revoke',kind:'account'});setGrant('');})}>Revoke all account grants now</button>
      </section>
      <p role="status" aria-live="polite" className="text-sm text-zinc-200">{busy?'Waiting for secure operation…':status}</p>
    </div>
  </details>;
}
