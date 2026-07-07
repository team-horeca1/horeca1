// Email provider adapter — Nodemailer + Gmail SMTP.
// If EMAIL_USER / EMAIL_PASS are not set, logs in dev and returns { sent: false }.

import nodemailer from 'nodemailer';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  name?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  sent: boolean;
}

const FROM = process.env.EMAIL_FROM ?? 'HoReCa Hub <team.horeca1@gmail.com>';

let cachedTransporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter) return cachedTransporter;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS?.replace(/\s/g, '');
  if (!user || !pass) return null;
  cachedTransporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE ?? 'gmail',
    host: process.env.EMAIL_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT ?? '465'),
    secure: true,
    auth: { user, pass },
    // Fail fast — never block API responses on a hung SMTP connection.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return cachedTransporter;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const transporter = getTransporter();
  if (!transporter) {
    const msg = `[email] SMTP not configured — could not send "${input.subject}" to ${input.to}`;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[email:dev]', input.subject, '→', input.to, '\n', input.text.slice(0, 200));
    } else {
      console.error(msg);
    }
    return { sent: false };
  }
  const html = input.html ?? `<p>${input.text.replace(/\n/g, '<br>')}</p>`;
  await transporter.sendMail({
    from: FROM,
    to: input.name ? `${input.name} <${input.to}>` : input.to,
    subject: input.subject,
    text: input.text,
    html,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return { sent: true };
}

/** Fire-and-forget — invite/credential emails must not block HTTP responses. */
export function sendEmailInBackground(input: SendEmailInput, label = 'email'): void {
  void sendEmail(input).catch((err) => console.error(`[${label}]`, err));
}
