// Email provider — Resend HTTP API (production / cloud) with Nodemailer SMTP fallback (local dev).
// DigitalOcean blocks outbound SMTP (25/465/587), so production must use Resend (HTTPS :443).

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

const DEFAULT_FROM = 'HoReCa Hub <onboarding@resend.dev>';

function resolveFrom(): string {
  return process.env.EMAIL_FROM ?? DEFAULT_FROM;
}

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false };

  const html = input.html ?? `<p>${input.text.replace(/\n/g, '<br>')}</p>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resolveFrom(),
      to: [input.to],
      subject: input.subject,
      html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }

  return { sent: true };
}

let cachedTransporter: nodemailer.Transporter | null = null;
function getSmtpTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter) return cachedTransporter;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS?.replace(/\s/g, '');
  if (!user || !pass) return null;

  const port = Number(process.env.EMAIL_PORT ?? '465');
  const secure = port === 465;

  cachedTransporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE ?? 'gmail',
    host: process.env.EMAIL_HOST ?? 'smtp.gmail.com',
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return cachedTransporter;
}

async function sendViaSmtp(input: SendEmailInput): Promise<SendEmailResult> {
  const transporter = getSmtpTransporter();
  if (!transporter) return { sent: false };

  const html = input.html ?? `<p>${input.text.replace(/\n/g, '<br>')}</p>`;
  await transporter.sendMail({
    from: resolveFrom(),
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

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // Prefer Resend on cloud hosts — SMTP ports are blocked on DigitalOcean droplets.
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendViaResend(input);
    } catch (err) {
      console.error('[email:resend]', err instanceof Error ? err.message : err);
      // Fall through to SMTP only when explicitly configured (local / unblocked networks).
    }
  }

  const transporter = getSmtpTransporter();
  if (!transporter) {
    const msg = `[email] No provider configured — could not send "${input.subject}" to ${input.to}`;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[email:dev]', input.subject, '→', input.to, '\n', input.text.slice(0, 200));
    } else {
      console.error(msg);
    }
    return { sent: false };
  }

  try {
    return await sendViaSmtp(input);
  } catch (err) {
    console.error('[email:smtp]', err instanceof Error ? err.message : err);
    return { sent: false };
  }
}

/** Fire-and-forget — invite/credential emails must not block HTTP responses. */
export function sendEmailInBackground(input: SendEmailInput, label = 'email'): void {
  void sendEmail(input).catch((err) => console.error(`[${label}]`, err));
}
