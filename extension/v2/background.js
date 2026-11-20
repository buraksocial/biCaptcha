/* global BICAPTCHA_CONFIG */
importScripts('config.js');
const cfg = BICAPTCHA_CONFIG;
let db;
function database() {
  return db ??= new Promise((ok, bad) => {
    const r = indexedDB.open('bicaptcha-trust-v2', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('secure');
    r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error);
  });
}
async function store(mode, fn) {
  const d = await database();
  return new Promise((ok, bad) => {
    const tx = d.transaction('secure', mode); const r = fn(tx.objectStore('secure'));
    tx.oncomplete = () => ok(r.result); tx.onerror = () => bad(tx.error); tx.onabort = () => bad(tx.error);
  });
}
let keyPromise;
async function keys() {
  return keyPromise ??= (async () => {
    const saved = await store('readonly', s => s.get('device'));
    if (saved) return saved;
    const generated=await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    await store('readwrite',s=>s.put(generated,'device'));
    return generated;
  })();
}
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function api(body) {
  const r = await fetch(`${cfg.origin}/api/trust/v2/pass`, { method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw Error('Trust Pass refused; use normal CAPTCHA'); return r.json();
}
async function handle(message, sender) {
  if (!message || typeof message !== 'object' || JSON.stringify(message).length > 8192 || sender.id !== chrome.runtime.id) throw Error('Invalid sender/payload');
  const internal = sender.url === chrome.runtime.getURL('popup.html') && !sender.tab;
  if (internal) {
    if (message.op === 'public-key') return { publicKey: await crypto.subtle.exportKey('jwk', (await keys()).publicKey) };
    if (message.op === 'disable') { await store('readwrite', s => s.delete('grant')); await chrome.scripting.unregisterContentScripts(); return { disabled: true }; }
    if (message.op === 'grant') {
      const g = message.grant;
      if (!g || g.deployment !== cfg.deployment || !/^[\w-]{36}$/.test(g.grant) || !Array.isArray(g.scope) || !g.scope.length || g.scope.length > 10 || g.scope.some(s => !cfg.origins.includes(`https://${s.host}`) || !/^[\w-]{1,80}$/.test(s.siteKey) || !/^[\w-]{1,64}$/.test(s.action))) throw Error('Unconfigured scope');
      const matches = [...new Set(g.scope.map(s => `https://${s.host}/*`))];
      if (!await chrome.permissions.contains({ origins: matches })) throw Error('Host permission required');
      await chrome.scripting.unregisterContentScripts();
      await chrome.scripting.registerContentScripts([{ id: 'trust-v2', matches, js: ['content.js'], allFrames: false, persistAcrossSessions: true }]);
      await store('readwrite', s => s.put({ ...g, enabledAt: Date.now() }, 'grant')); return { enabled: true };
    }
    throw Error('No signing interface');
  }
  if (message.op !== 'pass' || Object.keys(message).length !== 1 || !sender.tab || sender.frameId !== 0 || !sender.url || !sender.origin) throw Error('Invalid page message');
  const u = new URL(sender.url);
  if (u.protocol !== 'https:' || u.origin !== sender.origin || !cfg.origins.includes(u.origin)) throw Error('Unapproved origin');
  const g = await store('readonly', s => s.get('grant'));
  if (!g || Date.now() - g.enabledAt > Math.min(g.expiresIn, 900) * 1000) throw Error('Grant expired or disabled');
  // Page does not select authoritative site/action. Ambiguous host requires narrower grant.
  const contexts = g.scope.filter(s => `https://${s.host}` === u.origin);
  if (contexts.length !== 1) throw Error('No unique approved context');
  const context = contexts[0], n = await api({ op: 'nonce', grant: g.grant, context });
  if (typeof n.nonce !== 'string' || !/^[\w-]{43}$/.test(n.nonce)) throw Error('Invalid nonce');
  const proof = JSON.stringify(['urn:bicaptcha:trust:v2', cfg.deployment, g.grant, n.nonce, context.siteKey, context.action, context.host]);
  const signature = encode(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, (await keys()).privateKey, new TextEncoder().encode(proof)));
  return { ...await api({ op: 'consume', grant: g.grant, deployment: cfg.deployment, nonce: n.nonce, context, signature }), context };
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  handle(message, sender).then(reply, () => reply({ success: false, fallback: true })); return true;
});
