/**
 * Dev server launcher — Webpack + 4GB Node heap.
 * Turbopack (Next 16 default) was hanging mid-compile on Windows and ballooning
 * to 2GB+ RAM, which then timed out Prisma auth JWT checks and left Admin View
 * stuck on the spinner. Production build already uses `--webpack`.
 *
 * Also disable Next's memory watcher: it auto-restarts around ~2GB, which wipes
 * the webpack compile cache mid-session and makes every page look "stuck"
 * compiling again. Cross-platform (Windows PowerShell + Unix shells).
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
