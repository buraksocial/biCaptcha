import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
async function main() {
  const config=JSON.parse(await readFile(process.argv[2],'utf8')) as {origin:string;deployment:string;origins:string[]};
  const exact=(s:string)=>{const u=new URL(s);if(u.protocol!=='https:'||u.origin!==s||u.port||u.username||u.password||s.includes('*'))throw Error('Exact HTTPS origins required');};
  exact(config.origin);if(!/^[\w-]{8,80}$/.test(config.deployment)||!Array.isArray(config.origins)||!config.origins.length||config.origins.length>100)throw Error('Invalid deployment configuration');
  config.origins.forEach(exact);
  const output=resolve(process.argv[3]??'/tmp/opencode/bicaptcha-extension-v2');await mkdir(output,{recursive:true});
  for(const f of ['background.js','content.js','popup.html','popup.js','popup.css'])await copyFile(join('extension/v2',f),join(output,f));
  await writeFile(join(output,'config.js'),`const BICAPTCHA_CONFIG = Object.freeze(${JSON.stringify(config)});\n`);
  await writeFile(join(output,'manifest.json'),JSON.stringify({manifest_version:3,name:'biCaptcha Trust Pass v2',version:'2.0.0',description:'Scoped, user-verified short-lived grants. Compatible with biCaptcha 0.2.x.',permissions:['scripting'],host_permissions:[`${config.origin}/*`],optional_host_permissions:config.origins.map(o=>`${o}/*`),background:{service_worker:'background.js'},action:{default_popup:'popup.html'}},null,2));
  console.log(`Unpacked extension generated at ${output}. Browser WebAuthn/MV3 validation remains required.`);
}
main().catch(()=>{console.error('Extension packaging refused: inspect explicit deployment/origin configuration');process.exitCode=1;});
