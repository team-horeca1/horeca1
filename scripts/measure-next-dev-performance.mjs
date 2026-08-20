/**
 * Measure Next.js Turbopack dev performance (cold/warm/first request/incremental).
 *
 * Usage:
 *   node scripts/measure-next-dev-performance.mjs
 *   node scripts/measure-next-dev-performance.mjs --runs=2 --port=3010 --skip-incremental
 *
 * Writes:
 *   docs/perf/next-dev-bench.json
 *   docs/perf/next-dev-bench.md
 */
import { spawn, execSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'docs', 'perf');

function parseArgs(argv) {
  const opts = { runs: 1, port: 3010, skipIncremental: false, route: '/', controlRoute: '/login' };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--runs=')) opts.runs = Math.max(1, Number(a.slice(7)) || 1);
    else if (a.startsWith('--port=')) opts.port = Number(a.slice(7)) || 3010;
    else if (a === '--skip-incremental') opts.skipIncremental = true;
    else if (a.startsWith('--route=')) opts.route = a.slice(8);
    else if (a.startsWith('--control=')) opts.controlRoute = a.slice(10);
  }
  return opts;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function p95(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)];
}

async function waitForReady(logPath, timeoutMs) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (existsSync(logPath)) {
      const text = readFileSync(logPath, 'utf8');
      if (/✓ Ready in|Ready in /i.test(text) && !/Unable to acquire lock/i.test(text)) {
        const m = text.match(/Ready in ([\d.]+)\s*(ms|s)/i);
        let readyInMs = null;
        if (m) {
          readyInMs = m[2].toLowerCase() === 's' ? Number(m[1]) * 1000 : Number(m[1]);
        }
        return { startupMs: performance.now() - start, readyInMs, logSnippet: text.slice(-2000) };
      }
      if (/Unable to acquire lock/i.test(text)) {
        throw new Error('Another next dev holds .next/dev/lock — stop it and retry');
      }
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for Ready (${timeoutMs}ms). Log: ${existsSync(logPath) ? readFileSync(logPath, 'utf8').slice(-1500) : '(empty)'}`);
}

async function fetchTimed(url) {
  const t0 = performance.now();
  let ttfbMs = null;
  const res = await fetch(url, { redirect: 'manual' });
  ttfbMs = performance.now() - t0;
  const buf = await res.arrayBuffer();
  const totalMs = performance.now() - t0;
  return {
    status: res.status,
    ttfbMs: Math.round(ttfbMs),
    bodyMs: Math.round(totalMs),
    bytes: buf.byteLength,
  };
}

function rssMb(pid) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64"`,
        { encoding: 'utf8' },
      ).trim();
      if (!out) return null;
      return Math.round(Number(out) / (1024 * 1024));
    }
    const out = execSync(`ps -o rss= -p ${pid}`, { encoding: 'utf8' }).trim();
    return Math.round(Number(out) / 1024);
  } catch {
    return null;
  }
}

