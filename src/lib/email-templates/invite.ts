import { CDL } from '@/lib/cdl';
// Invite-email template helper.
// Builds the subject / text / HTML payload sent to a new team member when
// an admin / vendor / brand owner creates their account.

export interface InviteEmailParams {
  recipientName: string;       // their fullName (or "there" if blank)
  recipientEmail: string;      // their login email — included in the body
  tempPassword: string;        // the password the admin typed when inviting
  scope: 'admin' | 'vendor' | 'brand' | 'customer'; // for subject + body context
  businessName: string;        // the vendor / brand / account they're joining
  loginUrl: string;            // absolute URL, e.g. https://app.horeca1.com/login
  inviterName?: string;        // who invited them (optional)
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c]!);

const scopeLabel: Record<InviteEmailParams['scope'], string> = {
  admin: 'admin',
  vendor: 'vendor',
  brand: 'brand',
  customer: 'customer',
};

export function buildInviteEmail(p: InviteEmailParams): {
  subject: string;
  text: string;
  html: string;
} {
  const greetingName = p.recipientName.trim() || 'there';
  const role = scopeLabel[p.scope];
  const inviterFragment = p.inviterName ? ` by ${p.inviterName}` : '';

  const subject = `You're invited to ${p.businessName} on HoReCa Hub`;

  // ───── plain-text fallback ─────
  const text = [
    `Hello ${greetingName},`,
    '',
    `You've been invited${inviterFragment} to join ${p.businessName} on HoReCa Hub as a ${role} team member.`,
    '',
    'Use the credentials below to sign in:',
    '',
    `  Login URL: ${p.loginUrl}`,
    `  Email:     ${p.recipientEmail}`,
    `  Password:  ${p.tempPassword}`,
    '',
    'Please change your password after first login from your account settings.',
    '',
    '— The HoReCa Hub team',
  ].join('\n');

  // ───── HTML version (inline styles only, no remote assets) ─────
  const safeName = esc(greetingName);
  const safeBusiness = esc(p.businessName);
  const safeEmail = esc(p.recipientEmail);
  const safePassword = esc(p.tempPassword);
  const safeInviter = p.inviterName ? esc(p.inviterName) : '';
  const safeLoginUrl = esc(p.loginUrl);
  const safeRole = esc(role);

  const inviterHtmlFragment = safeInviter
    ? ` by <strong>${safeInviter}</strong>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2a24;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e8e5;">
          <tr>
            <td style="padding:24px 32px;border-top:4px solid ${CDL.primary};">
              <h1 style="margin:0;font-size:22px;line-height:1.3;color:#1f2a24;">You're invited to ${safeBusiness}</h1>
              <p style="margin:8px 0 0;font-size:14px;color:#6b7770;">on HoReCa Hub</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;">
              <p style="margin:16px 0 0;font-size:15px;line-height:1.55;">Hello ${safeName},</p>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.55;">
                You've been invited${inviterHtmlFragment} to join <strong>${safeBusiness}</strong> on HoReCa Hub as a <strong>${safeRole}</strong> team member.
              </p>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.55;">Use the credentials below to sign in:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7faf8;border:1px solid #d8e6dd;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #e3ece6;">
                    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7770;">Login URL</div>
                    <div style="margin-top:4px;font-size:14px;word-break:break-all;"><a href="${safeLoginUrl}" style="color:${CDL.primary};text-decoration:none;">${safeLoginUrl}</a></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #e3ece6;">
                    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7770;">Email</div>
                    <div style="margin-top:4px;font-size:14px;font-family:Consolas,Monaco,'Courier New',monospace;word-break:break-all;">${safeEmail}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;">
                    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7770;">Password</div>
                    <div style="margin-top:4px;font-size:14px;font-family:Consolas,Monaco,'Courier New',monospace;word-break:break-all;">${safePassword}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 32px 8px;">
              <a href="${safeLoginUrl}" style="display:inline-block;background:${CDL.primary};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">Sign in to HoReCa Hub</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;">
              <p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#6b7770;">Please change your password after first login from your account settings.</p>
              <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6b7770;">— The HoReCa Hub team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export interface InviteSmsParams {
  recipientName: string;
  loginIdentifier: string; // email or phone
  tempPassword: string;
  businessName: string;
  loginUrl: string;
  inviterName?: string;
}

export function buildInviteSms(p: InviteSmsParams): string {
  const name = p.recipientName.trim() || 'there';
  const inviter = p.inviterName?.trim() ? ` by ${p.inviterName.trim()}` : '';
  return [
    `Hello ${name}, you've been invited${inviter} to ${p.businessName} on HoReCa Hub.`,
    `Login: ${p.loginUrl}`,
    `User: ${p.loginIdentifier}`,
    `Password: ${p.tempPassword}`,
    'Change your password after first login.',
  ].join(' ');
}
