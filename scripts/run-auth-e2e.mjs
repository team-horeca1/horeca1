/**
 * Full auth matrix: seed → smoke → e2e → extended → cleanup (always).
 * Run: node scripts/run-auth-e2e.mjs
 *
 * Auth.js route is rate-limited to 30 req/min/IP — flush Redis RL keys (or wait)
 * between heavy suites so extended is not starved.
 */
import { spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

loadEnv();
loadEnv({ path: '.env.local', override: true });

function run(cmd, args) {
  console.log(`\n>>> ${cmd} ${args.join(' ')}\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: process.env });
  return r.status ?? 1;
}

function sleep(ms) {
  console.log(`\n>>> waiting ${Math.round(ms / 1000)}s for auth rate-limit window…\n`);
  spawnSync(process.platform === 'win32' ? 'powershell' : 'sleep',
    process.platform === 'win32'
      ? ['-Command', `Start-Sleep -Seconds ${Math.ceil(ms / 1000)}`]
      : [String(Math.ceil(ms / 1000))],
    { stdio: 'inherit' });
}

async function flushAuthRateLimits() {
  const url = process.env.REDIS_URL;
  if (!url) {
    sleep(65_000);
    return;
  }
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redis.connect();
    const keys = await redis.keys('rl:auth:*');
    if (keys.length) {
      await redis.del(...keys);
      console.log(`\n>>> flushed ${keys.length} Redis auth rate-limit key(s)\n`);
    } else {
      console.log('\n>>> no Redis auth rate-limit keys to flush\n');
    }
    await redis.quit();
  } catch (e) {
    console.warn('>>> Redis flush failed, falling back to wait:', e?.message ?? e);
    sleep(65_000);
  }
}

let code = 0;
try {
  code = run('npx', ['tsx', 'scripts/auth-e2e-seed.ts']);
  if (code === 0) code = run('node', ['scripts/auth-smoke.mjs']);
  if (code === 0) code = run('node', ['scripts/auth-audit-e2e.mjs']);
  if (code === 0) await flushAuthRateLimits();
  if (code === 0) code = run('npx', ['tsx', 'scripts/auth-audit-extended.ts']);
  if (code === 0) await flushAuthRateLimits();
  if (code === 0) code = run('npx', ['tsc', '--noEmit']);
} finally {
  const cleanup = run('npx', ['tsx', 'scripts/auth-e2e-cleanup.ts']);
  if (cleanup !== 0 && code === 0) code = cleanup;
}

process.exit(code);
