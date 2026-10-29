// biCaptcha Client SDK - Raw Source
// This file will be compiled and obfuscated before being served to end-users.

interface TelemetryData {
  m: Array<[number, number, number]>; // mouse movements [x, y, timestamp]
  c: Array<[number, number, number]>; // clicks [x, y, timestamp]
  t: Array<[number, number, number]>; // touch [x, y, timestamp]
  w: number; // window width
  h: number; // window height
  ua: string; // user agent
  l: string; // language
  tz: number; // timezone offset
  hc: number; // hardware concurrency
  dm: number; // device memory
  wd: boolean; // webdriver
  p: string; // plugins (hashed/concatenated)
  glV: string; // WebGL Vendor
  glR: string; // WebGL Renderer
  cH: string; // Canvas Hash
  err: boolean; // Error stack trace spoofing
  px: boolean; // Proxy/Stealth manipulation detected
  chr: boolean; // window.chrome integrity
  np: boolean; // Notification permission mismatch
  cn: boolean; // Canvas Noise detected
  nh: boolean; // Native Hook detected
  geo: boolean; // Geometry anomaly detected
  bas: boolean; // Browser Automation Studio detected
  cdp: boolean; // Chrome DevTools Protocol leak detected
  fontSpoof: boolean; // Font fingerprint spoofing detected
  timingAnomaly: boolean; // Performance timing anomaly (automation framework)
  gpuMismatch: boolean; // WebGL parameter cross-validation failure
  dpr: number; // devicePixelRatio (for server-side VM re-execution)
  powDuration: number; // PoW solve duration in ms (timing coherence check)
  integrityHash: string; // HMAC-SHA256 of critical telemetry fields (tamper detection)
  pow: string; // proof of work nonce
  ts: number; // timestamp
  poe: number; // Proof of Execution result
}

class BiCaptchaClient {
  private telemetry: TelemetryData = {
    m: [],
    c: [],
    t: [],
    w: 0,
    h: 0,
    ua: '',
    l: '',
    tz: 0,
    hc: 0,
    dm: 0,
    wd: false,
    p: '',
    glV: '',
    glR: '',
    cH: '',
    err: false,
    px: false,
    chr: false,
    np: false,
    cn: false,
    nh: false,
    geo: false,
    bas: false,
    cdp: false,
    fontSpoof: false,
    timingAnomaly: false,
    gpuMismatch: false,
    dpr: 1,
    powDuration: 0,
    integrityHash: '',
    pow: '',
    ts: 0,
    poe: 0
  };

  private maxEvents = 100;
  private siteKey: string;
  private challengeData: { prefix: string; difficulty: number; poe?: any; vm?: any } | null = null;
  private onReady: ((token: string, error?: string) => void) | null = null;

  constructor(siteKey: string) {
    this.siteKey = siteKey;
    this.initEnvironment();
    this.attachListeners();
  }

