import { context } from '@/lib/security/captcha';
import { HttpError } from '@/lib/security/http';
import { preflight, publicHandler } from '@/lib/security/cors';
export const runtime = 'nodejs';
export const OPTIONS = preflight;
export function POST(request: Request) {
  return publicHandler(request, async (service, body, host) => {
    if (Object.keys(body).some(k => !['siteKey', 'action'].includes(k))) throw new HttpError(400);
    return service.challenge(context({ ...body, host }));
  });
}
export const GET = POST;
