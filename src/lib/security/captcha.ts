import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { domainMatches, canonicalDomain } from './domain';
import { HttpError, object, text } from './http';
import type { SharedState } from './state';

export interface CaptchaSite { id: string; siteKey: string; domain: string; isVerified: boolean }
export interface Context { siteKey: string; action: string; host: string }
const TTL = 120;
const ISSUER = 'urn:bicaptcha:v2';
const CHALLENGE = 'urn:bicaptcha:challenge';
const TOKEN = 'urn:bicaptcha:siteverify';
export function context(input: unknown): Context {
  const value = object(input);
  return { siteKey: text(value.siteKey, 80, /^[a-zA-Z0-9_-]+$/), action: text(value.action, 64, /^[a-zA-Z0-9_-]+$/), host: canonicalDomain(value.host) };
}
const binding = (c: Context) => JSON.stringify([c.siteKey, c.action, c.host]);
function telemetry(value: unknown) {
  const t = object(value);
  if (Object.keys(t).length > 4 || Object.keys(t).some(k => !['webdriver', 'duration', 'interactions', 'language'].includes(k))) throw new HttpError(400);
  if (t.webdriver !== undefined && typeof t.webdriver !== 'boolean') throw new HttpError(400);
  for (const k of ['duration', 'interactions']) if (t[k] !== undefined && (typeof t[k] !== 'number' || !Number.isFinite(t[k]) || (t[k] as number) < 0 || (t[k] as number) > 120000)) throw new HttpError(400);
  if (t.language !== undefined) text(t.language, 32, /^[a-zA-Z0-9-]+$/);
  // Advisory only. Forging this data cannot bypass server state, PoW or consume.
  return t.webdriver === true ? 1 : 0;
}
export class CaptchaService {
  private now: () => number;
  private difficulty: number;
  constructor(private deps: { state: SharedState; findSite: (siteKey: string) => Promise<CaptchaSite | null>; challengeKey: Uint8Array; tokenKey: Uint8Array; now?: () => number; difficulty?: number; deployment?: string; durableConsume?: (jti: string, c: Context) => Promise<void> }) {
    this.now = deps.now ?? Date.now;
    this.difficulty = deps.difficulty ?? 4;
  }
  private async site(c: Context) {
    const site = await this.deps.findSite(c.siteKey);
    if (!site?.isVerified || !domainMatches(c.host, site.domain)) throw new HttpError(403);
    return site;
  }
  private async sign(c: Context, jti: string, audience: string, key: Uint8Array, extra = {}) {
    const now = Math.floor(this.now() / 1000);
    return new SignJWT({ ...c, ...extra }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer(ISSUER).setAudience(this.deps.deployment ? `${audience}:${this.deps.deployment}` : audience).setJti(jti).setIssuedAt(now).setExpirationTime(now + TTL).sign(key);
  }
  private async claims(token: string, c: Context, audience: string, key: Uint8Array) {
    const { payload } = await jwtVerify(text(token, 2048), key, { algorithms: ['HS256'], typ: 'JWT', issuer: ISSUER, audience: this.deps.deployment ? `${audience}:${this.deps.deployment}` : audience, maxTokenAge: TTL, requiredClaims: ['iat', 'exp', 'jti', 'siteKey', 'action', 'host'], currentDate: new Date(this.now()) });
    if (binding(context(payload)) !== binding(c) || typeof payload.jti !== 'string' || !/^[0-9a-f-]{36}$/.test(payload.jti) || typeof payload.exp !== 'number' || typeof payload.iat !== 'number' || payload.exp - payload.iat > TTL || payload.exp <= payload.iat) throw new HttpError(403);
    return payload;
  }
  async challenge(input: Context) {
    const c = context(input);
    await this.site(c);
    const id = randomUUID();
    const challenge = await this.sign(c, id, CHALLENGE, this.deps.challengeKey, { difficulty: this.difficulty });
    if (!await this.deps.state.putIfAbsent(`challenge:${id}`, binding(c), TTL)) throw new HttpError(503);
    return { challenge, difficulty: this.difficulty, expiresIn: TTL };
  }
  async verify(input: unknown) {
    const value = object(input), c = context(value);
    if (Object.keys(value).some(k => !['siteKey', 'action', 'host', 'challenge', 'nonce', 'telemetry'].includes(k))) throw new HttpError(400);
    await this.site(c);
    const claims = await this.claims(text(value.challenge, 2048), c, CHALLENGE, this.deps.challengeKey);
    const nonce = text(value.nonce, 10, /^(0|[1-9][0-9]{0,9})$/);
    const riskScore = telemetry(value.telemetry);
    if (claims.difficulty !== this.difficulty || !createHash('sha256').update(`${value.challenge}:${nonce}`).digest('hex').startsWith('0'.repeat(this.difficulty))) throw new HttpError(403);
    if (!await this.deps.state.consume(`challenge:${claims.jti}`, binding(c))) throw new HttpError(403);
    const token = await this.issue(c);
    return { success: true, token, riskScore, siteId: (await this.site(c)).id };
  }
  /** Internal only: Trust Pass calls this after durable nonce/budget consumption. No public sign endpoint. */
  async issue(input: Context) {
    const c = context(input); await this.site(c);
    const jti = randomUUID();
    const token = await this.sign(c, jti, TOKEN, this.deps.tokenKey, { verified: true });
    if (!this.deps.durableConsume && !await this.deps.state.putIfAbsent(`token:${jti}`, binding(c), TTL)) throw new HttpError(503);
    return token;
  }
  async consume(token: string, input: Context) {
    const c = context(input);
    await this.site(c);
    const claims = await this.claims(token, c, TOKEN, this.deps.tokenKey);
    if (claims.verified !== true) throw new HttpError(403);
    if (this.deps.durableConsume) await this.deps.durableConsume(claims.jti!, c);
    else if (!await this.deps.state.consume(`token:${claims.jti}`, binding(c))) throw new HttpError(403);
    return { success: true as const, siteKey: c.siteKey, action: c.action, hostname: c.host };
  }
}