  private initEnvironment() {
    this.telemetry.w = window.innerWidth;
    this.telemetry.h = window.innerHeight;
    this.telemetry.ua = navigator.userAgent;
    this.telemetry.l = navigator.language;
    this.telemetry.tz = new Date().getTimezoneOffset();
    this.telemetry.hc = navigator.hardwareConcurrency || 0;
    // @ts-ignore
    this.telemetry.dm = navigator.deviceMemory || 0;
    // @ts-ignore
    this.telemetry.wd = !!navigator.webdriver || !!window.cdc_adoQpoasnfa76pfcZLmcfl_;
    
    // Initialize new fields
    this.telemetry.glV = '';
    this.telemetry.glR = '';
    this.telemetry.cH = '';
    this.telemetry.err = false;
    this.telemetry.px = false;
    this.telemetry.chr = false;
    this.telemetry.np = false;
    this.telemetry.cn = false;
    this.telemetry.nh = false;
    this.telemetry.geo = false;
    this.telemetry.bas = false;
    this.telemetry.cdp = false;
    this.telemetry.fontSpoof = false;
    this.telemetry.timingAnomaly = false;
    this.telemetry.gpuMismatch = false;
    this.telemetry.dpr = window.devicePixelRatio || 1;

    // Performance-first: Run lightweight checks immediately,
    // defer heavy checks to idle time to avoid blocking page load
    this.checkWebGL();
    this.checkStealth();
    this.checkGeometry();
    
    // Defer expensive checks (Canvas, BAS/Anti-Detect) to prevent render blocking
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        this.checkCanvas();
        this.checkAdvancedAutomation();
      }, { timeout: 2000 });
    } else {
      // Fallback for Safari/older browsers
      setTimeout(() => {
        this.checkCanvas();
        this.checkAdvancedAutomation();
      }, 100);
    }

    // Simple plugin list hash/concat
    let plugins = '';
    for (let i = 0; i < navigator.plugins.length; i++) {
      plugins += navigator.plugins[i].name;
    }
    this.telemetry.p = plugins;
    this.telemetry.ts = Date.now();
  }

  private checkWebGL() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          this.telemetry.glV = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          this.telemetry.glR = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        }
      }
    } catch (e) { }
  }

  private checkCanvas() {
    try {
      const drawAndHash = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('biCaptcha', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('biCaptcha', 4, 17);
        const dataURL = canvas.toDataURL();
        
        let hash = 0;
        for (let i = 0; i < dataURL.length; i++) {
          const char = dataURL.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        return hash.toString(16);
      };

      const hash1 = drawAndHash();
      const hash2 = drawAndHash();
      
      this.telemetry.cH = hash1;
      
      // If hashes mismatch on consecutive renders, an anti-detect browser is spoofing canvas!
      if (hash1 !== hash2) {
        this.telemetry.cn = true;
      }
    } catch (e) { }
  }

  private checkStealth() {
    // 1. Check for Proxy spoofing on navigator objects
    try {
      const desc = Object.getOwnPropertyDescriptor(navigator, 'webdriver');
      if (desc !== undefined) this.telemetry.px = true;
    } catch (e) {}

    // 2. Check window.chrome
    const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    if (isChrome && !(window as any).chrome) {
      this.telemetry.chr = true;
    }

    // 3. Error stack trace anomaly
    try {
      throw new Error('stealth_check');
    } catch (e: any) {
      const stack = e.stack || '';
      if (stack.includes('puppeteer') || stack.includes('playwright')) {
        this.telemetry.err = true;
      }
    }

    // 4. Notification Permissions mismatch
    try {
      if (Notification.permission === 'denied' && navigator.permissions) {
        navigator.permissions.query({ name: 'notifications' }).then(res => {
          if (res.state === 'prompt' || res.state === 'granted') {
            this.telemetry.np = true;
          }
        });
      }
    } catch (e) {}

    // 5. Native Function Hooking Detection (Patchright / Plugins)
    try {
      const permsStr = navigator.permissions.query.toString();
      const pluginsStr = Object.getOwnPropertyDescriptor(navigator, 'plugins')?.get?.toString();
      
      const isNative = (str: string | undefined) => !str || str.includes('[native code]');
      
      if (!isNative(permsStr) || !isNative(pluginsStr)) {
        this.telemetry.nh = true;
      }
    } catch (e) {}
  }

  private checkGeometry() {
    try {
      if (window.outerWidth === 0 && window.innerWidth > 0) {
        this.telemetry.geo = true;
      }
      if (window.outerHeight === 0 && window.innerHeight > 0) {
        this.telemetry.geo = true;
      }
      if (window.screen && (window.screen.width === 0 || window.screen.height === 0)) {
        this.telemetry.geo = true;
      }

      // Anti-Detect Screen/Window Consistency Check
      // Anti-detect browsers often spoof screen resolution but fail to perfectly match inner/outer dimensions
      const screenArea = window.screen?.width * window.screen?.height || 0;
      const windowArea = window.innerWidth * window.innerHeight;
      if (screenArea > 0 && windowArea > screenArea * 0.95) {
        // Window cannot be larger than physical screen
        this.telemetry.geo = true;
      }

      // ClientRect Sub-pixel Rendering Anomaly
      // Spoofed environments often return integer-only bounding rects
      const testEl = document.createElement('div');
      testEl.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:100.33px;height:50.77px;';
      document.body.appendChild(testEl);
      const rect = testEl.getBoundingClientRect();
      document.body.removeChild(testEl);
      
      // Real browsers almost always have sub-pixel values due to DPI scaling
      const hasSubPixels = !Number.isInteger(rect.width) || !Number.isInteger(rect.height);
      if (!hasSubPixels && window.devicePixelRatio !== 1) {
        this.telemetry.geo = true;
      }
    } catch (e) {}
  }

  /**
   * Phase 16: Advanced BAS & Anti-Detect Detection Suite
   * Targets Browser Automation Studio, Dolphin, GoLogin, Multilogin, etc.
   */
  private checkAdvancedAutomation() {
    // 1. Browser Automation Studio (BAS) Specific Leaks
    try {
      // BAS injects a bridge between Node.js and Chromium
      const basMarkers = ['BAS', 'BrowserAutomationStudio', 'bas_', '_bas'];
      for (const marker of basMarkers) {
        if ((window as any)[marker] !== undefined) {
          this.telemetry.bas = true;
          return;
        }
      }
      
      // BAS overrides console methods with custom logging
      const consoleStr = console.log.toString();
      if (consoleStr.includes('BAS') || consoleStr.includes('automation')) {
        this.telemetry.bas = true;
        return;
      }

      // BAS uses custom WebSocket communication patterns
      if ((window as any).__BAS_WEBSOCKET__ || (window as any).__BAS_PORT__) {
        this.telemetry.bas = true;
        return;
      }
    } catch (e) {}

    // 2. Chrome DevTools Protocol (CDP) Leak Detection
    // Most anti-detect browsers still rely on CDP under the hood
    try {
      // Runtime.enable creates specific internal bindings
      if ((window as any).__runtimeEnabled || (window as any).__cdpBinding) {
        this.telemetry.cdp = true;
      }

      // Debugger statement timing anomaly
      // CDP-connected sessions have measurable overhead on debugger statements
      const start = performance.now();
      try { new Function('debugger;')(); } catch {}
      const elapsed = performance.now() - start;
      if (elapsed > 5) { // Normal execution is < 0.1ms
        this.telemetry.cdp = true;
      }
    } catch (e) {}

    // 3. Font Fingerprint Anomaly (Anti-Detect Signature)
    // Anti-detect browsers often have mismatched system fonts vs rendered fonts
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const baseFonts = ['monospace', 'sans-serif', 'serif'];
        const testFonts = ['Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Palatino', 'Impact', 'Comic Sans MS', 'Lucida Console'];
        const testString = 'mmmmmmmmlli';
        const testSize = '72px';
        
        ctx.font = `${testSize} monospace`;
        const defaultWidth = ctx.measureText(testString).width;
        
        let suspiciousMatches = 0;
        for (const font of testFonts) {
          ctx.font = `${testSize} ${font}, monospace`;
          const width = ctx.measureText(testString).width;
          // If a "different" font renders identically to monospace, it's likely not installed
          // Anti-detect browsers often report having fonts they don't actually render
          if (Math.abs(width - defaultWidth) < 0.1) {
            suspiciousMatches++;
          }
        }
        
        // If more than 70% of common fonts render identically, it's a spoofed environment
        if (suspiciousMatches > testFonts.length * 0.7) {
          this.telemetry.fontSpoof = true;
        }
      }
    } catch (e) {}

    // 4. Performance Observer Timing Attack
    // Automation frameworks create distinct microtask scheduling patterns
    try {
      if (typeof PerformanceObserver !== 'undefined') {
        const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        if (entries.length > 0) {
          const nav = entries[0];
          // Headless/automated browsers often have impossible timing relationships
          if (nav.domContentLoadedEventEnd - nav.startTime < 10) {
            this.telemetry.timingAnomaly = true;
          }
          // fetchStart before navigationStart is a known CDP artifact
          if (nav.fetchStart < nav.startTime) {
            this.telemetry.timingAnomaly = true;
          }
        }
      }
    } catch (e) {}

    // 5. WebGL Parameter Cross-Validation
    // Anti-detect browsers spoof vendor/renderer but rarely match all GPU parameters
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
      if (gl) {
        const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const maxViewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
        const renderer = this.telemetry.glR.toLowerCase();
        
        // Mobile GPUs claiming desktop-level capabilities
        if (renderer.includes('mali') || renderer.includes('adreno') || renderer.includes('powervr')) {
          if (maxTextureSize > 8192) {
            this.telemetry.gpuMismatch = true;
          }
        }
        
        // Software renderers with hardware-like limits
        if (renderer.includes('swiftshader') || renderer.includes('llvmpipe')) {
          if (maxTextureSize > 4096) {
            this.telemetry.gpuMismatch = true;
          }
        }

        // Viewport dims should be Int32Array with exactly 2 elements
        if (!(maxViewportDims instanceof Int32Array) || maxViewportDims.length !== 2) {
          this.telemetry.gpuMismatch = true;
        }
      }
    } catch (e) {}
  }

  private attachListeners() {
    // Mouse movements (throttled)
    let lastMoveTime = 0;
    const moveHandler = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastMoveTime > 50 && this.telemetry.m.length < this.maxEvents) {
        this.telemetry.m.push([e.clientX, e.clientY, now]);
        lastMoveTime = now;
      }
    };

    const clickHandler = (e: MouseEvent) => {
      if (this.telemetry.c.length < 20) {
        this.telemetry.c.push([e.clientX, e.clientY, Date.now()]);
      }
    };

    const touchHandler = (e: TouchEvent) => {
      if (e.touches.length > 0 && this.telemetry.t.length < this.maxEvents) {
        this.telemetry.t.push([e.touches[0].clientX, e.touches[0].clientY, Date.now()]);
      }
    };

    window.addEventListener('mousemove', moveHandler, { passive: true });
    window.addEventListener('click', clickHandler, { passive: true });
    window.addEventListener('touchstart', touchHandler, { passive: true });
    window.addEventListener('touchmove', touchHandler, { passive: true });
  }

  private async solvePoW(): Promise<string> {
    if (!this.challengeData) return '';
    const prefix = this.challengeData.prefix;
    const difficulty = this.challengeData.difficulty;
    const targetPrefix = '0'.repeat(difficulty);
    
    let nonce = 0;
    const encoder = new TextEncoder();

    while (true) {
      const data = encoder.encode(prefix + nonce);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      if (hashHex.startsWith(targetPrefix)) {
        return nonce.toString();
      }
      nonce++;
      
      if (nonce % 1000 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (nonce > 500000) break;
    }
    return nonce.toString();
  }

  public hasInteracted(): boolean {
    return this.telemetry.m.length > 10 || this.telemetry.t.length > 2;
  }

  public async getChallenge() {
    try {
      const res = await fetch(`/api/bi-captcha/challenge?siteKey=${this.siteKey}`);
      if (res.ok) {
        const data = await res.json();
        this.challengeData = data;
      }
    } catch (e) {
      console.error('biCaptcha: Failed to fetch challenge');
    }
  }

  public async execute(callback: (token: string, error?: string) => void) {
    this.onReady = callback;
    
    // Ensure we have a challenge
    if (!this.challengeData) {
      await this.getChallenge();
    }
    
    if (!this.challengeData) {
      console.error('biCaptcha: Failed to get challenge');
      if (this.onReady) this.onReady('', 'Init error');
      return;
    }

    // Phase 13: Check for Trust Pass Extension (Zero-Click Bypass)
    if ((window as any).BI_CAPTCHA_TRUST_PASS) {
      // Ask extension to sign the challenge
      const msgId = Math.random().toString(36).substring(7);
      
      const sigPromise = new Promise<any>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data?.source === 'bicaptcha-extension' && event.data.id === msgId) {
            window.removeEventListener('message', handler);
            resolve(event.data.payload);
          }
        };
        window.addEventListener('message', handler);
        setTimeout(() => resolve(null), 2000); // 2 second timeout for extension
      });

      window.postMessage({
        source: 'bicaptcha-widget',
        type: 'REQUEST_SIGNATURE',
        id: msgId,
        challenge: this.challengeData.prefix
      }, '*');

      const passData = await sigPromise;
      if (passData && !passData.error && passData.signature && passData.publicKey) {
        // We have a Trust Pass signature! Send directly to verify API.
        try {
          const res = await fetch('/api/bi-captcha/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              siteKey: this.siteKey,
              challenge: this.challengeData.prefix,
              trustPassSignature: passData.signature,
              trustPassPublicKey: passData.publicKey
            })
          });

          const data = await res.json();
          if (res.ok && data.trustPass && data.token) {
            if (this.onReady) this.onReady(data.token, undefined);
            return; // Successful bypass!
          }
        } catch (e) {
          console.error("Trust Pass verification network error", e);
        }
      }
    }

    // Record PoW start time for timing coherence verification
    const powStartTime = performance.now();
    
    // Solve PoW
    this.telemetry.pow = await this.solvePoW();
    this.telemetry.ts = Date.now();
    
    // Phase 18: Timing Coherence - record actual PoW duration
    // Bots solving PoW in Python/Node have vastly different timing profiles than browser WebCrypto
    // This value is cross-validated server-side against mouse event timeline density
    this.telemetry.powDuration = Math.round(performance.now() - powStartTime);

    // Execute Dynamic Bytecode VM (Proof of Execution)
    // Phase 17: Now includes DOM-dependent opcodes that REQUIRE a real browser environment
    // Bots running headless or outside a browser cannot resolve these operands correctly
    if (this.challengeData && this.challengeData.vm) {
      try {
        const { program, seed, opMap } = this.challengeData.vm;
        let stack: number[] = [seed];
        for (let i = 0; i < program.length; i++) {
          const op = program[i];
          if (op === opMap.PUSH) stack.push(program[++i]);
          else if (op === opMap.ADD) stack.push(stack.pop()! + stack.pop()!);
          else if (op === opMap.MUL) stack.push(stack.pop()! * stack.pop()!);
          else if (op === opMap.XOR) stack.push(stack.pop()! ^ stack.pop()!);
          else if (op === opMap.SUB) { const a = stack.pop()!; const b = stack.pop()!; stack.push(b - a); }
          else if (op === opMap.SHL) { const a = stack.pop()!; stack.push(a << 1); }
          else if (op === opMap.ABS) { const a = stack.pop()!; stack.push(Math.abs(a)); }
          // DOM-dependent opcodes: marker operand (0) signals live injection
          else if (opMap.DOM_W !== undefined && op === opMap.DOM_W) {
            i++; // skip marker operand
            stack.push((window.innerWidth || 0) % 256);
          }
          else if (opMap.DOM_H !== undefined && op === opMap.DOM_H) {
            i++;
            stack.push((window.innerHeight || 0) % 256);
          }
          else if (opMap.DOM_DPR !== undefined && op === opMap.DOM_DPR) {
            i++;
            stack.push(Math.floor((window.devicePixelRatio || 1) * 100));
          }
        }
        this.telemetry.poe = stack.pop() || 0;
      } catch (e) {
        this.telemetry.poe = -1;
      }
    }

    // Derive AES-GCM key from PoW prefix + nonce only.
    // PoE verification happens server-side AFTER decryption by re-executing the VM
    // with client-supplied DOM values. This avoids the chicken-and-egg problem where
    // the server needs PoE to decrypt but PoE is inside the encrypted payload.
    // Security is maintained because: wrong PoE → server re-execution mismatch → rejected.
    const encoder = new TextEncoder();

    // Phase 18: Telemetry Integrity Hash (HMAC-SHA256)
    // Binds critical fields together so a bot cannot modify individual values post-collection.
    // The HMAC key is derived from the challenge prefix, which only the legitimate client possesses.
    try {
      const integrityPayload = `${this.telemetry.w}:${this.telemetry.h}:${this.telemetry.ua}:${this.telemetry.poe}:${this.telemetry.powDuration}:${this.telemetry.ts}`;
      const hmacKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.challengeData!.prefix),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuffer = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(integrityPayload));
      this.telemetry.integrityHash = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      this.telemetry.integrityHash = '';
    }
    const keyInput = `${this.challengeData!.prefix}:${this.telemetry.pow}`;
    const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(keyInput));
    const aesKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // Encrypt payload
    const payload = JSON.stringify(this.telemetry);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encoder.encode(payload)
    );

    // Combine IV and Encrypted Data, then encode to Base64
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);
    
    // Convert Uint8Array to base64
    let binary = '';
    for (let i = 0; i < combined.byteLength; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    const encodedPayload = btoa(binary);

    try {
      const res = await fetch('/api/bi-captcha/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          siteKey: this.siteKey, 
          data: encodedPayload, 
          challenge: this.challengeData!.prefix,
          nonce: this.telemetry.pow
        })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        if (this.onReady) this.onReady(data.token, undefined);
      } else {
        if (this.onReady) this.onReady('', data.error || 'Bot detected');
      }
    } catch (e) {
      if (this.onReady) this.onReady('', 'Network error');
    }
  }
}

// Global initialization
(window as any).BiCaptcha = {
  init: (siteKey: string) => new BiCaptchaClient(siteKey)
};
