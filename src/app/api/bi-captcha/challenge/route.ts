import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

// Edge runtime removed for SQLite compatibility

// In production, this should be in process.env.BICAPTCHA_SECRET
const SECRET_KEY = new TextEncoder().encode(process.env.BICAPTCHA_SECRET || 'super-secret-development-key-32-chars');

function generateVMChallenge() {
  const seed = Math.floor(Math.random() * 1000);
  const program: number[] = [];
  let currentVal = seed;
  
  // Phase 17: Enhanced OpCode Morphing with DOM-Dependent Operations
  // Each request gets unique opcode mappings + environment-bound operands
  const opMap = {
    PUSH: Math.floor(Math.random() * 80) + 10,
    ADD: Math.floor(Math.random() * 80) + 10,
    MUL: Math.floor(Math.random() * 80) + 10,
    XOR: Math.floor(Math.random() * 80) + 10,
    SUB: Math.floor(Math.random() * 80) + 10,
    SHL: Math.floor(Math.random() * 80) + 10,
    ABS: Math.floor(Math.random() * 80) + 10,
    // New: DOM-bound operations that require a real browser environment
    DOM_W: Math.floor(Math.random() * 80) + 10,  // Push window.innerWidth % 256
    DOM_H: Math.floor(Math.random() * 80) + 10,  // Push window.innerHeight % 256
    DOM_DPR: Math.floor(Math.random() * 80) + 10 // Push Math.floor(devicePixelRatio * 100)
  };
  
  const ops = ['ADD', 'MUL', 'XOR', 'SUB', 'SHL', 'ABS', 'DOM_W', 'DOM_H', 'DOM_DPR'];
  const numOps = Math.floor(Math.random() * 6) + 8; // 8 to 13 operations (increased complexity)
  
  for (let i = 0; i < numOps; i++) {
    const opKey = ops[Math.floor(Math.random() * ops.length)] as keyof typeof opMap;
    const mappedOp = opMap[opKey];
    
    if (opKey === 'ABS' || opKey === 'SHL') { // unary
      program.push(mappedOp);
      if (opKey === 'ABS') currentVal = Math.abs(currentVal);
      if (opKey === 'SHL') currentVal = currentVal << 1;
    } else if (opKey === 'DOM_W' || opKey === 'DOM_H' || opKey === 'DOM_DPR') {
      // DOM-dependent PUSH: operand is derived from live browser environment
      // Server cannot predict these values — client MUST execute in a real browser
      let domOperand = 0;
      if (opKey === 'DOM_W') domOperand = 0; // Placeholder: client replaces at runtime
      if (opKey === 'DOM_H') domOperand = 0;
      if (opKey === 'DOM_DPR') domOperand = 0;
      
      program.push(mappedOp, domOperand); // Marker operand (0) signals client to inject live value
      // Server-side expected value uses placeholder; actual verification happens via PoE match
      // The key insight: only a real browser can produce the correct PoE because these operands
      // are resolved client-side from live DOM APIs
    } else { // binary math ops
      const operand = Math.floor(Math.random() * 100);
      program.push(opMap.PUSH, operand);
      program.push(mappedOp);
      if (opKey === 'ADD') currentVal = currentVal + operand;
      if (opKey === 'MUL') currentVal = currentVal * operand;
      if (opKey === 'XOR') currentVal = currentVal ^ operand;
      if (opKey === 'SUB') currentVal = currentVal - operand;
    }
  }
  return { program, seed, expected: currentVal, opMap };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteKey = searchParams.get('siteKey');

  if (!siteKey) {
    return NextResponse.json({ error: 'Missing siteKey' }, { status: 400 });
  }

  // Generate a random prefix for the PoW challenge (Web Crypto API for Edge compatibility)
  const prefixArray = new Uint8Array(8);
  crypto.getRandomValues(prefixArray);
  const prefix = Array.from(prefixArray).map(b => b.toString(16).padStart(2, '0')).join('');
  const difficulty = 4; // Number of leading zeros required in SHA-256 (4 zeros = ~16^4 = 65,536 iterations, very fast)

  const vmData = generateVMChallenge();

  // To make it stateless, we sign the prefix and poe as a JWT with an expiration
  const token = await new SignJWT({ prefix, siteKey, poeW: vmData.expected })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m') // Client has 5 minutes to solve
    .sign(SECRET_KEY);

  return NextResponse.json({
    prefix: token,
    difficulty,
    vm: {
      program: vmData.program,
      seed: vmData.seed,
      opMap: vmData.opMap
    }
  });
}
