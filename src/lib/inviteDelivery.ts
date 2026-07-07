import { sendEmail, sendEmailInBackground } from '@/lib/providers/email';
import { sendSms } from '@/lib/providers/sms';

export interface CredentialDeliveryResult {
  email: boolean;
  sms: boolean;
}

function emailProviderConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY ||
    (process.env.EMAIL_USER && process.env.EMAIL_PASS),
  );
}

function smsProviderConfigured(): boolean {
  return Boolean(process.env.MSG91_AUTH_KEY);
}

interface InviteEmailContent {
  subject: string;
  text: string;
  html?: string;
  name?: string;
}

interface DeliverInviteCredentialsInput {
  email?: string | null;
  phone?: string | null;
  emailContent?: InviteEmailContent;
  smsBody?: string;
  /** Vendor/account pattern: SMS only when invitee has no email. */
  smsOnlyIfNoEmail?: boolean;
}

/** Send invite credentials; await Resend/MSG91 (fast HTTP), background only for SMTP. */
export async function deliverInviteCredentials(
  input: DeliverInviteCredentialsInput,
): Promise<CredentialDeliveryResult> {
  const result: CredentialDeliveryResult = { email: false, sms: false };

  if (input.email && input.emailContent && emailProviderConfigured()) {
    const payload = {
      to: input.email,
      subject: input.emailContent.subject,
      text: input.emailContent.text,
      html: input.emailContent.html,
      name: input.emailContent.name,
    };
    if (process.env.RESEND_API_KEY) {
      try {
        const { sent } = await sendEmail(payload);
        result.email = sent;
      } catch (err) {
        console.error('[invite-delivery:email]', err instanceof Error ? err.message : err);
      }
    } else {
      sendEmailInBackground(payload, 'invite-email');
      result.email = true;
    }
  }

  const shouldSendSms =
    Boolean(input.phone && input.smsBody && smsProviderConfigured()) &&
    (!input.smsOnlyIfNoEmail || !input.email);

  if (shouldSendSms && input.phone && input.smsBody) {
    try {
      await sendSms({ to: input.phone, body: input.smsBody, channel: 'sms' });
      result.sms = true;
    } catch (err) {
      console.error('[invite-delivery:sms]', err instanceof Error ? err.message : err);
    }
  }

  return result;
}
