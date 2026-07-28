/**
 * Fresh Docker Next.js start — clears stale Turbopack/.next caches that can
 * keep serving old UI after source edits (especially on Windows bind mounts).
 *
 * Usage: npm run dev:fresh
 */
import { execSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const compose = ['-f', 'docker/docker-compose.dev.yml'];

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin — avoid Atomics/SharedArrayBuffer quirks on some Windows Node builds */
  }
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: root, shell: true, ...opts });
}

console.log('[dev:fresh] Stopping app-dev…');
try {
  // Stop + remove only the app container so the bind mount releases .next locks.
  // Do NOT use --remove-orphans — that can tear down postgres/redis on a shared network.
  run(`docker compose ${compose.join(' ')} stop app-dev`);
  run(`docker compose ${compose.join(' ')} rm -f app-dev`);
} catch {
  try {
    execSync('docker stop horeca1-app-dev', { stdio: 'pipe', shell: true });
    execSync('docker rm -f horeca1-app-dev', { stdio: 'pipe', shell: true });
  } catch {
    /* ignore */
  }
}

sleep(800);

const nextDir = join(root, '.next');
if (existsSync(nextDir)) {
  console.log('[dev:fresh] Removing host .next cache…');
  let removed = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      rmSync(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      removed = true;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[dev:fresh] .next delete attempt ${attempt}/5 failed: ${msg}`);
      sleep(500 * attempt);
    }
  }

  if (!removed && existsSync(nextDir)) {
    // Last resort: rename so Next can create a fresh .next (old folder cleaned later)
    const stash = join(root, `.next.stale-${Date.now()}`);
    try {
      renameSync(nextDir, stash);
      console.warn(`[dev:fresh] Could not delete .next — renamed to ${stash}`);
      console.warn('[dev:fresh] Delete that folder manually when nothing is locking it.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[dev:fresh] Could not clear .next (${msg}). Continuing anyway — HMR/poll should still work.`);
    }
  }
}

// Leftover named volume from older compose files
for (const vol of ['docker_horeca1_dev_next_cache', 'horeca1_dev_next_cache']) {
  try {
    execSync(`docker volume rm ${vol}`, { stdio: 'pipe', shell: true });
    console.log(`[dev:fresh] Removed docker volume ${vol}`);
  } catch {
    /* volume may not exist */
  }
}

console.log('[dev:fresh] Starting app-dev…');
run(`docker compose ${compose.join(' ')} up`);
