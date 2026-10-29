import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import dns from 'dns/promises';
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'bi-captcha-super-secret-jwt-key';

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('bicaptcha_session')?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch (e) {
    return null;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const site = await prisma.site.findFirst({
      where: { id, userId: user.userId }
    });

    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    // Execute real DNS TXT verification
    try {
      // 1. Get all TXT records for the domain
      const records = await dns.resolveTxt(site.domain);
      
      // 2. Format: [['v=spf1...'], ['bicaptcha-verification=xyz...']]
      const isVerified = records.some(r => r.join('').includes(`bicaptcha-verification=${site.siteKey}`));
      
      if (!isVerified) {
        return NextResponse.json({ error: 'DNS TXT record not found on domain.' }, { status: 400 });
      }
    } catch(e: any) {
      // If the domain doesn't exist or has no TXT records
      if (e.code === 'ENODATA' || e.code === 'ENOTFOUND') {
         return NextResponse.json({ error: 'DNS TXT record not found on domain.' }, { status: 400 });
      }
      return NextResponse.json({ error: 'DNS lookup failed: ' + e.message }, { status: 400 });
    }

    const updated = await prisma.site.update({
      where: { id },
      data: { isVerified: true }
    });

    return NextResponse.json({ success: true, site: updated });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
