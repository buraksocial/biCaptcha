// Sayfaya eklentinin varlığını bildiren bir flag enjekte et
const script = document.createElement('script');
script.textContent = `
  window.BI_CAPTCHA_TRUST_PASS = true;
`;
(document.head || document.documentElement).appendChild(script);
script.remove();

// Sayfadaki biCaptcha SDK'sından gelen imza taleplerini dinle
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.source !== 'bicaptcha-widget') {
    return;
  }

  if (event.data.type === 'REQUEST_SIGNATURE') {
    chrome.runtime.sendMessage({
      type: 'SIGN_CHALLENGE',
      challenge: event.data.challenge
    }, (response) => {
      window.postMessage({
        source: 'bicaptcha-extension',
        type: 'SIGNATURE_RESPONSE',
        id: event.data.id,
        payload: response
      }, '*');
    });
  }
});
