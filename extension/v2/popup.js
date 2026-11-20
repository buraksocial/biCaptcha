const status = document.querySelector('#status');
async function send(message) { const result=await chrome.runtime.sendMessage(message);if(result.fallback)throw Error('Refused. Check configuration or use normal CAPTCHA.');return result; }
document.querySelector('#key').onclick=async()=>{try{document.querySelector('#public').value=JSON.stringify((await send({op:'public-key'})).publicKey);status.textContent='Copy this public key into the dashboard. Private key is not exportable.';}catch(e){status.textContent=e.message;}};
document.querySelector('#enable').onclick=async()=>{try{
  const grant=JSON.parse(document.querySelector('#grant').value);
  if(!Array.isArray(grant.scope)||grant.scope.length>10)throw Error('Invalid scope');
  if(!confirm(`Allow up to 20 passes, at most 15 minutes, for:\n${grant.scope.map(s=>`${s.host} / ${s.siteKey} / ${s.action}`).join('\n')}?`))return;
  const origins=grant.scope.map(s=>`https://${s.host}/*`);
  if(!await chrome.permissions.request({origins}))throw Error('Permission denied');
  await send({op:'grant',grant});status.textContent='Automatic passes enabled within the server-approved scope.';
}catch(e){status.textContent=e.message;}};
document.querySelector('#disable').onclick=async()=>{try{await send({op:'disable'});status.textContent='Local automatic passes disabled. Use dashboard to revoke server grants.';}catch(e){status.textContent=e.message;}};
