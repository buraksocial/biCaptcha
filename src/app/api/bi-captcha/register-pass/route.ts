import { json } from '@/lib/security/http';
export async function POST(_request: Request) {
  void _request;
  return json({ success: false, error: 'Trust Pass has been retired' }, 410);
}
