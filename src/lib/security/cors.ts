import { prisma } from '../prisma';
import { domainMatches, sourceOrigin } from './domain';
import { HttpError, failure, json, rate, text } from './http';
import { captchaService } from './runtime';

export async function publicOrigin(request: Request, siteKey: string) {
  const source = sourceOrigin(request.headers.get('origin'));
  const site = await prisma.site.findUnique({ where: { siteKey } });
  if (!site?.isVerified || !domainMatches(source.host, site.domain)) throw new HttpError(403);
  return source;
}
export function corsHeaders(origin: string) {
  return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
export async function preflight(request: Request) {
  try {
    captchaService();
    await rate('captcha-preflight', 'global', 300);
    const key = text(new URL(request.url).searchParams.get('siteKey'), 80, /^[a-zA-Z0-9_-]+$/);
    const origin = await publicOrigin(request, key);
    const method = request.headers.get('access-control-request-method');
    const headers = request.headers.get('access-control-request-headers') ?? '';
    if (!['GET', 'POST'].includes(method ?? '') || headers.split(',').some(h => h.trim() && h.trim().toLowerCase() !== 'content-type')) throw new HttpError(403);
    return new Response(null, { status: 204, headers: { ...corsHeaders(origin.origin), 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function publicHandler(request: Request, operation: (service: ReturnType<typeof captchaService>, body: Record<string, unknown>, host: string) => Promise<unknown>) {
  let headers: HeadersInit | undefined;
  try {
    const service = captchaService();
    await rate('captcha-global', 'global', 300);
    const { readJson } = await import('./http');
    const body = request.method === 'GET' ? Object.fromEntries(new URL(request.url).searchParams) : await readJson(request, 8192);
    const key = text(body.siteKey, 80, /^[a-zA-Z0-9_-]+$/);
    const source = await publicOrigin(request, key);
    headers = corsHeaders(source.origin);
    await rate('captcha-site', key, 100);
    return json(await operation(service, body, source.host), 200, headers);
  } catch (error) {
    const response = failure(error);
    if (headers) new Headers(headers).forEach((v, k) => response.headers.set(k, v));
    return response;
  }
}
