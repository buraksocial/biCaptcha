import { readFile, writeFile, mkdir, rmdir, statfs, open, lstat, rename, unlink } from 'node:fs/promises';
import { resolve, isAbsolute, join } from 'node:path';
import { verifyManifest, download, version, artifactValid, approvedURL } from './updater-core';
import { composeApply } from './compose-apply';
interface Config { mode:'off'|'notify'|'download-approve'|'auto-security'; current:string; schema:number; origin:string; manifest:string; trustRoot:string; state:string; staging:string; pin?:string; maintenanceUTC:[number,number]; composeFile:string; projectDir:string; imageRepository:string; backupReceipt:string; platform:'linux/amd64'|'linux/arm64' }
async function durableState(path:string,value:{sequence:number;current:string}) {
 const existing=await lstat(path); if(existing.isSymbolicLink()||!existing.isFile()||existing.uid!==process.getuid?.()||(existing.mode&0o077)!==0) throw Error('Unsafe updater state file');
 const temp=`${path}.tmp-${process.pid}-${Date.now()}`; let handle;
 try {handle=await open(temp,'wx',0o600);await handle.writeFile(JSON.stringify(value));await handle.sync();await handle.close();handle=undefined;await rename(temp,path);const dir=await open(resolve(path,'..'),'r');try{await dir.sync()}finally{await dir.close()}}
 catch(error){if(handle)await handle.close().catch(()=>{});await unlink(temp).catch(()=>{});throw error}
}
export async function runUpdate(configPath: string, approve = false, fetchBytes = download, apply = composeApply) {
  if (!configPath || !isAbsolute(configPath)) throw Error('Absolute operator configuration required');
  const cfg=JSON.parse(await readFile(configPath,'utf8')) as Config;
  if (!cfg.mode || cfg.mode==='off') { console.log('Updates disabled'); return; }
  if (!['notify','download-approve','auto-security'].includes(cfg.mode)) throw Error('Invalid mode');
  for (const path of [cfg.trustRoot,cfg.state,cfg.staging]) if(!path || !isAbsolute(path)) throw Error('Absolute operator paths required');
  const lock=`${cfg.state}.lock`;
  try { await mkdir(lock,{mode:0o700}); } catch { throw Error('Updater is already locked or operator lock exists; inspect before manual clearance'); }
  try {
    const state=JSON.parse(await readFile(cfg.state,'utf8')) as {sequence:number; current:string};
    if(state.current!==cfg.current || !Number.isSafeInteger(state.sequence)) throw Error('State/config mismatch');
    approvedURL(cfg.manifest,cfg.origin);
    const envelope=JSON.parse((await fetchBytes(cfg.manifest,cfg.origin,32768)).toString());
    const manifest=verifyManifest(envelope,{current:cfg.current,schema:cfg.schema,origin:cfg.origin,key:await readFile(cfg.trustRoot,'utf8'),lastSequence:state.sequence});
    if(cfg.pin && cfg.pin!==manifest.version) throw Error('Pinned version mismatch');
    if(cfg.mode==='notify') { console.log(`Verified stable release ${manifest.version}; no download/application`); return; }
    const now=new Date().getUTCHours();
    if(!Array.isArray(cfg.maintenanceUTC) || cfg.maintenanceUTC.length!==2 || cfg.maintenanceUTC.some(n=>!Number.isInteger(n)||n<0||n>24) || now<cfg.maintenanceUTC[0] || now>=cfg.maintenanceUTC[1]) throw Error('Outside maintenance window');
    await mkdir(cfg.staging,{recursive:true,mode:0o700});
    const disk=await statfs(cfg.staging); if(BigInt(disk.bavail)*BigInt(disk.bsize)<BigInt(manifest.size)*3n) throw Error('Insufficient disk');
    const bytes=await fetchBytes(manifest.artifact,cfg.origin,manifest.size); if(!artifactValid(bytes,manifest)) throw Error('Artifact digest mismatch');
    if(manifest.imageRepository!==cfg.imageRepository||manifest.imagePlatform!==cfg.platform) throw Error('Signed image repository/platform does not match operator configuration');
    const target=join(resolve(cfg.staging),`${manifest.sha256}.oci.tar`); await writeFile(target,bytes,{mode:0o600});
    const automatic=cfg.mode==='auto-security' && manifest.security && !manifest.breaking && version(cfg.current).slice(0,2).join('.')===version(manifest.version).slice(0,2).join('.');
    if(!automatic && !approve) { console.log(`Verified artifact staged: ${target}. Manual approval required; not installed.`); return; }
    // Reserve replay protection before any deployment mutation. A failed apply requires
    // operator review and a newer sequence; never rewind this durable counter.
     await durableState(cfg.state,{sequence:manifest.sequence,current:cfg.current});
     await apply({composeFile:cfg.composeFile,projectDir:cfg.projectDir,staged:target,repository:cfg.imageRepository,version:manifest.version,previous:cfg.current,digest:manifest.sha256,size:manifest.size,expectedPlatform:cfg.platform,backupReceipt:cfg.backupReceipt,approve:true,commit:()=>durableState(cfg.state,{sequence:manifest.sequence,current:manifest.version})});
  } finally { await rmdir(lock); }
}
