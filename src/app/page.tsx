'use client';

import { useState } from 'react';
import BiCaptcha from '@/components/BiCaptcha';

export default function Home() {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [widgetVersion, setWidgetVersion] = useState(0);
  const siteKey = process.env.NEXT_PUBLIC_DEMO_SITE_KEY;
  const apiBase = process.env.NEXT_PUBLIC_BICAPTCHA_API_BASE;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!captchaToken) {
      setStatus('Lütfen bekleyin, güvenlik kontrolü yapılıyor...');
      return;
    }

    setStatus('Gönderiliyor...');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message, biCaptchaToken: captchaToken })
      });

      const data = await res.json();
      
      if (res.ok) {
        setStatus('Demo doğrulandı; mesaj gönderilmedi.');
        setName('');
        setMessage('');
        // Token kullanıldıktan sonra sıfırlanmalıdır. (Bir token sadece 1 kez kullanılır)
        setCaptchaToken(null);
      } else {
        setStatus(`Hata: ${data.error || 'Bilinmeyen hata'}`);
      }
    } catch {
      setStatus('Bir ağ hatası oluştu.');
    } finally {
      setCaptchaToken(null);
      setWidgetVersion(v => v + 1);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 p-4 font-sans">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden p-8">
        <h1 className="text-2xl font-semibold text-white mb-6 tracking-tight">İletişim</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Adınız</label>
            <input
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              placeholder="Adınızı girin"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Mesajınız</label>
            <textarea
              required
              maxLength={4000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors h-32 resize-none"
              placeholder="Mesajınızı buraya yazın..."
            />
          </div>

          {/* Görünür biCaptcha Widget Bileşeni */}
          <div className="py-2">
            {siteKey && apiBase ? <BiCaptcha
              key={widgetVersion}
              siteKey={siteKey}
              apiBase={apiBase}
              action="contact"
              onVerify={(token) => setCaptchaToken(token)} 
            /> : <p className="text-sm text-zinc-400">Demo yapılandırılmadı. Doğrulanmış HTTPS domain ve site anahtarı gereklidir.</p>}
          </div>

          <button
            type="submit"
            disabled={!captchaToken}
            className={`w-full py-2.5 rounded-lg font-medium transition-all ${
              captchaToken 
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' 
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {captchaToken ? 'Gönder' : 'Güvenlik Kontrolü Bekleniyor...'}
          </button>
        </form>

        {status && (
          <div className="mt-4 p-3 rounded-lg bg-zinc-800/50 text-sm text-zinc-300 text-center border border-zinc-700/50">
            {status}
          </div>
        )}
      </div>
    </main>
  );
}
