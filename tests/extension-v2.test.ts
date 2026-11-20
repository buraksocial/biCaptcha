import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
test('MV3 message boundary refuses general signing, external messages, frames and unapproved origins', async () => {
  let listener:(m:unknown,s:unknown,r:(v:unknown)=>void)=>boolean=()=>false;
  let signingCalls=0;
  runInNewContext(await readFile('extension/v2/background.js','utf8'),{
    BICAPTCHA_CONFIG:{origin:'https://api.example.com',deployment:'fixture-deployment',origins:['https://example.com']},
    importScripts:()=>{},URL,TextEncoder,AbortSignal,crypto:{subtle:{sign:()=>{signingCalls++;throw Error('must not sign');}}},
    chrome:{runtime:{id:'fixture-id',getURL:(p:string)=>`chrome-extension://fixture-id/${p}`,onMessage:{addListener:(f:typeof listener)=>{listener=f;}}}},
  });
  const sender={id:'fixture-id',frameId:0,origin:'https://example.com',url:'https://example.com/form',tab:{id:1}};
  for(const [message,s] of [
    [{op:'sign-message',message:'anything'},sender],
    [{op:'pass',action:'other'},sender],
    [{op:'pass'},{...sender,id:'other'}],
    [{op:'pass'},{...sender,frameId:1}],
    [{op:'pass'},{...sender,url:'https://evil.example.com',origin:'https://evil.example.com'}],
    [{op:'pass'},{...sender,origin:'https://different.example.com'}],
    [{op:'sign-message'}, {id:'fixture-id',url:'chrome-extension://fixture-id/popup.html'}],
  ]) {
    const response=await new Promise(resolve=>listener(message,s,resolve));
    assert.equal(JSON.stringify(response),JSON.stringify({success:false,fallback:true}));
  }
  assert.equal(signingCalls,0);
});
