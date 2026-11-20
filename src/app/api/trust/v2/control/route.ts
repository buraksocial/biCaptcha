import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/auth';
import { options, finish, revoke } from '@/lib/security/trust-v2';
import { csrf, failure, HttpError, json, object, rate, readJson, text } from '@/lib/security/http';
import { getState } from '@/lib/security/state';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    getState(); csrf(request); const user = await requireUser(request); await rate('trust-control', user.id, 10);
    const b = await readJson(request, 32768), op = text(b.op, 30);
    if (op === 'register-options') {
      // A stolen cookie is not sufficient to add a new authenticator.
      const password = text(b.password, 72);
      if (Buffer.byteLength(password) > 72) throw new HttpError(400);
      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      if (!stored || !await bcrypt.compare(password, stored.password)) throw new HttpError(403);
      return json(await options(user.id, user.email, 'register', b));
    }
    if (op === 'grant-options') return json(await options(user.id, user.email, 'grant', b));
    if (op === 'finish') return json(await finish(user.id, text(b.id, 100), object(b.response) as unknown as RegistrationResponseJSON | AuthenticationResponseJSON));
    if (op === 'revoke') {
      if (!['account', 'device', 'grant'].includes(String(b.kind))) throw new HttpError(400);
      await revoke(user.id, b.kind as 'account' | 'device' | 'grant', b.kind === 'account' ? undefined : text(b.id, 100));
      return json({ success: true });
    }
    throw new HttpError(400);
  } catch (e) { return failure(e); }
}
