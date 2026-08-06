/**
 * Manual production deploy — escape hatch when GitHub Actions cannot run
 * (hosted-runner outages) but GHCR already has the images.
 *
 *   npm run deploy:prod              # deploy the newest pushed image (:latest)
 *   npm run deploy:prod -- --sha=228a3d4fcfefca56279759ac070cc3a92ce1c04f
 *   npm run deploy:prod -- --dry-run # print the remote command only
 *
 * Runs the exact same droplet-side steps as the CI deploy job, so behaviour
 * cannot drift between manual and automated deploys. Requires SSH access as
 * root@<DROPLET_HOST>; set GHCR_TOKEN + GHCR_USER to refresh the registry login.
 */
import { spawnSync } from 'node:child_process';

const HOST = process.env.DROPLET_HOST ?? '64.227.187.210';
const args = process.argv.slice(2);
const shaArg = args.find((a) => a.startsWith('--sha='))?.slice('--sha='.length);
const sha = shaArg ?? process.env.DEPLOY_SHA ?? 'latest';
const dryRun = args.includes('--dry-run');

const login = process.env.GHCR_TOKEN && process.env.GHCR_USER
  ? `echo "${process.env.GHCR_TOKEN}" | docker login ghcr.io -u "${process.env.GHCR_USER}" --password-stdin`
  : 'echo "Using the droplet\'s existing GHCR credentials"';

const remote = [
  'set -e',
  login,
  'cd /opt/horeca1',
  'git fetch origin master',
  'git reset --hard origin/master',
  `DEPLOY_SHA=${sha} bash deploy.sh`,
].join(' && ');

console.log(`==> Manual deploy to ${HOST} (DEPLOY_SHA=${sha})`);

if (dryRun) {
  console.log(remote);
  process.exit(0);
}

const result = spawnSync(
  'ssh',
  ['-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=30', `root@${HOST}`, remote],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(`Deploy failed to start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
