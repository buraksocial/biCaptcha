import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

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

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Get all verified sites for this user
    const sites = await prisma.site.findMany({
      where: { userId: user.userId, isVerified: true },
      select: { id: true }
    });

    if (sites.length === 0) {
      return NextResponse.json({ 
        trafficData: [],
        stats: { total: 0, bots: 0, trustPass: 0, avgLatency: 0 },
        riskData: [
          { name: 'Safe (0.0 - 0.3)', value: 0, color: '#22c55e' },
          { name: 'Suspicious (0.3 - 0.6)', value: 0, color: '#eab308' },
          { name: 'Bot (0.6 - 1.0)', value: 0, color: '#ef4444' }
        ],
        recentLogs: []
      });
    }

    const siteIds = sites.map(s => s.id);

    // Get logs for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logs = await prisma.validationLog.findMany({
      where: {
        siteId: { in: siteIds },
        createdAt: { gte: thirtyDaysAgo }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Compute basic stats
    const total = logs.length;
    const bots = logs.filter(l => l.type === 'Bot').length;
    const trustPass = logs.filter(l => l.type === 'TrustPass').length;
    const avgLatency = 84; // Mock for now, would need telemetry.ts

    // Group by Date for Chart
    const dateMap = new Map();
    for (let i = 30; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' });
      dateMap.set(key, { date: key, Human: 0, Bot: 0, TrustPass: 0 });
    }

    let safeCount = 0;
    let suspCount = 0;
    let botCount = 0;

    for (const log of logs) {
      const dKey = log.createdAt.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' });
      if (dateMap.has(dKey)) {
        const entry = dateMap.get(dKey);
        entry[log.type]++;
      }
      
      if (log.riskScore <= 0.3) safeCount++;
      else if (log.riskScore <= 0.6) suspCount++;
      else botCount++;
    }

    const trafficData = Array.from(dateMap.values());
    
    // Convert counts to percentages for PieChart, handle /0
    const totalRisk = safeCount + suspCount + botCount;
    const pSafe = totalRisk > 0 ? Math.round((safeCount / totalRisk) * 100) : 0;
    const pSusp = totalRisk > 0 ? Math.round((suspCount / totalRisk) * 100) : 0;
    const pBot = totalRisk > 0 ? Math.round((botCount / totalRisk) * 100) : 0;

    const riskData = [
      { name: 'Safe (0.0 - 0.3)', value: pSafe, color: '#22c55e' },
      { name: 'Suspicious (0.3 - 0.6)', value: pSusp, color: '#eab308' },
      { name: 'Bot (0.6 - 1.0)', value: pBot, color: '#ef4444' }
    ];

    // Format recent logs
    const recentLogs = logs.slice(0, 10).map(log => ({
      id: log.id,
      ip: log.ip.replace(/(?<=\.).*?(?=\.)/g, '*'), // Mask IP slightly: 192.*.1.45
      country: log.country,
      type: log.type,
      score: log.riskScore,
      reason: log.reason,
      time: log.createdAt.toLocaleTimeString()
    }));

    return NextResponse.json({
      trafficData,
      stats: { total, bots, trustPass, avgLatency },
      riskData,
      recentLogs
    });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
