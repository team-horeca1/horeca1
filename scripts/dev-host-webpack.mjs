/**
 * EMERGENCY ONLY: Next.js Webpack on the host.
 * Prefer `npm run dev:turbo` or Docker `npm run dev` (Turbopack).
 * See docs/dev-speed.md — Webpack cold route compiles are multi‑minute and
 * must not be used for normal work or Playwright e2e.
 */
import { spawn } from 'node:child_process';

process.env.NODE_OPTIONS = [
  process.env.NODE_OPTIONS,
  '--max-old-space-size=4096',
].filter(Boolean).join(' ');

process.env.__NEXT_DISABLE_MEMORY_WATCHER = '1';

const child = spawn('npx', ['next', 'dev', '--webpack'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
