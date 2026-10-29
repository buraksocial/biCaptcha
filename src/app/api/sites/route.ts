import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import crypto from 'crypto';

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

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sites = await prisma.site.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({ sites });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { domain } = await req.json();
    if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 });

    // Generate keys
    const siteKey = 'bicaptcha_' + crypto.randomBytes(16).toString('hex');
    const secretKey = 'sec_' + crypto.randomBytes(24).toString('hex');

    const site = await prisma.site.create({
      data: {
        domain,
        siteKey,
        secretKey,
        userId: user.userId
      }
    });

    return NextResponse.json({ success: true, site });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
