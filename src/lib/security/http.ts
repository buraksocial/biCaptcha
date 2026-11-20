import { createHash } from 'node:crypto';
import { Unavailable, appOrigin } from './config';
import { getState } from './state';

export class HttpError extends Error {
  constructor(public status: number) { super('Request rejected'); }
}
export function json(body: unknown, status = 200, headers?: HeadersInit) {
  const h = new Headers(headers);
  h.set('Cache-Control', 'no-store');
  h.set('X-Content-Type-Options', 'nosniff');
  return Response.json(body, { status, headers: h });
}
export function failure(error: unknown) {
  const databaseFailure = error instanceof Error && (error.constructor.name.startsWith('PrismaClient') || /^P10\d\d$/.test(String((error as Error & { code?: string }).code)));
  const status = error instanceof Unavailable || databaseFailure ? 503 : error instanceof HttpError ? error.status : 400;
  return json({ success: false, error: status === 503 ? 'Service unavailable' : status === 429 ? 'Too many requests' : 'Request rejected' }, status, status === 429 ? { 'Retry-After': '60' } : undefined);
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400);
  return value as Record<string, unknown>;
}
export function text(value: unknown, maximum: number, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.length || value.length > maximum || (pattern && !pattern.test(value))) throw new HttpError(400);
  return value;
}
export async function readJson(request: Request, maximum = 16384) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415);
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new HttpError(413);
  if (!request.body) throw new HttpError(400);
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new HttpError(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
}
export function csrf(request: Request) {
  if (request.headers.get('origin') !== appOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403);
}
export async function rate(scope: string, identity: string, maximum: number, seconds = 60) {
  // No forwarding header is trusted. These are global/site/account limits, NOT IP limits.
  const digest = createHash('sha256').update(identity).digest('hex');
  if (!await getState().limit(`${scope}:${digest}`, maximum, seconds)) throw new HttpError(429);
}
