import { NextResponse } from 'next/server';
import { verifyCaptcha } from '@/lib/verifyCaptcha';

export async function POST(request: Request) {
  try {
    const { name, message, biCaptchaToken } = await request.json();

    // 1. Verify the invisible captcha token before processing the request
    const captchaResult = await verifyCaptcha(biCaptchaToken);

    if (!captchaResult.success) {
      return NextResponse.json({ 
        error: 'Bot detected or captcha failed', 
        details: captchaResult.error 
      }, { status: 403 });
    }

    // Optional: Check risk score for extra security
    // if (captchaResult.riskScore && captchaResult.riskScore > 0.4) {
    //   return NextResponse.json({ error: 'High risk interaction' }, { status: 403 });
    // }

    // 2. Process the actual form submission
    console.log(`Received message from ${name}: ${message}. Risk Score: ${captchaResult.riskScore}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Message sent successfully!',
      riskScore: captchaResult.riskScore
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
