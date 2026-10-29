import { jwtVerify } from 'jose';

const VERIFY_SECRET_KEY = new TextEncoder().encode(process.env.BICAPTCHA_VERIFY_SECRET || 'another-super-secret-key-32-chars-long');

export interface BiCaptchaResult {
  success: boolean;
  riskScore?: number;
  error?: string;
}

export async function verifyCaptcha(token: string): Promise<BiCaptchaResult> {
  if (!token) {
    return { success: false, error: 'Token is required' };
  }

  try {
    const { payload } = await jwtVerify(token, VERIFY_SECRET_KEY);
    
    // Check if the payload says it was verified
    if (payload.verified === true) {
      return { 
        success: true, 
        riskScore: payload.riskScore as number
      };
    } else {
      return { success: false, error: 'Token is not marked as verified' };
    }
  } catch (error) {
    return { success: false, error: 'Invalid or expired captcha token' };
  }
}
