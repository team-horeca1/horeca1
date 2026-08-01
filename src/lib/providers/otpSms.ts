/**
 * Phone OTP via MSG91 Verify API (`/api/v5/otp`) — same path as login/register.
 * Delivery POD OTP must use this so customers get the same SMS experience.
 */
export async function sendPhoneOtp(phoneRaw: string, otp: string): Promise<void> {
  const digits = phoneRaw.replace(/\D/g, '');
  const phone =
    digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (phone.length < 10) {
    throw new Error('Customer phone number is missing or invalid');
  }

  const authKey = process.env.MSG91_AUTH_KEY?.trim();
  const templateId = (
    process.env.MSG91_OTP_TEMPLATE_ID ?? process.env.MSG91_TEMPLATE_ID
  )?.trim();
  const sender = process.env.MSG91_SENDER_ID?.trim() || 'HCXGBL';

  const keyOk = !!authKey && authKey !== 'xxx' && !authKey.includes('your_');
  const templateOk =
    !!templateId && templateId !== 'xxx' && !templateId.includes('your_');

  if (!keyOk || !templateOk) {
    console.log(`[OTP:dev] +91${phone} → ${otp}`);
    return;
  }

  const mobile = `91${phone}`;
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('authkey', authKey!);
  url.searchParams.set('template_id', templateId!);
  url.searchParams.set('mobile', mobile);
  url.searchParams.set('otp', otp);
  url.searchParams.set('otp_expiry', '10');
  url.searchParams.set('sender', sender);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MSG91 error: ${await res.text()}`);
}
