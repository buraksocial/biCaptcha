import { getState } from '@/lib/security/state';
import { productionConfig } from '@/lib/security/production';
import { postgres } from '@/lib/security/postgres';
export const runtime = 'nodejs';
export async function GET() {
  try {
    productionConfig();
    await getState().putIfAbsent('readiness', 'ready', 2);
    await postgres().query('SELECT 1 FROM verification_receipt LIMIT 1');
    return Response.json({ ready: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ ready: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
