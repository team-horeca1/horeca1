/**
 * One-shot: strip legacy "{display} — Main" (and similar) from outlet names.
 * Outlets are just outlets — nothing is called Main.
 *
 *   npx tsx scripts/strip-outlet-main-suffix.ts
 *   npx tsx scripts/strip-outlet-main-suffix.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';
import { normalizeOutletName } from '../src/lib/constants/customerProfile';

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

async function main() {
  const outlets = await prisma.outlet.findMany({
    select: { id: true, name: true, businessAccountId: true },
    orderBy: { createdAt: 'asc' },
  });

  let updated = 0;
  let skipped = 0;
  for (const o of outlets) {
    const next = normalizeOutletName(o.name);
    if (!next || next === o.name.trim()) {
      skipped += 1;
      continue;
    }
    console.log(`${dryRun ? '[dry-run] ' : ''}${o.id}: "${o.name}" → "${next}"`);
    if (!dryRun) {
      await prisma.outlet.update({ where: { id: o.id }, data: { name: next } });
    }
    updated += 1;
  }

  console.log(`Done. ${updated} updated, ${skipped} unchanged${dryRun ? ' (dry-run)' : ''}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
