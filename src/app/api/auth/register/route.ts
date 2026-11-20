import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { authInput } from '@/lib/security/auth';
import { signingKey } from '@/lib/security/config';
import { csrf, failure, json, rate, readJson } from '@/lib/security/http';
export async function POST(request: Request) {
  try {
    signingKey('JWT_SECRET');
    csrf(request);
    await rate('register-global', 'global', 10);
    const { email, password, name } = authInput(await readJson(request, 2048));
    await rate('register-account', email, 3, 3600);
    const hashed = await bcrypt.hash(password, 12);
    try { await prisma.user.create({ data: { email, password: hashed, name } }); }
    catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') throw error; }
    // Same response for existing/new accounts; no password or DB object returned.
    return json({ success: true });
  } catch (error) { return failure(error); }
}
