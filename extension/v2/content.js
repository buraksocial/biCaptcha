// No public key/sign-message API. Only top-frame requests on configured origins.
window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin || !event.data || event.data.type !== 'bicaptcha:trust-v2:request' || typeof event.data.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(event.data.id) || Object.keys(event.data).length !== 2) return;
  const id = event.data.id;
  chrome.runtime.sendMessage({ op: 'pass' }).then(result => {
    window.postMessage({ type: 'bicaptcha:trust-v2:response', id, result }, location.origin);
  }).catch(() => window.postMessage({ type: 'bicaptcha:trust-v2:response', id, result: { success: false, fallback: true } }, location.origin));
});
