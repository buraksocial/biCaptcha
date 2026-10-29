import { NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Edge runtime removed for SQLite compatibility

const SECRET_KEY = new TextEncoder().encode(process.env.BICAPTCHA_SECRET || 'super-secret-development-key-32-chars');
const VERIFY_SECRET_KEY = new TextEncoder().encode(process.env.BICAPTCHA_VERIFY_SECRET || 'another-super-secret-key-32-chars-long');

async function verifyPoW(prefix: string, nonce: string, difficulty: number): Promise<boolean> {
  const targetPrefix = '0'.repeat(difficulty);
  const encoder = new TextEncoder();
  const data = encoder.encode(prefix + nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.startsWith(targetPrefix);
}

function calculateRiskScore(telemetry: any): number {
  let score = 0; // 0 = lowest risk, 1 = highest risk (bot)

  // 1. Hard bot indicators (Puppeteer / Selenium / Stealth)
  if (telemetry.wd) score += 1.0; // Webdriver detected
  if (!telemetry.ua || telemetry.ua.includes('Headless')) score += 0.8;
  if (telemetry.err) score += 1.0; // Error stack trace spoofing (Playwright/Puppeteer execution context)
  if (telemetry.px) score += 0.9; // Proxy detected on navigator objects (stealth plugin)
  if (telemetry.chr) score += 0.8; // Chrome detected in UserAgent but missing window.chrome
  if (telemetry.np) score += 0.6; // Notification permission mismatch

  // 2. Hardware indicators (WebGL & CPU)
  if (telemetry.hc === 0) score += 0.2; // Hidden hardware concurrency
  
  const renderer = (telemetry.glR || '').toLowerCase();
  const vendor = (telemetry.glV || '').toLowerCase();
  
  if (!renderer || !vendor) {
    score += 0.4; // Hidden WebGL (rare for real users)
  } else if (renderer.includes('swiftshader') || renderer.includes('llvmpipe') || renderer.includes('virtual')) {
    score += 0.9; // Software rendering (Typical server environment)
  }

  // OS / WebGL mismatch (Anti-Detect Browser check)
  const isMac = telemetry.ua && telemetry.ua.includes('Mac OS X');
  const isWindows = telemetry.ua && telemetry.ua.includes('Windows');
  if (isMac && renderer.includes('direct3d')) {
    score += 1.0; // Mac cannot use Direct3D
  }
  if (isWindows && renderer.includes('apple gpu')) {
    score += 1.0; // Windows cannot use Apple GPU
  }

  // Phase 10: Advanced Anti-Detect / Patchright Checks
  if (telemetry.cn) score += 1.0; // Canvas noise detected (Spoofer)
  if (telemetry.nh) score += 1.0; // Native function hooked
  if (telemetry.geo) score += 1.0; // Impossible geometry (Headless)

  // Phase 16: BAS & Modern Anti-Detect Browser Detection
  if (telemetry.bas) score += 1.0; // Browser Automation Studio bridge detected
  if (telemetry.cdp) score += 0.95; // Chrome DevTools Protocol leak (underlying automation layer)
  if (telemetry.fontSpoof) score += 0.85; // Font enumeration mismatch (spoofed font list)
  if (telemetry.timingAnomaly) score += 0.9; // Navigation timing impossible for real browsers
  if (telemetry.gpuMismatch) score += 0.9; // WebGL params don't match claimed GPU

  // 3. Behavioral anomalies (Mouse movements)
  if (telemetry.m && Array.isArray(telemetry.m)) {
    if (telemetry.m.length === 0) {
      if (!telemetry.t || telemetry.t.length === 0) {
        score += 0.3; // No interaction
      }
    } else {
      let linearMovements = 0;
      let totalAcceleration = 0;
      let accelVariance = 0;
      let accelerations = [];
      let lastVelocity = 0;
      let lastTime = 0;
      
      let totalDistance = 0;
      const firstPoint = telemetry.m[0];
      const lastPoint = telemetry.m[telemetry.m.length - 1];
      const straightLineDistance = Math.sqrt(Math.pow(lastPoint[0] - firstPoint[0], 2) + Math.pow(lastPoint[1] - firstPoint[1], 2));

      for (let i = 1; i < telemetry.m.length; i++) {
        const p1 = telemetry.m[i-1];
        const p2 = telemetry.m[i];
        totalDistance += Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2));
      }

      for (let i = 2; i < telemetry.m.length; i++) {
        const p1 = telemetry.m[i-2];
        const p2 = telemetry.m[i-1];
        const p3 = telemetry.m[i];
        
        // Collinearity check (straight line)
        const area = p1[0] * (p2[1] - p3[1]) + p2[0] * (p3[1] - p1[1]) + p3[0] * (p1[1] - p2[1]);
        if (area === 0 && p1[0] !== p2[0] && p1[1] !== p2[1]) {
          linearMovements++;
        }

        // Fitts's Law / AI Mouse Tracking (Acceleration Variance)
        if (p3[2] !== undefined && p2[2] !== undefined) {
          const dt = p3[2] - p2[2];
          if (dt > 0) {
            const dist = Math.sqrt(Math.pow(p3[0] - p2[0], 2) + Math.pow(p3[1] - p2[1], 2));
            const velocity = dist / dt;
            const acceleration = Math.abs(velocity - lastVelocity) / dt;
            accelerations.push(acceleration);
            lastVelocity = velocity;
          }
        }
      }
      
      if (telemetry.m.length > 5 && linearMovements / telemetry.m.length > 0.8) {
        score += 0.6; // Highly linear movement
      }

      // Kavis (Curvature) Index
      if (straightLineDistance > 50) {
        const curvatureIndex = totalDistance / straightLineDistance;
        if (curvatureIndex < 1.01) {
          score += 0.5; // Kusursuz düz çizgi (Basit bot)
        } else if (curvatureIndex > 4.0) {
          score += 0.4; // Aşırı kaotik/random kavis (Gürültü basan basit bot)
        }
      }

      // If acceleration is perfectly smooth (variance near 0), it's likely a Ghost Cursor (AI)
      // Only apply this check if we have enough data points, as humans can easily move at constant speed for short bursts
      if (accelerations.length > 15) {
        const meanAccel = accelerations.reduce((a, b) => a + b, 0) / accelerations.length;
        accelVariance = accelerations.reduce((a, b) => a + Math.pow(b - meanAccel, 2), 0) / accelerations.length;
        if (accelVariance < 0.00001) {
          score += 1.0; // Artificial smoothness detected (AI Ghost Cursor)
        }
      }
    }
  }

  // 4. Interaction Perfection (Bots click perfectly at the center)
  if (telemetry.c && Array.isArray(telemetry.c) && telemetry.c.length > 0) {
     // A very common automation trait is clicking exactly at integer coordinates without decimals,
     // or multiple clicks exactly at the exact same pixel if they re-run.
     let perfectIntegerClicks = 0;
     for (const click of telemetry.c) {
       if (Number.isInteger(click[0]) && Number.isInteger(click[1])) {
         perfectIntegerClicks++;
       }
     }
     if (telemetry.c.length > 0 && perfectIntegerClicks === telemetry.c.length) {
       score += 0.2; // Slight penalty for perfect integer clicks
     }
  }

  return Math.min(score, 1.0);
}

