import { requireUser } from '@/lib/security/auth';
import { failure, json } from '@/lib/security/http';
export async function GET(request: Request) {
  try { return json({ authenticated: true, user: await requireUser(request) }); }
  catch (error) { return failure(error); }
}
