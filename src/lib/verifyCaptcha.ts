import { captchaService } from './security/runtime';
import { context } from './security/captcha';
import { Unavailable } from './security/config';

/** Same-deployment server helper. External backends MUST use central siteverify.
 * Expected values come from backend configuration, NEVER the untrusted token/body.
 */
export async function verifyCaptcha(token: string, expectedSite: string, expectedAction: string, expectedHost: string) {
  try {
    return await captchaService().consume(token, context({ siteKey: expectedSite, action: expectedAction, host: expectedHost }));
  } catch (error) {
    if (error instanceof Unavailable) throw error;
    return { success: false as const };
  }
}
