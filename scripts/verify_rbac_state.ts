/**
 * Verify post-migration RBAC state:
 *   - All seeded role templates exist with the expected scope
 *   - Every AdminTeamMember/VendorTeamMember/BrandTeamMember has role_id set
 *   - For vendor/brand: every team member also has a UserRole on the right account
 *
 * Read-only. Run: npx tsx scripts/verify_rbac_state.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { sanitizePermissionsForScope } from '../src/lib/permissions/engine';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Canonical role templates — must match SEED_TEMPLATES in prisma/seed.ts and
// prisma/migrations/20260520_hcid_architecture_step_a/data_migrate.ts (the
// scripts that actually create these rows). Previously this list asserted names
// (Editor / Vendor Manager / Brand Editor …) that no seeder ever created.
const EXPECTED_BY_SCOPE = {
  admin:  ['Super Admin', 'Ops Admin', 'Finance Admin', 'Support Agent'],
  vendor: ['Vendor Admin', 'Sales Rep', 'Order Manager', 'Warehouse Manager', 'Finance Executive'],
  brand:  ['Brand Admin', 'Brand Manager', 'Marketing Executive'],
};

async function main() {
  let failures = 0;
  const note = (s: string) => console.log(`  ${s}`);

  console.log('═══ RBAC verification ═══\n');

  console.log('1. Role templates by scope');
  for (const [scope, expected] of Object.entries(EXPECTED_BY_SCOPE)) {
    const found = await prisma.accountRole.findMany({
      where: { scope: scope as 'admin' | 'vendor' | 'brand', isTemplate: true, businessAccountId: null },
      select: { name: true },
    });
    const foundNames = new Set(found.map(r => r.name));
    const missing = expected.filter(n => !foundNames.has(n));
    if (missing.length) {
      console.log(`  ✗ ${scope}: missing templates → ${missing.join(', ')}`);
      failures++;
    } else {
      note(`✓ ${scope}: ${found.length} templates (${found.map(r => r.name).join(', ')})`);
    }
  }

  console.log('\n2. AdminTeamMember.role_id backfill');
  const adminMissing = await prisma.adminTeamMember.count({ where: { roleId: null } });
  const adminTotal = await prisma.adminTeamMember.count();
  if (adminMissing > 0) {
    console.log(`  ✗ ${adminMissing}/${adminTotal} AdminTeamMember rows still have roleId = null`);
    failures++;
  } else note(`✓ ${adminTotal}/${adminTotal} rows have roleId`);

  console.log('\n3. VendorTeamMember.role_id backfill');
  const vMissing = await prisma.vendorTeamMember.count({ where: { roleId: null } });
  const vTotal = await prisma.vendorTeamMember.count();
  if (vMissing > 0) {
    console.log(`  ✗ ${vMissing}/${vTotal} VendorTeamMember rows still have roleId = null`);
    failures++;
  } else note(`✓ ${vTotal}/${vTotal} rows have roleId`);

  console.log('\n4. BrandTeamMember.role_id backfill');
  const bMissing = await prisma.brandTeamMember.count({ where: { roleId: null } });
  const bTotal = await prisma.brandTeamMember.count();
  if (bMissing > 0) {
    console.log(`  ✗ ${bMissing}/${bTotal} BrandTeamMember rows still have roleId = null`);
    failures++;
  } else note(`✓ ${bTotal}/${bTotal} rows have roleId`);

  console.log('\n5. UserRole coverage for vendor team members');
  const vendorTeamRows = await prisma.vendorTeamMember.findMany({
    select: { userId: true, vendor: { select: { businessAccountId: true } } },
  });
  let vendorGap = 0;
  for (const r of vendorTeamRows) {
    const has = await prisma.userRole.findFirst({
      where: { userId: r.userId, businessAccountId: r.vendor.businessAccountId, role: { scope: 'vendor' } },
      select: { id: true },
    });
    if (!has) {
      console.log(`  ⚠ vendor user ${r.userId} on account ${r.vendor.businessAccountId} has no UserRole — JWT will lack permissions`);
      vendorGap++;
    }
  }
  if (vendorGap === 0) note(`✓ all ${vendorTeamRows.length} vendor team members have a UserRole`);

  console.log('\n6. UserRole coverage for brand team members');
  const brandTeamRows = await prisma.brandTeamMember.findMany({
    select: { userId: true, brand: { select: { businessAccountId: true } } },
  });
  let brandGap = 0;
  for (const r of brandTeamRows) {
    const has = await prisma.userRole.findFirst({
      where: { userId: r.userId, businessAccountId: r.brand.businessAccountId, role: { scope: 'brand' } },
      select: { id: true },
    });
    if (!has) {
      console.log(`  ⚠ brand user ${r.userId} on account ${r.brand.businessAccountId} has no UserRole — JWT will lack permissions`);
      brandGap++;
    }
  }
  if (brandGap === 0) note(`✓ all ${brandTeamRows.length} brand team members have a UserRole`);

  console.log('\n7. Template permissions stay within portal scope');
  const templates = await prisma.accountRole.findMany({
    where: { isTemplate: true, businessAccountId: null },
    select: { name: true, scope: true, permissions: true },
  });
  let scopeMismatch = 0;
  for (const tpl of templates) {
    const scope = tpl.scope as 'account' | 'vendor' | 'brand' | 'admin' | 'delivery';
    const cleaned = sanitizePermissionsForScope(tpl.permissions, scope);
    const before = JSON.stringify(tpl.permissions);
    const after = JSON.stringify(cleaned);
    if (before !== after) {
      console.log(`  ✗ ${tpl.name} (${scope}): permissions include out-of-scope modules`);
      scopeMismatch++;
      failures++;
    }
  }
  if (scopeMismatch === 0) note(`✓ ${templates.length} templates are scope-clean (run resync-role-templates.ts if stale)`);

  console.log('\n8. Super Admin permission set sanity check');
  const superAdmin = await prisma.accountRole.findFirst({
    where: { name: 'Super Admin', scope: 'admin', isTemplate: true, businessAccountId: null },
    select: { permissions: true },
  });
  if (superAdmin) {
    const perms = superAdmin.permissions as Record<string, Record<string, boolean>>;
    const userKeys = ['create', 'edit', 'delete'].every(a => perms?.users?.[a] === true);
    if (userKeys) note('✓ Super Admin has users.create + users.edit + users.delete');
    else { console.log('  ✗ Super Admin missing one of users.{create,edit,delete}'); failures++; }
  } else { console.log('  ✗ Super Admin template not found'); failures++; }

  console.log('\n═══ Result ═══');
  if (failures > 0) {
    console.log(`✗ ${failures} failure(s)`);
    process.exit(1);
  } else {
    console.log('✓ all checks passed');
  }
}

main()
  .catch((err) => { console.error('verify failed:', err); process.exit(2); })
  .finally(() => prisma.$disconnect());
