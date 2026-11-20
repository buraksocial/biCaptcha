'use client';
import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';

interface BiCaptchaProps { siteKey: string; action: string; apiBase: string; onVerify: (token: string) => void }
const loaders = new Map<string, Promise<void>>();
function loadSdk(base: string) {
  if (!loaders.has(base)) {
    const promise = new Promise<void>((resolve, reject) => {
      const url = new URL('/bicaptcha.js', base);
      if (url.protocol !== 'https:') { reject(Error('HTTPS required')); return; }
      const script = document.createElement('script');
      script.src = url.href;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { script.remove(); reject(Error('SDK unavailable')); };
      document.head.appendChild(script);
    });
    loaders.set(base, promise);
    void promise.catch(() => loaders.delete(base));
  }
  return loaders.get(base)!;
}
export default function BiCaptcha({ siteKey, action, apiBase, onVerify }: BiCaptchaProps) {
  const client = useRef<BiCaptchaInstance | null>(null);
  const callback = useRef(onVerify);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState('loading');
  useEffect(() => { callback.current = onVerify; }, [onVerify]);
  useEffect(() => {
    let active = true;
    loadSdk(apiBase).then(() => {
      if (!active) return;
      if (!window.BiCaptcha) throw Error('SDK unavailable');
      client.current = window.BiCaptcha.init(siteKey, { action, apiBase });
      setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; client.current?.destroy(); client.current = null; if (expiry.current) clearTimeout(expiry.current); };
  }, [siteKey, action, apiBase]);
  async function execute() {
    if (!client.current || status === 'verifying') return;
    setStatus('verifying');
    callback.current('');
    await client.current.execute((token) => {
      setStatus(token ? 'success' : 'error');
      callback.current(token);
      if (expiry.current) clearTimeout(expiry.current);
      if (token) expiry.current = setTimeout(() => { setStatus('ready'); callback.current(''); }, 115000);
    });
  }
  return (
    <div className="w-full max-w-sm border border-zinc-800 bg-zinc-950/50 rounded-xl p-3 flex items-center justify-between">
      <button type="button" onClick={execute} disabled={['loading', 'verifying', 'success'].includes(status)} className="text-sm text-zinc-300 disabled:opacity-60" aria-busy={status === 'verifying'}>
        {status === 'loading' ? 'Doğrulama yükleniyor…' : status === 'verifying' ? 'Güvenlik kontrolü…' : status === 'success' ? 'Doğrulama tamamlandı' : status === 'error' ? 'Yeniden deneyin' : 'Doğrulamak için tıklayın'}
      </button>
      <span className="flex items-center gap-1 text-xs text-zinc-400" aria-live="polite">
        {status === 'verifying' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} biCaptcha
      </span>
    </div>
  );
}
