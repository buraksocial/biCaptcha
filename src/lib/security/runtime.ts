import { prisma } from '../prisma';
import { CaptchaService } from './captcha';
import { signingKey, Unavailable } from './config';
import { getState } from './state';
import { receipt } from './ledger';
export function captchaService() {
  const durable = process.env.BICAPTCHA_STATE === 'redis';
  return new CaptchaService({ state: getState(), deployment: durable ? process.env.BICAPTCHA_DEPLOYMENT_ID : undefined, durableConsume: durable ? receipt : undefined, challengeKey: signingKey('BICAPTCHA_SECRET'), tokenKey: signingKey('BICAPTCHA_VERIFY_SECRET'), findSite: async (siteKey) => { try { return await prisma.site.findUnique({ where: { siteKey } }); } catch { throw new Unavailable('Database unavailable'); } } });
}
