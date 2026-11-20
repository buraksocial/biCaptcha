import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/auth';
import { canonicalDomain } from '@/lib/security/domain';
import { createCredential } from '@/lib/security/credentials';
import { publicSiteFields } from '@/lib/security/sites';
import { csrf, failure, HttpError, json, rate, readJson } from '@/lib/security/http';
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const query = new URL(request.url).searchParams;
    const page = Number(query.get('page') ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 1000) throw new HttpError(400);
    return json({ sites: await prisma.site.findMany({ where: { userId: user.id }, select: publicSiteFields, orderBy: { createdAt: 'desc' }, take: 50, skip: (page - 1) * 50 }), page });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    csrf(request);
    const user = await requireUser(request);
    await rate('site-create', user.id, 10);
    const body = await readJson(request, 1024);
    const domain = canonicalDomain(body.domain);
    const credential = createCredential();
    const site = await prisma.site.create({ data: { domain, userId: user.id, siteKey: `bicaptcha_${randomBytes(16).toString('hex')}`, secretKey: '', verificationSecretHash: credential.hash }, select: publicSiteFields });
    return json({ success: true, site, verificationSecret: credential.secret }, 201);
  } catch (error) { return failure(error); }
}
