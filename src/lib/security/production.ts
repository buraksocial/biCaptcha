import { Unavailable, appOrigin, signingKey } from './config';
export function productionConfig(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV !== 'production') return;
  if (env.BICAPTCHA_STATE !== 'redis' || !/^rediss?:\/\//.test(env.REDIS_URL ?? '') || !/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL ?? '') || !/^[a-zA-Z0-9_-]{8,80}$/.test(env.BICAPTCHA_DEPLOYMENT_ID ?? '') || !['selfhost', 'cloud'].includes(env.BICAPTCHA_MODE ?? '') || env.BICAPTCHA_INGRESS !== 'isolated-tls') throw new Unavailable('Production configuration incomplete');
  appOrigin(env);
  const redis=new URL(env.REDIS_URL!); if(redis.username||!redis.password||redis.search||redis.hash) throw new Unavailable('Redis authentication required');
  const database=new URL(env.DATABASE_URL!); if(!database.username||!database.password||database.search||database.hash) throw new Unavailable('Postgres credentials required');
  if(new URL(env.APP_ORIGIN!).protocol!=='https:' || redis.hostname!=='redis' || database.hostname!=='postgres') throw new Unavailable('Production network topology unsupported');
  if(database.hostname==='postgres' && decodeURIComponent(database.password)!==env.POSTGRES_PASSWORD) throw new Unavailable('Postgres secret mismatch');
  if(decodeURIComponent(redis.password)!==env.REDIS_PASSWORD) throw new Unavailable('Redis secret mismatch');
  for (const k of ['JWT_SECRET', 'BICAPTCHA_SECRET', 'BICAPTCHA_VERIFY_SECRET']) signingKey(k,env);
}
