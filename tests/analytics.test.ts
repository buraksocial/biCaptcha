import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import { analyticsFor, analyticsRange } from '../src/lib/security/analytics';

test('analytics bounds dates/page and aggregates 10000 rows without leaking another tenant', async () => {
  for (const query of ['days=1000', 'days=0', 'days=NaN', 'page=-1', 'page=1001']) assert.throws(() => analyticsRange(new URLSearchParams(query)));
  const folder = await mkdtemp(join(tmpdir(), 'bicaptcha-analytics-'));
  const path = join(folder, 'test.db');
  const sqlite = new DatabaseSync(path);
  for (const migration of ['202611150000_baseline', '202611150001_security_v2']) sqlite.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
  sqlite.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${path}` } } });
  try {
    await db.user.create({ data: { id: 'owner', email: 'owner@example.com', password: 'unused' } });
    await db.user.create({ data: { id: 'other', email: 'other@example.com', password: 'unused' } });
    for (const id of ['owner', 'other']) await db.site.create({ data: { id, userId: id, domain: `${id}.com`, siteKey: id, secretKey: 'must-not-return', isVerified: true } });
    for (let batch = 0; batch < 20; batch++) await db.validationLog.createMany({ data: Array.from({ length: 500 }, (_, i) => ({ siteId: 'owner', ip: '192.0.2.123', type: 'Verified', riskScore: i % 2, reason: 'advisory', latencyMs: 12 })) });
    await db.validationLog.create({ data: { siteId: 'other', ip: 'secret', type: 'Bot', riskScore: 1, reason: 'other-tenant' } });
    const result = await analyticsFor('owner', { days: 30, page: 1 }, db);
    assert.equal(result.stats.total, 10000);
    assert.equal(result.stats.avgLatency, 12);
    assert.equal(result.stats.bots, 0);
    assert.equal(result.recentLogs.length, 10);
    assert.ok(result.trafficData.length <= 30);
    assert.equal(JSON.stringify(result).includes('192.0.2.123'), false);
    assert.equal(JSON.stringify(result).includes('other-tenant'), false);
    const rows = await db.$queryRaw<Array<{ detail: string }>>`EXPLAIN QUERY PLAN SELECT id FROM ValidationLog WHERE siteId = 'owner' AND createdAt > 0`;
    assert.ok(rows.some(row => row.detail.includes('ValidationLog_siteId_createdAt_idx')));
  } finally { await db.$disconnect(); }
});
