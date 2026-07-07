/**
 * One-shot production deploy: sync Resend env, pull latest master, deploy SHA-pinned image.
 * Uses credentials from local git remote (origin fetch URL) for GitHub + GHCR.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

const REMOTE = 'root@64.227.187.210';
const ENV_PATH = '/opt/horeca1/.env.production';
const DEPLOY_SHA = process.env.DEPLOY_SHA ?? execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

function runRemoteScript(name, lines) {
  const local = join(tmpdir(), `horeca1-${name}-${Date.now()}.sh`);
  const remote = `/tmp/horeca1-${name}.sh`;
  writeFileSync(local, `#!/bin/bash\nset -euo pipefail\n${lines.join('\n')}\n`, 'utf8');
  try {
    execSync(`scp -o ConnectTimeout=20 "${local}" ${REMOTE}:${remote}`, { stdio: 'inherit' });
    execSync(`ssh -o ConnectTimeout=20 ${REMOTE} "chmod +x ${remote} && bash ${remote}"`, { stdio: 'inherit' });
  } finally {
    try {
      unlinkSync(local);
    } catch {
      /* ignore */
    }
    execSync(`ssh -o ConnectTimeout=20 ${REMOTE} "rm -f ${remote}"`, { stdio: 'ignore' });
  }
}

function parseGitAuthUrl() {
  const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  const m = url.match(/^https:\/\/([^:]+):([^@]+)@github\.com\/(.+?)(?:\.git)?$/);
  if (!m) throw new Error('origin must be https://user:token@github.com/org/repo for deploy');
  return { user: m[1], token: m[2], repo: m[3] };
}

function syncResendKey() {
  const env = readFileSync('.env.local', 'utf8');
  const match = env.match(/^RESEND_API_KEY=(.+)$/m);
  if (!match) throw new Error('RESEND_API_KEY not found in .env.local');
  const key = match[1].trim().replace(/'/g, "'\\''");
  const fromLine = 'HoReCa Hub <noreply@freshville.store>';

  console.log('Syncing RESEND_API_KEY + EMAIL_FROM to production...');
  runRemoteScript('sync-resend', [
    `KEY='${key}'`,
    `FROM='${fromLine}'`,
    `if grep -q '^RESEND_API_KEY=' ${ENV_PATH}; then`,
    `  sed -i '/^RESEND_API_KEY=/d' ${ENV_PATH}`,
    `fi`,
    `echo "RESEND_API_KEY=$KEY" >> ${ENV_PATH}`,
    `if grep -q '^EMAIL_FROM=' ${ENV_PATH}; then`,
    `  sed -i "s|^EMAIL_FROM=.*|EMAIL_FROM=$FROM|" ${ENV_PATH}`,
    `else`,
    `  echo "EMAIL_FROM=$FROM" >> ${ENV_PATH}`,
    `fi`,
    `echo "RESEND lines: $(grep -c '^RESEND_API_KEY=' ${ENV_PATH})"`,
  ]);
}

function deploy() {
  const { user, token, repo } = parseGitAuthUrl();
  const authRepo = `https://${user}:${token}@github.com/${repo}.git`;

  console.log(`Deploying ${DEPLOY_SHA} to production...`);
  runRemoteScript('deploy', [
    `echo '${token.replace(/'/g, "'\\''")}' | docker login ghcr.io -u '${user.replace(/'/g, "'\\''")}' --password-stdin || echo "WARN: GHCR login failed — will build on droplet if pull fails"`,
    'cd /opt/horeca1',
    `git remote set-url origin '${authRepo.replace(/'/g, "'\\''")}'`,
    'export DEPLOY_IMAGE=ghcr.io/aneeverse/horeca1',
    `export DEPLOY_SHA=${DEPLOY_SHA}`,
    'bash deploy.sh',
    'echo -n "RESEND_API_KEY chars in container: "',
    'docker exec horeca1-app printenv RESEND_API_KEY | wc -c',
  ]);
}

if (process.env.SKIP_RESEND_SYNC !== '1') {
  syncResendKey();
} else {
  console.log('Skipping Resend sync (SKIP_RESEND_SYNC=1)');
}
if (process.env.ONLY_RESEND === '1') {
  console.log('Resend sync only (ONLY_RESEND=1)');
  process.exit(0);
}
deploy();
console.log('Done.');
