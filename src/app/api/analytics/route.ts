import { requireUser } from '@/lib/security/auth';
import { analyticsFor, analyticsRange } from '@/lib/security/analytics';
import { failure, json, rate } from '@/lib/security/http';
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await rate('analytics', user.id, 30);
    return json(await analyticsFor(user.id, analyticsRange(new URL(request.url).searchParams)));
  } catch (error) { return failure(error); }
}
