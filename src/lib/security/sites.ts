import { prisma } from '../prisma';
import { HttpError } from './http';
export const publicSiteFields = { id: true, domain: true, siteKey: true, isVerified: true, createdAt: true } as const;
export async function ownedSite(id: string, userId: string) {
  const site = await prisma.site.findFirst({ where: { id, userId }, select: publicSiteFields });
  if (!site) throw new HttpError(404);
  return site;
}
