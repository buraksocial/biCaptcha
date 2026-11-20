import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { authInput, issueSession, sessionCookie } from '@/lib/security/auth';
import { csrf, failure, HttpError, rate, readJson } from '@/lib/security/http';
import { signingKey } from '@/lib/security/config';
// Valid fixed-cost dummy hash prevents an immediate unknown-account timing shortcut.
const DUMMY = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxJk2j5K1Q6f6y5Z6c6jM8FQqZy';
export async function POST(request: Request) {
  try {
    signingKey('JWT_SECRET');
    csrf(request);
    await rate('login-global', 'global', 60);
    const { email, password } = authInput(await readJson(request, 2048));
    await rate('login-account', email, 5, 300);
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = await bcrypt.compare(password, user?.password ?? DUMMY);
    if (!user || !valid) throw new HttpError(401);
    const token = await issueSession(user.id);
    const response = NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set('bicaptcha_session', token, sessionCookie());
    return response;
  } catch (error) { return failure(error); }
}
