import { createPublicKey, verify, createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
export interface Manifest { version: string; sequence: number; channel: string; expires: string; artifact: string; sha256: string; size: number; schemaMin: number; schemaMax: number; security: boolean; breaking: boolean; imageRepository?: string; imagePlatform?: string }
export function version(v: string) { if (!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(v)) throw Error('Invalid version'); return v.split('.').map(Number); }
export function compare(a: string, b: string) { const aa = version(a), bb = version(b); for (let i=0;i<3;i++) if (aa[i]!==bb[i]) return aa[i]-bb[i]; return 0; }
export function approvedURL(raw: string, origin: string) {
  const u = new URL(raw), o = new URL(origin);
  if (u.protocol!=='https:' || o.origin!==origin || u.origin!==origin || u.username || u.password || u.port || u.search || u.hash || isIP(u.hostname) || !/^[a-z0-9.-]+$/i.test(u.hostname) || !u.hostname.includes('.') || /(?:%|\.\.|[;\\\s$`])/.test(raw) || !/^\/[a-zA-Z0-9_./-]+$/.test(u.pathname)) throw Error('Disallowed update URL');
  return u;
}
export function verifyManifest(envelope: {payload: string; signature: string}, config: {current: string; schema: number; origin: string; key: string; lastSequence: number}): Manifest {
  if (typeof envelope.payload !== 'string' || envelope.payload.length>16384 || typeof envelope.signature !== 'string') throw Error('Invalid envelope');
  const key = createPublicKey(config.key);
  if (key.asymmetricKeyType!=='ed25519' || !verify(null, Buffer.from(envelope.payload), key, Buffer.from(envelope.signature,'base64url'))) throw Error('Invalid signature');
  const m = JSON.parse(Buffer.from(envelope.payload,'base64url').toString()) as Manifest;
  approvedURL(m.artifact, config.origin);
  if (compare(m.version,config.current)<=0 || !Number.isSafeInteger(m.sequence) || m.sequence<=config.lastSequence || m.channel!=='stable' || !Number.isFinite(Date.parse(m.expires)) || Date.parse(m.expires)<=Date.now() || !/^[a-f0-9]{64}$/.test(m.sha256) || !Number.isSafeInteger(m.size) || m.size<1 || m.size>512*1024*1024 || !Number.isSafeInteger(m.schemaMin) || !Number.isSafeInteger(m.schemaMax) || m.schemaMin>config.schema || m.schemaMax<config.schema || typeof m.security!=='boolean' || typeof m.breaking!=='boolean' || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/.test(m.imageRepository ?? '') || (m.imagePlatform !== 'linux/amd64' && m.imagePlatform !== 'linux/arm64')) throw Error('Incompatible, stale or invalid release');
  return m;
}
/** DNS-pinned HTTPS, no redirects, private destinations, or unbounded responses. */
export async function download(raw: string, origin: string, maximum: number, resolveDNS: (hostname:string, options:{all:true})=>Promise<Array<{address:string;family:number}>> = lookup as (hostname:string,options:{all:true})=>Promise<Array<{address:string;family:number}>>): Promise<Buffer> {
  const url = approvedURL(raw,origin), addresses = await resolveDNS(url.hostname,{all:true});
  // Strict IPv4-only public endpoint policy: reject all mixed/private resolutions.
  const publicIP = (ip: string) => { const a=ip.split('.').map(Number); return isIP(ip)===4 && ![0,10,127,169,172,192,198,224,240,255].includes(a[0]) && a[0]>=1 && a[0]<224 && !(a[0]===100 && a[1]>=64 && a[1]<=127); };
  if (!addresses.length || addresses.some(a=>!publicIP(a.address))) throw Error('Private update endpoint refused');
  return new Promise((resolve,reject)=>{
    const req=request(url,{lookup: (_host,_options,cb)=>cb(null,addresses[0].address,4),timeout:10000},res=>{
      if (res.statusCode!==200) { res.destroy(); reject(Error('Update HTTP status rejected')); return; }
      let size=0; const chunks:Buffer[]=[];
      res.on('data',(b:Buffer)=>{size+=b.length; if(size>maximum) res.destroy(Error('Update too large')); else chunks.push(b);});
      res.on('end',()=>resolve(Buffer.concat(chunks))); res.on('error',reject);
    });
    const timer=setTimeout(()=>req.destroy(Error('Update deadline exceeded')),30000);
    req.on('timeout',()=>req.destroy(Error('Update timeout'))); req.on('error',reject); req.on('close',()=>clearTimeout(timer)); req.end();
  });
}
export function artifactValid(data: Buffer, m: Manifest) { return data.length===m.size && createHash('sha256').update(data).digest('hex')===m.sha256; }
