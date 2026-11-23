/**
 * Lists wallet_transactions whose referenceType is not in the known map.
 * Writes nothing. Exit 1 if an unknown type is present.
 *
 *   npx tsx scripts/ledger-backfill-dry-run.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { knownReference } from '../src/modules/ledger/rules';

async function main() {
  const rows = await prisma.walletTransaction.findMany({
    select: { id: true, referenceType: true },
  });
  const unknown = new Map<string, number>();
  for (const row of rows) {
    if (!knownReference(row.referenceType)) {
      const key = row.referenceType ?? '(null)';
      unknown.set(key, (unknown.get(key) ?? 0) + 1);
    }
  }
  if (unknown.size === 0) {
    console.log(`Dry run: ${rows.length} wallet rows, no unknown reference types. No writes.`);
    return;
  }
  console.log('Unknown wallet reference types. Backfill stopped. No writes.');
  for (const [type, count] of unknown) console.log(`${count} ${type}`);
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
