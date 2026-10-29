document.addEventListener('DOMContentLoaded', () => {
  const uiLoading = document.getElementById('loading');
  const uiUnregistered = document.getElementById('unregistered');
  const uiRegistered = document.getElementById('registered');
  const btnRegister = document.getElementById('btn-register');
  const quotaText = document.getElementById('quota');
  const pubkeyPreview = document.getElementById('pubkey-preview');

  function checkStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      uiLoading.classList.add('hidden');
      if (response && response.registered) {
        uiRegistered.classList.remove('hidden');
        pubkeyPreview.innerText = response.publicKey.substring(0, 15);
        chrome.storage.local.get(['quota'], (res) => {
          quotaText.innerText = res.quota || 500;
        });
      } else {
        uiUnregistered.classList.remove('hidden');
      }
    });
  }

  btnRegister.addEventListener('click', async () => {
    btnRegister.disabled = true;
    btnRegister.innerText = "Donanım Onayı Bekleniyor...";
    
    try {
      // 1. WebAuthn (Passkey) Donanım Doğrulaması (TPM / Secure Enclave)
      // Botların geçemeyeceği fiziksel bariyer
      const randomChallenge = new Uint8Array(32);
      crypto.getRandomValues(randomChallenge);
      
      const randomUserId = new Uint8Array(16);
      crypto.getRandomValues(randomUserId);

      await navigator.credentials.create({
        publicKey: {
          challenge: randomChallenge,
          rp: {
            name: "biCaptcha Trust Pass"
          },
          user: {
            id: randomUserId,
            name: "human@bicaptcha",
            displayName: "Biyometrik İnsan"
          },
          pubKeyCredParams: [{alg: -7, type: "public-key"}],
          authenticatorSelection: {
            // Sadece cihaza gömülü donanımları kabul et (TouchID, FaceID, Windows Hello)
            authenticatorAttachment: "platform", 
            userVerification: "required"
          },
          timeout: 60000,
          attestation: "direct"
        }
      });
      
      // 2. Fiziksel donanım onayı başarılı olduysa Mühürlü Anahtarı oluştur (Zero-Click Bypass için)
      btnRegister.innerText = "Anahtar Mühürleniyor...";
      
      chrome.runtime.sendMessage({ type: 'REGISTER' }, (response) => {
        if (response && response.success) {
          uiUnregistered.classList.add('hidden');
          uiRegistered.classList.remove('hidden');
          pubkeyPreview.innerText = response.publicKey.substring(0, 15);
          chrome.storage.local.get(['quota'], (res) => {
            quotaText.innerText = res.quota || 500;
          });
        } else {
          alert("Kayıt başarısız: " + (response ? response.error : 'Bilinmeyen hata'));
          resetButton();
        }
      });
    } catch (e) {
      alert("Donanım doğrulaması (Passkey) başarısız oldu veya reddedildi!\nBotlar bu eklentiyi kullanamaz.\nHata: " + e.message);
      resetButton();
    }
  });

  function resetButton() {
    btnRegister.disabled = false;
    btnRegister.innerText = "Mühürlü Anahtar Oluştur";
  }

  checkStatus();
});
