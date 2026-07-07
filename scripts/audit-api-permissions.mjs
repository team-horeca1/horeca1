/**
 * Audit API routes for missing granular permission checks.
 * Usage: node scripts/audit-api-permissions.mjs [--strict]
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(process.cwd(), 'src', 'app', 'api', 'v1');
const strict = process.argv.includes('--strict');

const GATE_PATTERNS = [
  /\badminOnly\s*\(/,
  /\bvendorOnly\s*\(/,
  /\bbrandOnly\s*\(/,
];

const PERM_PATTERNS = [
  /\brequirePermission\s*\(/,
  /\brequireAnyPermissionInline\s*\(/,
  /\bassertAccountPermission\s*\(/,
  /\brequireStorefrontAccess\s*\(/,
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (name === 'route.ts') files.push(p);
  }
  return files;
}

const findings = [];

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  const hasGate = GATE_PATTERNS.some((re) => re.test(src));
  if (!hasGate) continue;
  const hasPerm = PERM_PATTERNS.some((re) => re.test(src));
  if (!hasPerm) {
    findings.push(relative(process.cwd(), file));
  }
}

if (findings.length === 0) {
  console.log('audit-api-permissions: all gated routes include a permission check.');
  process.exit(0);
}

console.log(`audit-api-permissions: ${findings.length} route file(s) may lack granular permission checks:\n`);
for (const f of findings.sort()) console.log(`  - ${f}`);

if (strict) {
  console.error('\nStrict mode: failing CI.');
  process.exit(1);
}

console.log('\n(Non-strict: advisory only. Use --strict to fail.)');
process.exit(0);
