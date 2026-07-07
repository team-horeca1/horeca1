/**
 * Static RBAC consistency checks (no DB). Run: node scripts/verify-rbac-matrix.mjs
 * - Every portal nav link with href has a route permission mapping
 * - apiPermissions rules reference valid permission key patterns
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const routeSrc = readFileSync(join(root, 'src/lib/permissions/routePermissions.ts'), 'utf8');
const navSrc = readFileSync(join(root, 'src/lib/permissions/portalNav.ts'), 'utf8');
const apiSrc = readFileSync(join(root, 'src/lib/permissions/apiPermissions.ts'), 'utf8');

const hrefRe = /href:\s*'([^']+)'/g;
const navHrefs = [...navSrc.matchAll(hrefRe)].map((m) => m[1]);

let failures = 0;

for (const href of navHrefs) {
  if (!routeSrc.includes(`prefix: '${href}'`) && !routeSrc.includes(`prefix: "${href}"`)) {
    // Nav href may be covered via permFromLinks — check href appears in portalNav permFromLinks path
    if (!navSrc.includes(`href: '${href}'`)) continue;
    const slice = navSrc.slice(navSrc.indexOf(`href: '${href}'`), navSrc.indexOf(`href: '${href}'`) + 200);
    if (slice.includes('requiredPerm')) continue;
    console.warn(`WARN: nav href ${href} has no obvious routePermissions prefix`);
    failures++;
  }
}

const permKeys = new Set(
  [...apiSrc.matchAll(/permission:\s*(?:'([^']+)'|\[([^\]]+)\])/g)].flatMap((m) => {
    if (m[1]) return [m[1]];
    return m[2].split(',').map((s) => s.trim().replace(/['"]/g, ''));
  }),
);

for (const key of permKeys) {
  if (!/^[a-zA-Z]+\.(view|create|edit|delete|approve)$/.test(key)) {
    console.warn(`WARN: unusual API permission key: ${key}`);
    failures++;
  }
}

const layoutGuards = [
  'src/app/admin/layout.tsx',
  'src/app/vendor/(dashboard)/layout.tsx',
  'src/app/brand/portal/layout.tsx',
].map((p) => readFileSync(join(root, p), 'utf8'));

for (const [i, src] of layoutGuards.entries()) {
  if (!src.includes('PortalPageGuard')) {
    console.error(`FAIL: layout ${i} missing PortalPageGuard`);
    failures++;
  }
  if (!src.includes('getFirstAllowedRoute')) {
    console.warn(`WARN: layout ${i} missing getFirstAllowedRoute`);
  }
}

if (failures > 0) {
  console.error(`\nverify-rbac-matrix: ${failures} issue(s)`);
  process.exit(1);
}

console.log('verify-rbac-matrix: OK');
console.log(`  nav hrefs scanned: ${navHrefs.length}`);
console.log(`  API permission rules: ${permKeys.size} keys`);
