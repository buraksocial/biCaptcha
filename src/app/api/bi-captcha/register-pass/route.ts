import { NextResponse } from 'next/server';

// Dev POC for Edge Runtime - Global Map
const globalAny: any = globalThis;
if (!globalAny.biCaptchaPasses) {
  globalAny.biCaptchaPasses = new Map<string, number>();
}

// Edge runtime removed for SQLite compatibility

export async function POST(req: Request) {
  try {
    const { publicKey } = await req.json();

    if (!publicKey) {
      return NextResponse.json({ success: false, error: 'Public Key is required' }, { status: 400 });
    }

    // In a real system: Verify WebAuthn attestation here before saving.
    // For now, we trust the extension and give it 500 quota.
    globalAny.biCaptchaPasses.set(publicKey, 500);

    return NextResponse.json({ success: true, quota: 500 });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
