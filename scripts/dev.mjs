/**
 * Dev server launcher — Turbopack (Next 16 default) + 4GB Node heap.
 * Cross-platform (Windows PowerShell + Unix shells).
 */
import { spawn } from 'node:child_process';

process.env.NODE_OPTIONS = [
  process.env.NODE_OPTIONS,
  '--max-old-space-size=4096',
].filter(Boolean).join(' ');

const child = spawn('npx', ['next', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
