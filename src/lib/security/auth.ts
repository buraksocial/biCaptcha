import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma';
import { signingKey } from './config';
import { HttpError, object, text } from './http';

export function authInput(input: unknown) {
  const body = object(input);
  const email = text(body.email, 254).trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email)) throw new HttpError(400);
  const password = text(body.password, 72);
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || password.includes('\0')) throw new HttpError(400);
  const name = body.name === undefined ? undefined : text(body.name, 100).trim();
  return { email, password, name };
}
export function sessionCookie() {
  return { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge: 3600 };
}
export async function issueSession(userId: string) {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('urn:bicaptcha:session:v2').setAudience('bicaptcha-dashboard').setSubject(userId).setJti(randomUUID()).setIssuedAt().setExpirationTime('1h').sign(signingKey('JWT_SECRET'));
}
export async function requireUser(request: Request) {
  const key = signingKey('JWT_SECRET');
  const entries = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith('bicaptcha_session='));
  if (entries.length !== 1) throw new HttpError(401);
  const token = text(entries[0].slice('bicaptcha_session='.length), 2048);
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], typ: 'JWT', issuer: 'urn:bicaptcha:session:v2', audience: 'bicaptcha-dashboard', maxTokenAge: 3600, requiredClaims: ['sub', 'iat', 'exp', 'jti'] });
    userId = text(payload.sub, 100);
    if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number' || payload.exp - payload.iat > 3600) throw Error('Invalid session');
  } catch { throw new HttpError(401); }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, createdAt: true } });
  if (!user) throw new HttpError(401);
  return user;
}
