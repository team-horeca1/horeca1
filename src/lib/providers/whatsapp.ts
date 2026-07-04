/**
 * WhatsApp notification provider — env-gated, console fallback in dev.
 * Mirrors providers/sms.ts pattern.
 */
import { sendSms } from '@/lib/providers/sms';

export async function sendWhatsApp(to: string, message: string): Promise<void> {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'console';
  const apiKey = process.env.WHATSAPP_API_KEY;

  if (provider === 'console' || !apiKey) {
    console.log(`[WhatsApp stub] to=${to} message=${message.slice(0, 120)}`);
    return;
  }

  if (provider === 'msg91') {
    await sendSms({ to, body: message, channel: 'whatsapp' });
    return;
  }

  console.log(`[WhatsApp] unknown provider=${provider}, message logged only`);
}
