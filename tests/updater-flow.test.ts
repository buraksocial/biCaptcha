import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { runUpdate } from '../scripts/updater';
test('updater fixture: off/notify/stage; manual and automatic apply require valid operator receipt/config', async () => {
  const directory=await mkdtemp('/tmp/opencode/bicaptcha-update-'),p=(s:string)=>join(directory,s);
  const pair=generateKeyPairSync('ed25519'),artifact=Buffer.from('immutable-fixture-artifact'),digest=createHash('sha256').update(artifact).digest('hex');
  const config={mode:'off',pin:undefined as string|undefined,current:'2.0.1',schema:1,origin:'https://releases.example.com',manifest:'https://releases.example.com/manifest.json',trustRoot:p('root.pem'),state:p('state.json'),staging:p('staging'),maintenanceUTC:[0,24],composeFile:p('compose.yaml'),projectDir:directory,imageRepository:'registry.example.com/bicaptcha/app',backupReceipt:p('backup.json'),platform:'linux/amd64'};
  const manifest={version:'2.0.2',sequence:5,channel:'stable',expires:new Date(Date.now()+600000).toISOString(),artifact:'https://releases.example.com/app.oci.tar',sha256:digest,size:artifact.length,schemaMin:1,schemaMax:1,security:true,breaking:false,imageRepository:config.imageRepository,imagePlatform:config.platform};
  const save=async()=>writeFile(p('config.json'),JSON.stringify(config));
   const reset=async()=>{await writeFile(config.state,JSON.stringify({sequence:4,current:'2.0.1'}),{mode:0o600});await rm(p('applied'),{force:true});};
  let downloads=0;
  const transport=async(url:string)=>{downloads++;if(url.endsWith('/app.oci.tar'))return artifact;const payload=Buffer.from(JSON.stringify(manifest)).toString('base64url');return Buffer.from(JSON.stringify({payload,signature:sign(null,Buffer.from(payload),pair.privateKey).toString('base64url')}));};
  try {
    await writeFile(config.trustRoot,pair.publicKey.export({type:'spki',format:'pem'}));
    await reset();await save();await runUpdate(p('config.json'),false,transport);assert.equal(downloads,0);
    config.mode='notify';await save();await runUpdate(p('config.json'),false,transport);assert.equal(downloads,1);await assert.rejects(access(p('applied')));
    config.mode='download-approve';await save();await runUpdate(p('config.json'),false,transport);await assert.rejects(access(p('applied')));assert.equal(JSON.parse(await readFile(config.state,'utf8')).sequence,4);
      await assert.rejects(runUpdate(p('config.json'),true,transport));assert.equal(JSON.parse(await readFile(config.state,'utf8')).sequence,5);await assert.rejects(access(p('applied')));
      await reset();config.mode='auto-security';await save();await assert.rejects(runUpdate(p('config.json'),false,transport));assert.equal(JSON.parse(await readFile(config.state,'utf8')).sequence,5);await assert.rejects(access(p('applied')));
    await reset();manifest.breaking=true;await runUpdate(p('config.json'),false,transport);await assert.rejects(access(p('applied')));manifest.breaking=false;
     config.pin='2.0.3';await save();await assert.rejects(runUpdate(p('config.json'),false,transport),/Pinned/);delete (config as Partial<typeof config> & {pin?:string}).pin;
     config.maintenanceUTC=[0,0];await save();await assert.rejects(runUpdate(p('config.json'),false,transport),/maintenance/);config.maintenanceUTC=[0,24];await save();
     await reset();config.mode='download-approve';await save();let commitCalls=0;
     await runUpdate(p('config.json'),true,transport,async (options)=>{
       assert.deepEqual(JSON.parse(await readFile(config.state,'utf8')),{sequence:5,current:'2.0.1'});
       await options.commit();commitCalls++;
       assert.deepEqual(JSON.parse(await readFile(config.state,'utf8')),{sequence:5,current:'2.0.2'});
     });
     assert.equal(commitCalls,1);
     await reset();
     await runUpdate(p('config.json'),true,transport,async()=>{});
     assert.deepEqual(JSON.parse(await readFile(config.state,'utf8')),{sequence:5,current:'2.0.1'});
  } finally {await rm(directory,{recursive:true,force:true});}
});
