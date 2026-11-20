export class Unavailable extends Error {}
type Environment = Record<string, string | undefined>;

export function signingKey(name: string, env: Environment = process.env): Uint8Array {
  const value = env[name];
  if (!value || !/^[a-f0-9]{64}$/i.test(value) || new Set(value).size < 8) throw new Unavailable('Security configuration unavailable');
  for (const other of ['JWT_SECRET', 'BICAPTCHA_SECRET', 'BICAPTCHA_VERIFY_SECRET']) {
    if (other !== name && env[other]?.toLowerCase() === value.toLowerCase()) throw new Unavailable('Signing keys must be independent');
  }
  return Buffer.from(value, 'hex');
}

export function appOrigin(env: Environment = process.env): string {
  const raw = env.APP_ORIGIN;
  if (!raw) throw new Unavailable('APP_ORIGIN required');
  const url = new URL(raw);
  if (url.origin !== raw || url.username || url.password || (env.NODE_ENV === 'production' && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol)) throw new Unavailable('Invalid APP_ORIGIN');
  return raw;
}
