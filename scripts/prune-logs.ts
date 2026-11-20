import { prisma } from '../src/lib/prisma';
import { retentionDays } from '../src/lib/security/retention';

async function main() {
  const days = retentionDays(process.env.BICAPTCHA_LOG_RETENTION_DAYS);
  const cutoff = new Date(Date.now() - days * 86400000);
  const candidates = await prisma.validationLog.count({ where: { createdAt: { lt: cutoff } } });
  console.log(JSON.stringify({ mode: process.argv.includes('--execute') ? 'execute' : 'dry-run', days, candidates }));
  if (!process.argv.includes('--execute')) return;
  // Bounded batches avoid a single large delete/long SQLite write lock.
  let deleted = 0;
  for (let batch = 0; batch < 100; batch++) {
    const rows = await prisma.validationLog.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, take: 1000 });
    if (!rows.length) break;
    deleted += (await prisma.validationLog.deleteMany({ where: { id: { in: rows.map(row => row.id) } } })).count;
  }
  console.log(JSON.stringify({ deleted }));
}
main().catch(() => { console.error('Retention job failed; verify DB access and explicit retention policy'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
