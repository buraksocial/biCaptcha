import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export function createCredential() {
  const secret = `bcs_${randomBytes(32).toString('hex')}`;
  return { secret, hash: createHash('sha256').update(secret).digest('hex') };
}
export function credentialMatches(secret: unknown, hash: string | null) {
  if (typeof secret !== 'string' || !/^bcs_[a-f0-9]{64}$/.test(secret) || !hash || !/^[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(createHash('sha256').update(secret).digest(), Buffer.from(hash, 'hex'));
}
