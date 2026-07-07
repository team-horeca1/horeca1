import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const env = readFileSync('.env.local', 'utf8');
const match = env.match(/^RESEND_API_KEY=(.+)$/m);
if (!match) {
  console.error('RESEND_API_KEY not found in .env.local');
  process.exit(1);
}
const key = match[1].trim();
const count = execSync(
  `ssh root@64.227.187.210 "grep -c '^RESEND_API_KEY=' /opt/horeca1/.env.production 2>/dev/null || echo 0"`,
  { encoding: 'utf8' },
).trim();

if (count === '0') {
  execSync(
    `ssh root@64.227.187.210 "echo 'RESEND_API_KEY=${key}' >> /opt/horeca1/.env.production"`,
    { stdio: 'inherit' },
  );
  console.log('Added RESEND_API_KEY to production');
} else {
  execSync(
    `ssh root@64.227.187.210 "sed -i 's/^RESEND_API_KEY=.*/RESEND_API_KEY=${key}/' /opt/horeca1/.env.production"`,
    { stdio: 'inherit' },
  );
  console.log('Updated RESEND_API_KEY on production');
}

// Resend requires a verified-domain From address for external recipients.
const fromLine = 'EMAIL_FROM=HoReCa Hub <noreply@freshville.store>';
const fromCount = execSync(
  `ssh root@64.227.187.210 "grep -c '^EMAIL_FROM=' /opt/horeca1/.env.production 2>/dev/null || echo 0"`,
  { encoding: 'utf8' },
).trim();
if (fromCount === '0') {
  execSync(`ssh root@64.227.187.210 "echo '${fromLine}' >> /opt/horeca1/.env.production"`, { stdio: 'inherit' });
} else {
  execSync(
    `ssh root@64.227.187.210 "sed -i 's|^EMAIL_FROM=.*|${fromLine}|' /opt/horeca1/.env.production"`,
    { stdio: 'inherit' },
  );
}
console.log('Set EMAIL_FROM to noreply@freshville.store (verify domain in Resend)');

execSync(
  'ssh root@64.227.187.210 "cd /opt/horeca1/docker && docker compose -f docker-compose.prod.yml up -d --force-recreate app worker"',
  { stdio: 'inherit' },
);
