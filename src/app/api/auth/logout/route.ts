import { NextResponse } from 'next/server';
import { csrf, failure } from '@/lib/security/http';
import { sessionCookie } from '@/lib/security/auth';
import { requireUser } from '@/lib/security/auth';
import { revoke } from '@/lib/security/trust-v2';
export async function POST(request: Request) {
  try {
    csrf(request);
    if (process.env.BICAPTCHA_STATE === 'redis') {
      const user = await requireUser(request);
      await revoke(user.id, 'account');
    }
    const response = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set('bicaptcha_session', '', { ...sessionCookie(), maxAge: 0, expires: new Date(0) });
    return response;
  } catch (error) { return failure(error); }
}
