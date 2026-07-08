import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const env = readFileSync('.env.local', 'utf8');
const match = env.match(/^RESEND_API_KEY=(.+)$/m);
if (!match) {
  console.error('RESEND_API_KEY not found in .env.local');
  process.exit(1);
}
const key = match[1].trim().replace(/'/g, "'\\''");

const remote = `root@64.227.187.210`;
const envPath = '/opt/horeca1/.env.production';
const fromLine = "EMAIL_FROM=HoReCa Hub <noreply@freshville.store>";

const shell = `
if grep -q '^RESEND_API_KEY=' ${envPath} 2>/dev/null; then
  sed -i 's|^RESEND_API_KEY=.*|RESEND_API_KEY=${key}|' ${envPath}
  echo RESEND_UPDATED
else
  echo "RESEND_API_KEY=${key}" >> ${envPath}
  echo RESEND_ADDED
fi
if grep -q '^EMAIL_FROM=' ${envPath} 2>/dev/null; then
  sed -i 's|^EMAIL_FROM=.*|${fromLine}|' ${envPath}
else
  echo '${fromLine}' >> ${envPath}
fi
grep -c '^RESEND_API_KEY=' ${envPath}
`;

const out = execSync(`ssh ${remote} "${shell.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
console.log(out.trim());
