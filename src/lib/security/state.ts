import { Unavailable } from './config';
import { productionConfig } from './production';
import { createClient } from 'redis';
import { RedisState } from './redis-state';

/** Production adapters MUST implement every operation atomically across all instances.
 * Expiry is checked inside consume; a read-then-delete implementation is unsafe.
 * limit sets expiry only when creating a counter. Never reset all state on capacity.
 */
export interface SharedState {
  putIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  consume(key: string, expectedValue: string): Promise<boolean>;
  limit(key: string, maximum: number, windowSeconds: number): Promise<boolean>;
}

/** Local development/tests ONLY. Not a production replay or rate-limit boundary. */
export class MemoryState implements SharedState {
  private entries = new Map<string, { value: string; expires: number }>();
  private operations = 0;
  constructor(private now = Date.now, private capacity = 20000) {}
  private entry(key: string) {
    if (++this.operations % 256 === 0 || this.entries.size >= this.capacity) {
      for (const [k, v] of this.entries) if (v.expires <= this.now()) this.entries.delete(k);
    }
    const current = this.entries.get(key);
    if (current && current.expires <= this.now()) { this.entries.delete(key); return undefined; }
    return current;
  }
  private insert(key: string, value: string, seconds: number) {
    if (this.entries.size >= this.capacity) throw new Unavailable('Local state capacity exceeded');
    this.entries.set(key, { value, expires: this.now() + seconds * 1000 });
  }
  async putIfAbsent(key: string, value: string, ttlSeconds: number) {
    if (this.entry(key)) return false;
    this.insert(key, value, ttlSeconds);
    return true;
  }
  async consume(key: string, expectedValue: string) {
    const current = this.entry(key);
    if (!current || current.value !== expectedValue) return false;
    this.entries.delete(key);
    return true;
  }
  async limit(key: string, maximum: number, windowSeconds: number) {
    const current = this.entry(`rate:${key}`);
    if (!current) { this.insert(`rate:${key}`, '1', windowSeconds); return true; }
    const count = Number(current.value);
    if (count >= maximum) return false;
    current.value = String(count + 1);
    return true;
  }
}

const local = globalThis as typeof globalThis & { biCaptchaLocalState?: MemoryState };
let shared: SharedState | undefined;
export function redisState(url: string, deployment: string): SharedState {
  let connecting: Promise<void> | undefined;
  const client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 1500, reconnectStrategy: false } });
  client.on('error', () => {});
  const adapter = new RedisState(client, deployment);
  async function run<T>(fn: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([(async () => {
        if (!client.isReady) {
          connecting ??= client.connect().then(() => {}).finally(() => { connecting = undefined; });
          await connecting;
        }
        return fn();
      })(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { if (client.isOpen) void client.disconnect().catch(() => {}); reject(new Unavailable('State timeout')); }, 2000);
      })]);
    } catch { throw new Unavailable('Shared security state unavailable'); }
    finally { if (timer) clearTimeout(timer); }
  }
  return { putIfAbsent: (...args) => run(() => adapter.putIfAbsent(...args)), consume: (...args) => run(() => adapter.consume(...args)), limit: (...args) => run(() => adapter.limit(...args)) };
}
export function getState(env: Record<string, string | undefined> = process.env): SharedState {
  productionConfig(env);
  if (env.BICAPTCHA_STATE === 'redis') {
    if (!env.REDIS_URL || !env.BICAPTCHA_DEPLOYMENT_ID || !/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL ?? '')) throw new Unavailable('Production state incomplete');
    return shared ??= redisState(env.REDIS_URL, env.BICAPTCHA_DEPLOYMENT_ID);
  }
  if (!['development', 'test'].includes(env.NODE_ENV ?? '') || env.BICAPTCHA_STATE !== 'memory') throw new Unavailable('Shared security state not configured');
  return local.biCaptchaLocalState ??= new MemoryState();
}
