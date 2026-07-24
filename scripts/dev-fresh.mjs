/**
 * Fresh Docker Next.js start — clears stale Turbopack/.next caches that can
 * keep serving old UI after source edits (especially on Windows bind mounts).
 *
 * Usage: npm run dev:fresh
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const compose = ['-f', 'docker/docker-compose.dev.yml'];

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: root, shell: true, ...opts });
}

console.log('[dev:fresh] Stopping app-dev…');
try {
  run(`docker compose ${compose.join(' ')} stop app-dev`);
} catch {
  /* ignore */
}

const nextDir = join(root, '.next');
if (existsSync(nextDir)) {
  console.log('[dev:fresh] Removing host .next cache…');
  rmSync(nextDir, { recursive: true, force: true });
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