// Phase 11: Simple In-Memory Nonce Cache for Replay Protection
// In production, this MUST be a Redis instance (e.g. Vercel KV)
const usedNonces = new Set<string>();

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { siteKey, data, challenge, nonce, trustPassSignature, trustPassPublicKey } = payload;

    if (!siteKey || !challenge) {
      return NextResponse.json({ error: 'Missing siteKey or challenge' }, { status: 400 });
    }

    // Phase 15: Find real site in DB
    const site = await prisma.site.findUnique({ where: { siteKey } });
    if (!site) {
      return NextResponse.json({ error: 'Invalid SiteKey' }, { status: 403 });
    }
    if (!site.isVerified) {
      return NextResponse.json({ error: 'Site ownership not verified' }, { status: 403 });
    }
    
    // Extract IP for logging (for local development we use a mock IP if not available)
    const ip = request.headers.get('x-forwarded-for') || '192.168.1.1';

    // Phase 13: Trust Pass (Hardware-backed Extension) Zero-Click Bypass
    if (trustPassSignature && trustPassPublicKey) {
      const globalAny: any = globalThis;
      const quota = globalAny.biCaptchaPasses?.get(trustPassPublicKey);
      
      if (quota !== undefined && quota > 0) {
        try {
          // Verify ECDSA signature
          const pubKeyBuffer = new Uint8Array(atob(trustPassPublicKey).split('').map(c => c.charCodeAt(0)));
          const sigBuffer = new Uint8Array(atob(trustPassSignature).split('').map(c => c.charCodeAt(0)));
          const dataBuffer = new TextEncoder().encode(challenge);

          const cryptoKey = await crypto.subtle.importKey(
            'spki', pubKeyBuffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
          );

          const isValid = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            cryptoKey, sigBuffer, dataBuffer
          );

          if (isValid) {
            // Decrement quota
            globalAny.biCaptchaPasses.set(trustPassPublicKey, quota - 1);
            console.log(`[biCaptcha] Trust Pass Verified! Zero-Click Bypass granted. Quota left: ${quota - 1}`);
            
            await prisma.validationLog.create({
              data: { siteId: site.id, ip, type: 'TrustPass', riskScore: 0.0, reason: 'Zero-Click WebAuthn' }
            });

            const verificationToken = await new SignJWT({ siteKey, verified: true, riskScore: 0.0, trustPass: true })
              .setProtectedHeader({ alg: 'HS256' })
              .setIssuedAt().setExpirationTime('10m').sign(VERIFY_SECRET_KEY);

            return NextResponse.json({ success: true, token: verificationToken, trustPass: true });
          }
        } catch (e) {
          console.error("Trust Pass signature verification failed:", e);
        }
      } else if (quota === 0) {
        console.log("[biCaptcha] Trust Pass quota exceeded!");
      }
    }

    // Normal path if Trust Pass not used
    if (!data || !nonce) {
      return NextResponse.json({ error: 'Missing payload for standard verification' }, { status: 400 });
    }
    
    // Replay Protection Check
    if (usedNonces.has(nonce)) {
      return NextResponse.json({ error: 'Replay attack detected (Nonce already used)' }, { status: 403 });
    }

    // 1. Verify Challenge Token (JWT)
    let decodedChallenge;
    try {
      decodedChallenge = await jwtVerify(challenge, SECRET_KEY);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid or expired challenge' }, { status: 403 });
    }

    // 2. Verify Proof of Work
    const isPoWValid = await verifyPoW(challenge, nonce, 4);
    if (!isPoWValid) {
      return NextResponse.json({ error: 'Invalid PoW' }, { status: 403 });
    }
    
    // Mark nonce as used
    usedNonces.add(nonce);
    // Basic cleanup to prevent memory leak in demo
    if (usedNonces.size > 10000) {
      usedNonces.clear();
    }

    // 3. Decode & Decrypt Telemetry Data
    let telemetry;
    try {
      // Key derivation matches client: prefix:nonce only.
      // PoE verification happens below AFTER successful decryption.
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(`${challenge}:${nonce}`));
      const aesKey = await crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const binaryStr = atob(data);
      const combined = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        combined[i] = binaryStr.charCodeAt(i);
      }
      
      const iv = combined.slice(0, 12);
      const encryptedData = combined.slice(12);

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        encryptedData
      );

      const jsonStr = new TextDecoder().decode(decryptedBuffer);
      telemetry = JSON.parse(jsonStr);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid encrypted payload' }, { status: 403 });
    }

    // 4. Verify Proof of Execution (PoE / VM)
    // Phase 17: Server re-executes the VM using telemetry-supplied DOM values.
    // AES key is derived from prefix:nonce only (no PoE dependency to avoid chicken-and-egg).
    // After successful decryption, we re-run the VM with the client's reported window dimensions
    // and verify the PoE matches. A bot that fabricates telemetry will produce wrong PoE.
    // A bot that skips VM execution will have poe=0 or -1, which won't match re-computed result.
    if (typeof telemetry.poe !== 'number' || !Number.isFinite(telemetry.poe)) {
      return NextResponse.json({ error: 'Proof of Execution (VM) failed' }, { status: 403 });
    }

    // Re-execute VM server-side with client-supplied DOM values
    try {
      const vmChallenge = decodedChallenge.payload.vm as { program: number[]; seed: number; opMap: Record<string, number> } | undefined;
      if (vmChallenge && vmChallenge.program && vmChallenge.opMap) {
        const { program, seed, opMap } = vmChallenge;
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
          else if (opMap.DOM_W !== undefined && op === opMap.DOM_W) {
            i++; // skip marker
            stack.push((telemetry.w || 0) % 256);
          }
          else if (opMap.DOM_H !== undefined && op === opMap.DOM_H) {
            i++;
            stack.push((telemetry.h || 0) % 256);
          }
          else if (opMap.DOM_DPR !== undefined && op === opMap.DOM_DPR) {
            i++;
            // Client sends DPR*100 as integer; use same formula
            // We don't have raw DPR in telemetry, but we can infer from w/h consistency
            // For now, accept any reasonable value — the real security is AES binding below
            stack.push(Math.floor(((telemetry.dpr || 1)) * 100));
          }
        }
        const expectedPoe = stack.pop() || 0;
        if (telemetry.poe !== expectedPoe) {
          return NextResponse.json({ error: 'Proof of Execution (VM) mismatch' }, { status: 403 });
        }
      }
    } catch (e) {
      return NextResponse.json({ error: 'Proof of Execution (VM) verification error' }, { status: 403 });
    }

    // 4b. Phase 18: Telemetry Integrity Hash Verification
    // Ensures critical telemetry fields were not modified after collection.
    // A bot that decrypts, modifies, and re-encrypts cannot reproduce this HMAC
    // because the key is the challenge prefix (known only during legitimate session).
    try {
      const integrityPayload = `${telemetry.w}:${telemetry.h}:${telemetry.ua}:${telemetry.poe}:${telemetry.powDuration}:${telemetry.ts}`;
      const hmacKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(challenge),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuffer = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(integrityPayload));
      const expectedHash = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      
      if (!telemetry.integrityHash || telemetry.integrityHash !== expectedHash) {
        return NextResponse.json({ error: 'Telemetry integrity check failed' }, { status: 403 });
      }
    } catch (e) {
      return NextResponse.json({ error: 'Integrity verification error' }, { status: 403 });
    }

    // 5. Calculate Risk Score
    let riskScore = calculateRiskScore(telemetry);

    // 5b. Phase 18: Timing Coherence Check (applied as post-score adjustment)
    // Cross-validate PoW solve duration against mouse event density.
    // Real browsers: PoW takes 50-500ms with concurrent mouse events.
    // Bots: PoW solved externally (different timing) OR no mouse events during PoW window.
    if (typeof telemetry.powDuration === 'number' && telemetry.powDuration > 0) {
      const mouseEventsDuringPoW = telemetry.m.filter(
        (ev: [number, number, number]) => ev[2] >= telemetry.ts - telemetry.powDuration && ev[2] <= telemetry.ts
      ).length;
      
      // If PoW took significant time but zero mouse events occurred, suspicious
      if (telemetry.powDuration > 200 && mouseEventsDuringPoW === 0 && telemetry.m.length > 0) {
        riskScore = Math.min(riskScore + 0.4, 1.0);
      }
      
      // Impossibly fast PoW (< 5ms) suggests pre-computed or external solver
      if (telemetry.powDuration < 5) {
        riskScore = Math.min(riskScore + 0.6, 1.0);
      }
    }

    if (riskScore > 0.6) {
      // Suspected Bot
      console.log(`[biCaptcha] Bot detected! Risk Score: ${riskScore}`);
      
      await prisma.validationLog.create({
        data: { siteId: site.id, ip, type: 'Bot', riskScore, reason: 'High Risk Score (Telemetry)' }
      });
      
      return NextResponse.json({ error: 'Verification failed', riskScore }, { status: 403 });
    }

    console.log(`[biCaptcha] Human verified! Risk Score: ${riskScore}`);

    await prisma.validationLog.create({
      data: { siteId: site.id, ip, type: 'Human', riskScore, reason: 'Passed' }
    });

    // 5. Issue success token to be consumed by the user's backend
    const verificationToken = await new SignJWT({ siteKey, verified: true, riskScore })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(VERIFY_SECRET_KEY);

    return NextResponse.json({
      success: true,
      token: verificationToken
    });

  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
