'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';

interface BiCaptchaProps {
  siteKey: string;
  onVerify: (token: string) => void;
  action?: string;
}

type WidgetStatus = 'loading' | 'waiting_click' | 'verifying' | 'success' | 'error';

export default function BiCaptcha({ siteKey, onVerify, action }: BiCaptchaProps) {
  const initialized = useRef(false);
  const biCaptchaClient = useRef<any>(null);
  
  const [status, setStatus] = useState<WidgetStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (!(window as any).BiCaptcha) {
      const script = document.createElement('script');
      script.src = '/bicaptcha.js';
      script.async = true;
      script.onload = () => initializeWidget();
      document.body.appendChild(script);
    } else {
      initializeWidget();
    }

    function initializeWidget() {
      biCaptchaClient.current = (window as any).BiCaptcha.init(siteKey);
      
      // Zero-Lag Adaptive Mode:
      // Start verification immediately if user already interacted (mouse/touch events captured during page load).
      // No artificial delay — real users pass instantly, bots get challenged.
      if (biCaptchaClient.current?.hasInteracted()) {
        executeVerification();
      } else {
        // No interaction yet: show click prompt immediately (no 1.5s blocking wait)
        setStatus('waiting_click');
        
        // Auto-verify as soon as first meaningful interaction arrives
        // Uses ref-based flag to avoid React stale closure over `status`
        let verified = false;
        const autoVerifyOnInteraction = () => {
          if (!verified && biCaptchaClient.current?.hasInteracted()) {
            verified = true;
            executeVerification();
          }
        };
        window.addEventListener('mousemove', autoVerifyOnInteraction, { once: true, passive: true });
        window.addEventListener('touchstart', autoVerifyOnInteraction, { once: true, passive: true });
      }
    }
  }, [siteKey]);

  const executeVerification = () => {
    if (!biCaptchaClient.current) return;
    
    setStatus('verifying');
    setErrorMessage('');

    biCaptchaClient.current.execute((token: string, error?: string) => {
      if (token) {
        setStatus('success');
        onVerify(token);
      } else {
        setStatus('error');
        setErrorMessage(error || 'Doğrulama başarısız');
      }
    });
  };

  const handleManualClick = () => {
    if (status === 'waiting_click' || status === 'error') {
      executeVerification();
    }
  };

  return (
    <div className="w-full max-w-sm border border-zinc-800 bg-zinc-950/50 backdrop-blur-md rounded-xl p-3 flex items-center justify-between shadow-2xl transition-all duration-300 hover:border-zinc-700 select-none">
      <div className="flex items-center gap-4">
        
        {/* Sol İkon (Durum) */}
        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
          {status === 'loading' && <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />}
          
          {status === 'waiting_click' && (
            <button 
              onClick={handleManualClick}
              type="button"
              className="w-5 h-5 rounded-[4px] border-[2px] border-zinc-500 hover:border-orange-500 hover:bg-orange-500/10 transition-all cursor-pointer flex items-center justify-center group"
            >
              <div className="w-2.5 h-2.5 rounded-sm bg-orange-500 opacity-0 group-active:opacity-100 transition-opacity" />
            </button>
          )}
          
          {status === 'verifying' && <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />}
          
          {status === 'success' && <CheckCircle2 className="w-6 h-6 text-green-500" />}
          
          {status === 'error' && (
            <button onClick={handleManualClick} type="button" className="group">
              <XCircle className="w-6 h-6 text-red-500 group-hover:scale-110 transition-transform" />
            </button>
          )}
        </div>
        
        {/* Orta Metin */}
        <div className="flex flex-col">
          <span className={`text-sm font-medium transition-colors ${
            status === 'success' ? 'text-green-400' : 
            status === 'error' ? 'text-red-400' : 
            'text-zinc-300'
          }`}>
            {status === 'loading' && 'Biyometrik analiz...'}
            {status === 'waiting_click' && 'Doğrulamak için tıklayın'}
            {status === 'verifying' && 'Güvenlik kontrolü...'}
            {status === 'success' && 'Güvenlik onaylandı'}
            {status === 'error' && 'Yeniden deneyin'}
          </span>
          {status === 'error' && errorMessage && (
            <span className="text-[10px] text-red-500/70">{errorMessage}</span>
          )}
        </div>
      </div>

      {/* Sağ Marka (Branding) */}
      <div className="flex flex-col items-end opacity-70 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1 text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5 text-orange-500" />
          <span className="text-[12px] font-bold tracking-wide">biCaptcha</span>
        </div>
        <span className="text-[9px] text-zinc-600 font-medium">Biyometrik Zırh</span>
      </div>
    </div>
  );
}
