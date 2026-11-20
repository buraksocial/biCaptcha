import type { createClient } from 'redis';
import { Unavailable } from './config';
import type { SharedState } from './state';

const PUT_IF_ABSENT = `if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]); return 1`;
const CONSUME = `local v=redis.call('GET',KEYS[1]); if not v or v~=ARGV[1] then return 0 end
local ttl=redis.call('PTTL',KEYS[1]); if ttl<=0 then redis.call('DEL',KEYS[1]); return 0 end
redis.call('DEL',KEYS[1]); return 1`;
const LIMIT = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[2]) end
if n>tonumber(ARGV[1]) then return 0 end; return 1`;

/** Redis-backed, cross-process state. Never falls back to memory on any failure. */
export class RedisState implements SharedState {
  constructor(private readonly client: ReturnType<typeof createClient>, private readonly deployment: string) {
    if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(deployment)) throw new Error('Invalid state namespace');
  }
  private key(key: string) {
    if (!key || key.length > 256 || /[\r\n\0]/.test(key)) throw new Error('Invalid state key');
    return `bicaptcha:${this.deployment}:${key}`;
  }
  private async run(script: string, key: string, args: string[]) {
    try { return await this.client.eval(script, { keys: [this.key(key)], arguments: args }); }
    catch { throw new Unavailable('Shared security state unavailable'); }
  }
  async putIfAbsent(key: string, value: string, ttlSeconds: number) {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 2_147_483_647) throw new Error('Invalid state TTL');
    return Number(await this.run(PUT_IF_ABSENT, key, [value, String(ttlSeconds)])) === 1;
  }
  async consume(key: string, expectedValue: string) {
    return Number(await this.run(CONSUME, key, [expectedValue])) === 1;
  }
  async limit(key: string, maximum: number, windowSeconds: number) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 2_147_483_647) throw new Error('Invalid rate limit');
    return Number(await this.run(LIMIT, `rate:${key}`, [String(maximum), String(windowSeconds)])) === 1;
  }
}
