import { verifyCaptcha } from '@/lib/verifyCaptcha';
import { csrf, failure, HttpError, json, rate, readJson, text } from '@/lib/security/http';
import { Unavailable } from '@/lib/security/config';
export async function POST(request: Request) {
  try {
    csrf(request);
    await rate('contact', 'global', 30);
    const site = process.env.DEMO_SITE_KEY, host = process.env.DEMO_HOSTNAME;
    if (!site || !host) throw new Unavailable('Demo not configured');
    const body = await readJson(request, 8192);
    text(body.name, 100); text(body.message, 4000);
    const result = await verifyCaptcha(text(body.biCaptchaToken, 2048), site, 'contact', host);
    if (!result.success) throw new HttpError(403);
    // Demo only: no PII is logged and no message-delivery backend is implied.
    return json({ success: true, message: 'Demo submission verified; no message was sent.' });
  } catch (error) { return failure(error); }
}
