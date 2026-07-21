import { execFileSync } from 'node:child_process';

const SSH_HOST = process.env.E2E_PROD_SSH_HOST ?? 'root@64.227.187.210';
const DB_CONTAINER = process.env.E2E_PROD_DB_CONTAINER ?? 'horeca1-db';

/**
 * Read the latest unused OTP for an email from production Postgres (via SSH).
 * Used only for opt-in production Playwright registration.
 */
export function fetchProdEmailOtp(email: string, attempts = 8): string {
  const safeEmail = email.replace(/'/g, "''").toLowerCase();
  const sql =
    `SELECT code FROM otp_codes WHERE lower(email) = '${safeEmail}' `
    + `AND used = false AND expires_at > NOW() `
    + `ORDER BY created_at DESC LIMIT 1;`;

  let last = '';
  for (let i = 0; i < attempts; i += 1) {
    try {
      const out = execFileSync(
        'ssh',
        [
          '-o', 'ConnectTimeout=20',
          '-o', 'StrictHostKeyChecking=accept-new',
          SSH_HOST,
          `docker exec -i ${DB_CONTAINER} psql -U horeca1 -d horeca1 -tA`,
        ],
        {
          input: sql,
          encoding: 'utf8',
          timeout: 45_000,
          windowsHide: true,
        },
      );
      const code = out.trim().split(/\r?\n/).filter(Boolean)[0] ?? '';
      if (/^\d{4}$/.test(code)) return code;
      last = out.trim();
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    const until = Date.now() + 900;
    while (Date.now() < until) {
      /* spin */
    }
  }
  throw new Error(`Could not fetch OTP for ${email}. Last: ${last.slice(0, 200)}`);
}
