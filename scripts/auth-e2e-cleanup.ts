/**
 * Delete ONLY auth E2E tagged rows (@horeca.test users + E2E-AUTH BAs/vendors/brands).
 * Run: npx tsx scripts/auth-e2e-cleanup.ts
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const EMAIL_SUFFIX = '@horeca.test';
const TAG = 'E2E-AUTH';

function redactDatabaseUrl(url: string | undefined): { host: string; database: string; user: string } {
  if (!url) return { host: '(unset)', database: '(unset)', user: '(unset)' };
  try {
    const u = new URL(url);
    return {
      host: u.host,
      database: u.pathname.replace(/^\//, '').split('?')[0] || '(none)',
      user: u.username || '(none)',
    };
  } catch {
    return { host: '(parse-error)', database: '(parse-error)', user: '(parse-error)' };
  }
}

async function main() {
  const db = redactDatabaseUrl(process.env.DATABASE_URL);
  console.log('\n=== Auth E2E Cleanup — Preflight ===');
  console.log(`DATABASE_URL host: ${db.host}`);
  console.log(`database: ${db.database}`);
  console.log(`user: ${db.user}`);
  console.log('Deleting ONLY tagged @horeca.test / E2E-AUTH rows.\n');

  const taggedUsers = await prisma.user.findMany({
    where: { email: { endsWith: EMAIL_SUFFIX } },
    select: { id: true, email: true },
  });
  const userIds = taggedUsers.map((u) => u.id);
  console.log(`Tagged users: ${taggedUsers.length}`, taggedUsers.map((u) => u.email));

  // Also catch invite agents created during extended tests (example.com with e2e pattern)
  // Plan says only @horeca.test — leave example.com agents; extended suite deletes them.
  // Clean any leftover e2e-auth-*@example.com from failed runs:
  const leftoverAgents = await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: 'vendor-agent-', endsWith: '@example.com' } },
        { email: { startsWith: 'brand-agent-', endsWith: '@example.com' } },
        { email: { startsWith: 'admin-agent-', endsWith: '@example.com' } },
      ],
    },
    select: { id: true, email: true },
  });
  for (const a of leftoverAgents) {
    if (!userIds.includes(a.id)) {
      userIds.push(a.id);
      taggedUsers.push(a);
    }
  }
  if (leftoverAgents.length) {
    console.log(`Also cleaning leftover team-agent users: ${leftoverAgents.length}`);
  }

  const taggedBas = await prisma.businessAccount.findMany({
    where: { legalName: { startsWith: TAG } },
    select: { id: true, legalName: true },
  });
  const baIds = taggedBas.map((b) => b.id);
  console.log(`Tagged BAs: ${taggedBas.length}`, taggedBas.map((b) => b.legalName));

  const taggedVendors = await prisma.vendor.findMany({
    where: {
      OR: [
        { slug: { startsWith: 'e2e-auth-' } },
        { businessName: { startsWith: TAG } },
        { businessAccountId: { in: baIds.length ? baIds : ['00000000-0000-0000-0000-000000000000'] } },
      ],
    },
    select: { id: true, slug: true },
  });
  const vendorIds = taggedVendors.map((v) => v.id);

  const taggedBrands = await prisma.brand.findMany({
    where: {
      OR: [
        { slug: { startsWith: 'e2e-auth-' } },
        { name: { startsWith: TAG } },
        { businessAccountId: { in: baIds.length ? baIds : ['00000000-0000-0000-0000-000000000000'] } },
      ],
    },
    select: { id: true, slug: true },
  });
  const brandIds = taggedBrands.map((b) => b.id);

  // Team memberships for tagged vendors/brands/users
  if (vendorIds.length) {
    const n = await prisma.vendorTeamMember.deleteMany({ where: { vendorId: { in: vendorIds } } });
    console.log(`Deleted vendor team members: ${n.count}`);
  }
  if (brandIds.length) {
    const n = await prisma.brandTeamMember.deleteMany({ where: { brandId: { in: brandIds } } });
    console.log(`Deleted brand team members: ${n.count}`);
  }
  if (userIds.length) {
    const n = await prisma.adminTeamMember.deleteMany({ where: { userId: { in: userIds } } });
    console.log(`Deleted admin team members: ${n.count}`);
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.businessAccountMember.deleteMany({ where: { userId: { in: userIds } } });
  }

  // UserRoles / members on tagged BAs (may include non-tagged users who were attached)
  if (baIds.length) {
    await prisma.userRole.deleteMany({ where: { businessAccountId: { in: baIds } } });
    await prisma.businessAccountMember.deleteMany({ where: { businessAccountId: { in: baIds } } });
  }

  // Clear primaryOutletId before deleting outlets/BAs
  if (baIds.length) {
    await prisma.businessAccount.updateMany({
      where: { id: { in: baIds } },
      data: { primaryOutletId: null },
    });
  }

  if (vendorIds.length) {
    // Soft-dependent rows that may block vendor delete
    await prisma.vendorWallet.deleteMany({ where: { vendorId: { in: vendorIds } } }).catch(() => undefined);
    const n = await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    console.log(`Deleted vendors: ${n.count}`);
  }
  if (brandIds.length) {
    const n = await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    console.log(`Deleted brands: ${n.count}`);
  }

  if (baIds.length) {
    await prisma.outlet.deleteMany({ where: { businessAccountId: { in: baIds } } });
    const n = await prisma.businessAccount.deleteMany({ where: { id: { in: baIds } } });
    console.log(`Deleted business accounts: ${n.count}`);
  }

  if (userIds.length) {
    // Clear invite FK references pointing at tagged users
    await prisma.vendorTeamMember.updateMany({
      where: { invitedBy: { in: userIds } },
      data: { invitedBy: null },
    });
    await prisma.brandTeamMember.updateMany({
      where: { invitedBy: { in: userIds } },
      data: { invitedBy: null },
    });
    await prisma.adminTeamMember.updateMany({
      where: { invitedBy: { in: userIds } },
      data: { invitedBy: null },
    });
    await prisma.businessAccountMember.updateMany({
      where: { invitedBy: { in: userIds } },
      data: { invitedBy: null },
    });

    const n = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    console.log(`Deleted users: ${n.count}`);
  }

  const remaining = await prisma.user.count({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const remainingBas = await prisma.businessAccount.count({ where: { legalName: { startsWith: TAG } } });
  console.log(`\nVerify: @horeca.test users remaining = ${remaining}`);
  console.log(`Verify: E2E-AUTH BAs remaining = ${remainingBas}`);
  if (remaining > 0 || remainingBas > 0) {
    console.error('Cleanup incomplete.');
    process.exit(1);
  }
  console.log('Cleanup complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
