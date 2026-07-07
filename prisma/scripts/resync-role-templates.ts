/**
 * One-off: resync AccountRole template permissions to match portalFeatures scopes.
 * Run: npx tsx prisma/scripts/resync-role-templates.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { sanitizePermissionsForScope } from '../../src/lib/permissions/engine';
import { isOwnerRoleName, modulesForPortalScope, type RoleScope } from '../../src/lib/permissions/portalFeatures';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function allScopePermissions(scope: RoleScope): Record<string, Record<string, boolean>> {
  const modules = modulesForPortalScope(scope);
  const out: Record<string, Record<string, boolean>> = {};
  for (const [m, actions] of Object.entries(modules)) {
    out[m] = {};
    for (const a of actions) out[m][a] = true;
  }
  return out;
}

async function main() {
  const templates = await prisma.accountRole.findMany({
    where: { isTemplate: true, businessAccountId: null },
    select: { id: true, name: true, scope: true, permissions: true },
  });

  let updated = 0;
  for (const tpl of templates) {
    const scope = tpl.scope as RoleScope;
    const next = isOwnerRoleName(tpl.name)
      ? allScopePermissions(scope)
      : sanitizePermissionsForScope(tpl.permissions, scope);

    await prisma.accountRole.update({
      where: { id: tpl.id },
      data: { permissions: next },
    });
    updated++;
    console.log(`  ✓ ${tpl.name} (${scope})`);
  }

  // Strip out-of-scope keys from custom roles too
  const custom = await prisma.accountRole.findMany({
    where: { isTemplate: false },
    select: { id: true, name: true, scope: true, permissions: true },
  });
  for (const role of custom) {
    const scope = role.scope as RoleScope;
    const next = sanitizePermissionsForScope(role.permissions, scope);
    await prisma.accountRole.update({ where: { id: role.id }, data: { permissions: next } });
    updated++;
  }

  console.log(`Resynced ${updated} role(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
