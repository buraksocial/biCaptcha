import { prisma } from '../prisma';
import { retentionDays } from './retention';
/** Logging is opt-in pending retention/privacy approval. No IP or raw telemetry.
 * This bounded awaited insert has no unbounded fire-and-forget queue. Failure never
 * changes challenge/token security state. Move to a durable queue only after design.
 */
export async function recordValidation(siteId: string, riskScore: number, latencyMs: number) {
  if (process.env.BICAPTCHA_LOGGING !== 'enabled') return;
  try {
    retentionDays(process.env.BICAPTCHA_LOG_RETENTION_DAYS);
    await prisma.validationLog.create({ data: { siteId, ip: '', type: 'Verified', riskScore, reason: 'Server challenge accepted; client risk is advisory', latencyMs } });
  } catch { console.warn('biCaptcha validation metrics unavailable'); }
}
