import { consumeProof, nonce } from '@/lib/security/trust-v2';
import { context } from '@/lib/security/captcha';
import { captchaService } from '@/lib/security/runtime';
import { failure, HttpError, json, rate, readJson, text } from '@/lib/security/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const service = captchaService();
    const b = await readJson(request, 4096), ctx = context(b.context), grant = text(b.grant, 100);
    await rate('trust-pass-global', 'global', 300); await rate('trust-pass-grant', grant, 40);
    if(b.op!=='nonce'&&b.op!=='consume')throw new HttpError(400);
    if (b.op === 'nonce') return json(await nonce(grant, ctx));
    if (b.op !== 'consume') throw new HttpError(400);
    const verified = await consumeProof({ ...ctx, grant, nonce: text(b.nonce, 100), deployment: text(b.deployment, 100) }, text(b.signature, 100));
    return json({ success: true, token: await service.issue(verified), expiresIn: 120 });
  } catch (e) { return failure(e); }
}
