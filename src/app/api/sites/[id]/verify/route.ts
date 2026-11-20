import { Resolver } from 'node:dns/promises';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/auth';
import { canonicalDomain, txtMatches } from '@/lib/security/domain';
import { ownedSite, publicSiteFields } from '@/lib/security/sites';
import { csrf, failure, HttpError, json, rate, text } from '@/lib/security/http';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    csrf(request);
    const user = await requireUser(request);
    await rate('site-dns', user.id, 10);
    const id = text((await params).id, 100);
    const site = await ownedSite(id, user.id);
    const domain = canonicalDomain(site.domain);
    const resolver = new Resolver({ timeout: 2000, tries: 1 });
    let records: string[][];
    try { records = await resolver.resolveTxt(domain); } catch { throw new HttpError(400); }
    if (!txtMatches(records, site.siteKey)) throw new HttpError(400);
    const updated = await prisma.site.update({ where: { id, userId: user.id }, data: { isVerified: true, domain }, select: publicSiteFields });
    return json({ success: true, site: updated });
  } catch (error) { return failure(error); }
}
