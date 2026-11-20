// Generated from src/lib/bicaptcha-client.ts; sha256=3d7833f172dffa7c737108e148ac25a3eda3e46ced6912a408bd74f41a36abb7
(() => {
    class Client {
        constructor(siteKey, options) {
            this.siteKey = siteKey;
            this.options = options;
            this.controller = new AbortController();
            this.interactions = 0;
            this.running = false;
            this.count = () => { this.interactions = Math.min(1000, this.interactions + 1); };
            this.base = new URL(options.apiBase);
            if (this.base.protocol !== 'https:' || this.base.username || this.base.password || this.base.pathname !== '/' || this.base.search || this.base.hash)
                throw Error('Invalid API base');
            if (!/^[a-zA-Z0-9_-]{1,64}$/.test(options.action) || !/^[a-zA-Z0-9_-]{1,80}$/.test(siteKey))
                throw Error('Invalid widget context');
            window.addEventListener('pointerdown', this.count, { passive: true });
            window.addEventListener('keydown', this.count, { passive: true });
        }
        destroy() {
            this.controller.abort();
            window.removeEventListener('pointerdown', this.count);
            window.removeEventListener('keydown', this.count);
        }
        async request(path, body) {
            const url = new URL(`/api/bi-captcha/${path}`, this.base);
            url.searchParams.set('siteKey', this.siteKey);
            const response = await fetch(url, { method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)]) });
            if (!response.ok)
                throw Error('Verification unavailable or rejected');
            return response.json();
        }
        async extensionPass() {
            if (!this.options.trustPassV2)
                return undefined;
            return new Promise(resolve => {
                const id = crypto.randomUUID();
                const done = (token) => { clearTimeout(timer); window.removeEventListener('message', receive); this.controller.signal.removeEventListener('abort', abort); resolve(token); };
                const abort = () => done();
                const receive = (event) => {
                    const data = event.data;
                    if (event.source !== window || event.origin !== window.location.origin || data?.type !== 'bicaptcha:trust-v2:response' || data.id !== id)
                        return;
                    const r = data.result;
                    done(r?.success === true && r.context?.siteKey === this.siteKey && r.context?.action === this.options.action && r.context?.host === window.location.hostname && typeof r.token === 'string' && r.token.length <= 2048 ? r.token : undefined);
                };
                const timer = setTimeout(() => done(), 2500);
                this.controller.signal.addEventListener('abort', abort, { once: true });
                window.addEventListener('message', receive);
                window.postMessage({ type: 'bicaptcha:trust-v2:request', id }, window.location.origin);
            });
        }
        async execute(callback) {
            if (this.running || this.controller.signal.aborted)
                return;
            this.running = true;
            try {
                const pass = await this.extensionPass();
                if (this.controller.signal.aborted)
                    return;
                if (pass) {
                    callback(pass);
                    return;
                }
                const base = { siteKey: this.siteKey, action: this.options.action };
                const c = await this.request('challenge', base);
                if (typeof c.challenge !== 'string' || c.challenge.length > 2048 || c.difficulty !== 4)
                    throw Error('Invalid challenge');
                const started = performance.now();
                const encoder = new TextEncoder();
                let nonce;
                for (let i = 0; i < 2000000; i++) {
                    if (this.controller.signal.aborted || performance.now() - started > 110000)
                        throw Error('Verification expired');
                    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${c.challenge}:${i}`)));
                    if (digest[0] === 0 && digest[1] === 0) {
                        nonce = String(i);
                        break;
                    }
                    if (i % 1000 === 0)
                        await new Promise(resolve => setTimeout(resolve, 0));
                }
                if (nonce === undefined)
                    throw Error('Please retry verification');
                const result = await this.request('verify', { ...base, challenge: c.challenge, nonce, telemetry: { webdriver: !!navigator.webdriver, duration: Math.min(120000, Math.round(performance.now() - started)), interactions: this.interactions } });
                if (result.success !== true || typeof result.token !== 'string' || result.token.length > 2048)
                    throw Error('Verification rejected');
                if (!this.controller.signal.aborted)
                    callback(result.token);
            }
            catch {
                if (!this.controller.signal.aborted)
                    callback('', 'Doğrulama başarısız; yeniden deneyin.');
            }
            finally {
                this.running = false;
            }
        }
    }
    window.BiCaptcha = { init: (siteKey, options) => new Client(siteKey, options) };
})();
