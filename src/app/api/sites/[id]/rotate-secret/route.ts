import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/security/auth';
import { ownedSite } from '@/lib/security/sites';
import { createCredential } from '@/lib/security/credentials';
import { csrf, failure, json, rate, text } from '@/lib/security/http';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    csrf(request);
    const user = await requireUser(request);
    await rate('site-secret-rotate', user.id, 5);
    const id = text((await params).id, 100);
    await ownedSite(id, user.id);
    const credential = createCredential();
    await prisma.site.update({ where: { id, userId: user.id }, data: { verificationSecretHash: credential.hash, secretKey: '' } });
    return json({ success: true, verificationSecret: credential.secret });
  } catch (error) { return failure(error); }
}
