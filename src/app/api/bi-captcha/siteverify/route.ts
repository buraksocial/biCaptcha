import { prisma } from '@/lib/prisma';
import { captchaService } from '@/lib/security/runtime';
import { context } from '@/lib/security/captcha';
import { credentialMatches } from '@/lib/security/credentials';
import { HttpError, failure, json, rate, readJson, text } from '@/lib/security/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const service = captchaService();
    await rate('siteverify-global', 'global', 300);
    // Backend-only. No CORS and no cookie authentication.
    const body = await readJson(request, 4096);
    if (Object.keys(body).some(k => !['token', 'siteKey', 'action', 'hostname'].includes(k))) throw new HttpError(400);
    const siteKey = text(body.siteKey, 80, /^[a-zA-Z0-9_-]+$/);
    await rate('siteverify-site', siteKey, 100);
    const site = await prisma.site.findUnique({ where: { siteKey } });
    const authorization = request.headers.get('authorization');
    const secret = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!site?.isVerified || !credentialMatches(secret, site.verificationSecretHash)) throw new HttpError(403);
    return json(await service.consume(text(body.token, 2048), context({ siteKey, action: body.action, host: body.hostname })));
  } catch (error) { return failure(error); }
}
