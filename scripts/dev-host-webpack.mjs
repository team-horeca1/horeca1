/**
 * Fallback: Next dev on the Windows/macOS host with Webpack (not default).
 * Prefer `npm run dev` — Turbopack in Linux via docker/docker-compose.dev.yml.
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
