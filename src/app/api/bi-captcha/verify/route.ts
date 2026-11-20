import { publicHandler, preflight } from '@/lib/security/cors';
import { recordValidation } from '@/lib/security/logging';
export const runtime = 'nodejs';
export const OPTIONS = preflight;
export function POST(request: Request) {
  return publicHandler(request, async (service, body, host) => {
    const started = performance.now();
    const result = await service.verify({ ...body, host });
    await recordValidation(result.siteId, result.riskScore, Math.round(performance.now() - started));
    return { success: true, token: result.token, expiresIn: 120 };
  });
}
