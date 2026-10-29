let dbPromise = null;

function initDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('biCaptchaTrustPass', 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('keys');
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function getKeys() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readonly');
    const store = tx.objectStore('keys');
    const req = store.get('keypair');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function generateAndStoreKeys() {
  // MUAZZAM NOKTA: extractable: false 
  // Bu özellik Private Key'in tarayıcının güvenlik katmanından asla çıkmamasını sağlar!
  const keypair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // extractable = false (Sızdırılamaz!)
    ['sign', 'verify']
  );
  
  const db = await initDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    const store = tx.objectStore('keys');
    const req = store.put(keypair, 'keypair');
    req.onsuccess = resolve;
    req.onerror = reject;
  });
  
  return keypair;
}

async function exportPublicKey(publicKey) {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

function bufferToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    getKeys().then(keys => {
      if (!keys) sendResponse({ registered: false });
      else {
        exportPublicKey(keys.publicKey).then(pub => {
          sendResponse({ registered: true, publicKey: pub });
        });
      }
    });
    return true;
  }
  
  if (message.type === 'REGISTER') {
    // Burada normalde WebAuthn onayı istenir (navigator.credentials.create)
    generateAndStoreKeys().then(keys => {
      exportPublicKey(keys.publicKey).then(pub => {
        fetch('http://localhost:3000/api/bi-captcha/register-pass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicKey: pub })
        }).then(res => res.json()).then(data => {
          if (data.success) {
            chrome.storage.local.set({ quota: 500 });
            sendResponse({ success: true, publicKey: pub });
          } else {
            sendResponse({ success: false, error: data.error });
          }
        }).catch(err => sendResponse({ success: false, error: err.message }));
      });
    });
    return true;
  }
  
  if (message.type === 'SIGN_CHALLENGE') {
    getKeys().then(keys => {
      if (!keys) return sendResponse({ error: 'Not registered' });
      
      const enc = new TextEncoder();
      const data = enc.encode(message.challenge);
      
      // Sızdırılamayan Private Key ile imza atıyoruz
      crypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        keys.privateKey,
        data
      ).then(async (signature) => {
        const pub = await exportPublicKey(keys.publicKey);
        sendResponse({
          signature: bufferToBase64(signature),
          publicKey: pub
        });
      }).catch(err => sendResponse({ error: err.message }));
    });
    return true;
  }
});