async function runOnce(opts, runIndex) {
  const logPath = join(OUT_DIR, `_dev-run-${opts.port}-${runIndex}.log`);
  if (existsSync(logPath)) unlinkSync(logPath);
  const logStream = createWriteStream(logPath, { flags: 'w' });

  const env = {
    ...process.env,
    PORT: String(opts.port),
    NODE_ENV: 'development',
    __NEXT_DISABLE_MEMORY_WATCHER: '1',
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=4096'].filter(Boolean).join(' '),
  };

  const child = spawn('npx', ['next', 'dev', '--port', String(opts.port)], {
    cwd: ROOT,
    env,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  const result = {
    runIndex,
    port: opts.port,
    startupMs: null,
    readyInMs: null,
    firstRequest: null,
    warmRequest: null,
    controlRequest: null,
    incrementalCompileMs: null,
    memoryMb: null,
    error: null,
  };

  try {
    const ready = await waitForReady(logPath, 180_000);
    result.startupMs = Math.round(ready.startupMs);
    result.readyInMs = ready.readyInMs != null ? Math.round(ready.readyInMs) : null;

    await sleep(500);
    const base = `http://127.0.0.1:${opts.port}`;
    result.firstRequest = await fetchTimed(`${base}${opts.route}`);
    result.warmRequest = await fetchTimed(`${base}${opts.route}`);
    result.controlRequest = await fetchTimed(`${base}${opts.controlRoute}`);

    if (!opts.skipIncremental) {
      const leaf = join(ROOT, 'src', 'components', 'layout', 'Footer.tsx');
      const original = readFileSync(leaf, 'utf8');
      const marker = `\n/* perf-bench-${Date.now()} */\n`;
      const t0 = performance.now();
      writeFileSync(leaf, original + marker);
      // Wait for either HMR log or warm request stability
      let sawHmr = false;
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const text = readFileSync(logPath, 'utf8');
        if (/Compiled|hmr|rebuilt|✓ Compiled/i.test(text.slice(-4000))) {
          sawHmr = true;
          break;
        }
      }
      await fetchTimed(`${base}${opts.route}`);
      result.incrementalCompileMs = Math.round(performance.now() - t0);
      writeFileSync(leaf, original);
      if (!sawHmr) result.incrementalNote = 'HMR log not detected; timed request cycle only';
    }

    result.memoryMb = rssMb(child.pid);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    child.kill('SIGTERM');
    await sleep(1000);
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    logStream.end();
  }

  return result;
}

function summarize(runs) {
  const ok = runs.filter((r) => !r.error && r.firstRequest);
  const pick = (fn) => ok.map(fn).filter((n) => typeof n === 'number' && !Number.isNaN(n));
  return {
    runs: runs.length,
    ok: ok.length,
    startupMs: { median: median(pick((r) => r.startupMs)), p95: p95(pick((r) => r.startupMs)) },
    readyInMs: { median: median(pick((r) => r.readyInMs)), p95: p95(pick((r) => r.readyInMs)) },
    firstRequestMs: { median: median(pick((r) => r.firstRequest?.bodyMs)), p95: p95(pick((r) => r.firstRequest?.bodyMs)) },
    firstTtfbMs: { median: median(pick((r) => r.firstRequest?.ttfbMs)), p95: p95(pick((r) => r.firstRequest?.ttfbMs)) },
    warmRequestMs: { median: median(pick((r) => r.warmRequest?.bodyMs)), p95: p95(pick((r) => r.warmRequest?.bodyMs)) },
    controlRequestMs: { median: median(pick((r) => r.controlRequest?.bodyMs)), p95: p95(pick((r) => r.controlRequest?.bodyMs)) },
    incrementalCompileMs: { median: median(pick((r) => r.incrementalCompileMs)), p95: p95(pick((r) => r.incrementalCompileMs)) },
    memoryMb: { median: median(pick((r) => r.memoryMb)), p95: p95(pick((r) => r.memoryMb)) },
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const opts = parseArgs(process.argv);
  console.log(`Measuring Next dev on port ${opts.port}, runs=${opts.runs}, route=${opts.route}`);

  const runs = [];
  for (let i = 0; i < opts.runs; i++) {
    console.log(`\n=== Run ${i + 1}/${opts.runs} ===`);
    const r = await runOnce(opts, i);
    runs.push(r);
    console.log(JSON.stringify(r, null, 2));
    if (i < opts.runs - 1) await sleep(2000);
  }

  const summary = summarize(runs);
  const payload = {
    measuredAt: new Date().toISOString(),
    platform: process.platform,
    opts,
    summary,
    runs,
  };

  const jsonPath = join(OUT_DIR, 'next-dev-bench.json');
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const md = `# Next Dev Performance Bench

Measured: **${payload.measuredAt}** · platform **${payload.platform}** · port **${opts.port}** · runs **${opts.runs}**

| Metric | Median | p95 |
|--------|-------:|----:|
| Startup (spawn→Ready) | ${summary.startupMs.median ?? '—'} | ${summary.startupMs.p95 ?? '—'} |
| Ready-in (Next reported) | ${summary.readyInMs.median ?? '—'} | ${summary.readyInMs.p95 ?? '—'} |
| First \`${opts.route}\` TTFB | ${summary.firstTtfbMs.median ?? '—'} | ${summary.firstTtfbMs.p95 ?? '—'} |
| First \`${opts.route}\` body | ${summary.firstRequestMs.median ?? '—'} | ${summary.firstRequestMs.p95 ?? '—'} |
| Warm \`${opts.route}\` body | ${summary.warmRequestMs.median ?? '—'} | ${summary.warmRequestMs.p95 ?? '—'} |
| Control \`${opts.controlRoute}\` body | ${summary.controlRequestMs.median ?? '—'} | ${summary.controlRequestMs.p95 ?? '—'} |
| Incremental (Footer touch) | ${summary.incrementalCompileMs.median ?? '—'} | ${summary.incrementalCompileMs.p95 ?? '—'} |
| Memory MB | ${summary.memoryMb.median ?? '—'} | ${summary.memoryMb.p95 ?? '—'} |

Raw JSON: \`docs/perf/next-dev-bench.json\`
`;
  writeFileSync(join(OUT_DIR, 'next-dev-bench.md'), md);
  console.log(`\nWrote ${jsonPath}`);
  console.log(md);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
