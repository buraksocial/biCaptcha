import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { HttpError } from './http';
export function analyticsRange(query: URLSearchParams) {
  const days = Number(query.get('days') ?? 30), page = Number(query.get('page') ?? 1);
  if (!Number.isInteger(days) || days < 1 || days > 30 || !Number.isInteger(page) || page < 1 || page > 1000) throw new HttpError(400);
  return { days, page };
}
export async function analyticsFor(userId: string, { days, page }: { days: number; page: number }, db: PrismaClient = prisma) {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - days + 1);
  const end = new Date();
  // Only this fixed expression varies by provider; user values remain bound parameters.
  const dateExpression = Prisma.raw(/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? '')
    ? `to_char(l."createdAt", 'YYYY-MM-DD')` : `strftime('%Y-%m-%d', l."createdAt" / 1000.0, 'unixepoch')`);
  const daily = await db.$queryRaw<Array<{ date: string; total: bigint; Human: bigint; Bot: bigint; TrustPass: bigint; safe: bigint; suspicious: bigint; high: bigint; latencyTotal: bigint | number | null; latencyCount: bigint }>>`
    SELECT ${dateExpression} AS date,
      COUNT(*) AS total,
      SUM(CASE WHEN l.type IN ('Human', 'Verified') THEN 1 ELSE 0 END) AS "Human",
      SUM(CASE WHEN l.type = 'Bot' THEN 1 ELSE 0 END) AS "Bot",
      SUM(CASE WHEN l.type = 'TrustPass' THEN 1 ELSE 0 END) AS "TrustPass",
      SUM(CASE WHEN l."riskScore" <= 0.3 THEN 1 ELSE 0 END) AS safe,
      SUM(CASE WHEN l."riskScore" > 0.3 AND l."riskScore" <= 0.6 THEN 1 ELSE 0 END) AS suspicious,
      SUM(CASE WHEN l."riskScore" > 0.6 THEN 1 ELSE 0 END) AS high,
      SUM(l."latencyMs") AS "latencyTotal", COUNT(l."latencyMs") AS "latencyCount"
    FROM "Site" s JOIN "ValidationLog" l ON l."siteId" = s.id
    WHERE s."userId" = ${userId} AND s."isVerified" = true AND l."createdAt" >= ${start} AND l."createdAt" <= ${end}
    GROUP BY date ORDER BY date LIMIT 30`;
  const rows = await db.validationLog.findMany({ where: { site: { userId, isVerified: true }, createdAt: { gte: start, lte: end } }, select: { id: true, type: true, riskScore: true, reason: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10, skip: (page - 1) * 10 });
  let total = 0, bots = 0, trustPass = 0, safe = 0, suspicious = 0, high = 0, latencyTotal = 0, latencyCount = 0;
  for (const row of daily) {
    total += Number(row.total); bots += Number(row.Bot); trustPass += Number(row.TrustPass);
    safe += Number(row.safe); suspicious += Number(row.suspicious); high += Number(row.high);
    latencyTotal += Number(row.latencyTotal ?? 0); latencyCount += Number(row.latencyCount);
  }
  return {
    trafficData: daily.map(row => ({ date: row.date, Human: Number(row.Human), Bot: Number(row.Bot), TrustPass: Number(row.TrustPass) })),
    stats: { total, bots, trustPass, avgLatency: latencyCount ? Math.round(latencyTotal / latencyCount) : null },
    riskData: [
      { name: 'Low advisory score', value: total ? Math.round(safe * 100 / total) : 0, color: '#22c55e' },
      { name: 'Medium advisory score', value: total ? Math.round(suspicious * 100 / total) : 0, color: '#eab308' },
      { name: 'High advisory score', value: total ? Math.round(high * 100 / total) : 0, color: '#ef4444' },
    ],
    recentLogs: rows.map(row => ({ id: row.id, ip: 'Not collected', country: 'Unknown', type: row.type, score: row.riskScore, reason: row.reason, time: row.createdAt.toISOString() })),
    page, days, loggingEnabled: process.env.BICAPTCHA_LOGGING === 'enabled',
  };
}
