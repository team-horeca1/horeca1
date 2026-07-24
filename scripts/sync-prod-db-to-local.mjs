/**
 * Clone prod Postgres (via SSH tunnel on :5433) into local Docker Postgres (:5432).
 *
 * Prerequisites:
 *   1. docker compose -f docker/docker-compose.yml up -d
 *   2. npm run tunnel   (keeps 5433 → prod)
 *   3. Set PROD_TUNNEL_DATABASE_URL (password via tunnel host), e.g.:
 *        $env:PROD_TUNNEL_DATABASE_URL="postgresql://horeca1:PROD_PASS@host.docker.internal:5433/horeca1"
 *
 * Usage: npm run db:sync-from-prod
 */
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DUMP_DIR = resolve(ROOT, 'tmp-local-db');
const DUMP_FILE = 'prod.dump';

function readEnvFile(name) {
  const path = resolve(ROOT, name);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Convert a host URL aimed at 127.0.0.1:5433 into a URL containers can reach. */
function toDockerHostUrl(url) {
  return url
    .replace('127.0.0.1:5433', 'host.docker.internal:5433')
    .replace('localhost:5433', 'host.docker.internal:5433');
}

const fileEnv = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
const prodUrl =
  process.env.PROD_TUNNEL_DATABASE_URL
  ?? (fileEnv.DATABASE_URL?.includes(':5433') ? toDockerHostUrl(fileEnv.DATABASE_URL) : null);

if (!prodUrl) {
  console.error(`
Missing prod tunnel URL.

Start the tunnel, then either:
  1) Temporarily set DATABASE_URL in .env.local to 127.0.0.1:5433 (prod password), or
  2) $env:PROD_TUNNEL_DATABASE_URL="postgresql://horeca1:PASS@host.docker.internal:5433/horeca1"

Then re-run: npm run db:sync-from-prod
`);
  process.exit(1);
}

const localUrl =
  process.env.LOCAL_DATABASE_URL
  ?? 'postgresql://horeca1:horeca1_dev@host.docker.internal:5432/horeca1';

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

mkdirSync(DUMP_DIR, { recursive: true });

console.log('\n1) Dumping prod via tunnel…');
run('docker', [
  'run', '--rm',
  '-v', `${DUMP_DIR.replace(/\\/g, '/')}:/dump`,
  'postgres:17-alpine',
  'pg_dump', prodUrl, '-Fc', '-f', `/dump/${DUMP_FILE}`,
]);

console.log('\n2) Copying dump into horeca1-db…');
run('docker', ['cp', `${DUMP_DIR}/${DUMP_FILE}`, 'horeca1-db:/tmp/prod.dump']);

console.log('\n3) Restoring into local Docker Postgres…');
run('docker', [
  'exec', 'horeca1-db',
  'pg_restore', '-U', 'horeca1', '-d', 'horeca1',
  '--clean', '--if-exists', '--no-owner', '--no-acl',
  '/tmp/prod.dump',
]);

console.log('\n4) Verifying…');
run('docker', [
  'run', '--rm', 'postgres:17-alpine',
  'psql', localUrl, '-c',
  "SELECT pg_size_pretty(pg_database_size('horeca1')) AS size, (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM vendors) AS vendors, (SELECT count(*) FROM products) AS products;",
]);

console.log('\nDone. Start local DB with `npm run dev:db`, then `npm run dev`.');
console.log('With prod tunnel: `npm run tunnel` + set TUNNEL_* URLs in .env (host.docker.internal:5433), then `npm run dev:tunnel`.');
