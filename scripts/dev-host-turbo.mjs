/**
 * Next.js Turbopack on the Windows/macOS host (DB + Redis stay in Docker).
 * Native FS watching → reliable HMR without restarting.
 *
 *   npm run dev:db
 *   npm run dev:turbo
 */
import { spawn } from 'node:child_process';

process.env.NODE_OPTIONS = [
  process.env.NODE_OPTIONS,
  '--max-old-space-size=4096',
].filter(Boolean).join(' ');

process.env.__NEXT_DISABLE_MEMORY_WATCHER = '1';

// Next 16: `next dev` defaults to Turbopack (no --turbo flag needed).
const child = spawn('npx', ['next', 'dev', '--port', '3000'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
