export function GET() { return Response.json({ live: true }, { headers: { 'Cache-Control': 'no-store' } }); }
