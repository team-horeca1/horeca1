/**
 * Merge duplicate BrandMasterProduct forks created when syncProductToBrand
 * resolved by name/slug and spawned a new row on every rename.
 *
 * Groups active rows per brand by masterProductId, then by lowercased sku.
 * Keeper = most non-rejected mappings, then oldest createdAt.
 * Re-points loser's mappings to the keeper (respecting unique constraint),
 * backfills keeper.masterProductId when null, deletes loser rows.
 *
 * Usage (from repo root):
 *   npx tsx prisma/scripts/merge-duplicate-brand-master-products.ts            # dry-run
 *   npx tsx prisma/scripts/merge-duplicate-brand-master-products.ts --dry-run   # same
 *   npx tsx prisma/scripts/merge-duplicate-brand-master-products.ts --apply     # write
 */
import 'dotenv/config';
import type { MappingStatus } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

type MappingRow = {
  id: string;
  distributorProductId: string;
  status: MappingStatus;
  confidenceScore: { toNumber?: () => number } | number;
  matchedBy: string;
  reviewedBy: string | null;
  reviewNote: string | null;
};

type BmpRow = {
  id: string;
  brandId: string;
  name: string;
  sku: string | null;
  masterProductId: string | null;
  createdAt: Date;
  mappings: MappingRow[];
};

const STATUS_RANK: Record<MappingStatus, number> = {
  verified: 4,
  auto_mapped: 3,
  pending_review: 2,
  rejected: 1,
};

function confidence(m: MappingRow): number {
  const v = m.confidenceScore;
  if (typeof v === 'number') return v;
  if (v && typeof v.toNumber === 'function') return v.toNumber();
  return Number(v) || 0;
}

function pickKeeper(rows: BmpRow[]): BmpRow {
  return [...rows].sort((a, b) => {
    const aLive = a.mappings.filter((m) => m.status !== 'rejected').length;
    const bLive = b.mappings.filter((m) => m.status !== 'rejected').length;
    if (bLive !== aLive) return bLive - aLive;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

/**
 * Union-find: rows that share masterProductId OR lowercased sku within a brand
 * belong to the same duplicate cluster (covers forks where only some rows got
 * a master link).
 */
function clusterDuplicates(rows: BmpRow[]): BmpRow[][] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let p = parent.get(id) ?? id;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(id, p);
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const r of rows) parent.set(r.id, r.id);

  const byMaster = new Map<string, string>();
  const bySku = new Map<string, string>();
  for (const r of rows) {
    if (r.masterProductId) {
      const prev = byMaster.get(r.masterProductId);
      if (prev) union(prev, r.id);
      else byMaster.set(r.masterProductId, r.id);
    }
    const skuKey = r.sku?.trim().toLowerCase();
    if (skuKey) {
      const prev = bySku.get(skuKey);
      if (prev) union(prev, r.id);
      else bySku.set(skuKey, r.id);
    }
  }

  const clusters = new Map<string, BmpRow[]>();
  for (const r of rows) {
    const root = find(r.id);
    const list = clusters.get(root) ?? [];
    list.push(r);
    clusters.set(root, list);
  }
  return [...clusters.values()].filter((c) => c.length >= 2);
}

async function mergeGroup(brandId: string, rows: BmpRow[]): Promise<{
  kept: string;
  deleted: string[];
  remapped: number;
  droppedDupMappings: number;
  masterBackfilled: string | null;
}> {
  const keeper = pickKeeper(rows);
  const losers = rows.filter((r) => r.id !== keeper.id);

  let remapped = 0;
  let droppedDupMappings = 0;
  const masterFromLoser =
    !keeper.masterProductId
      ? losers.find((l) => l.masterProductId)?.masterProductId ?? null
      : null;

  const label =
    keeper.masterProductId
      ? `master:${keeper.masterProductId}`
      : keeper.sku
        ? `sku:${keeper.sku.toLowerCase()}`
        : `ids:${rows.map((r) => r.id.slice(0, 8)).join(',')}`;

  if (!DRY_RUN) {
    await prisma.$transaction(async (tx) => {
      for (const loser of losers) {
        for (const mapping of loser.mappings) {
          const existing = await tx.brandProductMapping.findUnique({
            where: {
              brandMasterProductId_distributorProductId: {
                brandMasterProductId: keeper.id,
                distributorProductId: mapping.distributorProductId,
              },
            },
          });

          if (existing) {
            // Keep the stronger status; drop the loser's mapping.
            if (STATUS_RANK[mapping.status] > STATUS_RANK[existing.status]) {
              await tx.brandProductMapping.update({
                where: { id: existing.id },
                data: {
                  status: mapping.status,
                  matchedBy: mapping.matchedBy as 'rule_based' | 'manually_verified',
                  confidenceScore: confidence(mapping),
                  reviewedBy: mapping.reviewedBy,
                  reviewNote: mapping.reviewNote,
                },
              });
            }
            await tx.brandProductMapping.delete({ where: { id: mapping.id } });
            droppedDupMappings += 1;
          } else {
            await tx.brandProductMapping.update({
              where: { id: mapping.id },
              data: { brandMasterProductId: keeper.id },
            });
            remapped += 1;
          }
        }

        await tx.brandMasterProduct.delete({ where: { id: loser.id } });
      }

      if (masterFromLoser) {
        await tx.brandMasterProduct.update({
          where: { id: keeper.id },
          data: { masterProductId: masterFromLoser },
        });
      }
    });
  } else {
    // Dry-run accounting without writes.
    const keeperDistIds = new Set(keeper.mappings.map((m) => m.distributorProductId));
    for (const loser of losers) {
      for (const mapping of loser.mappings) {
        if (keeperDistIds.has(mapping.distributorProductId)) {
          droppedDupMappings += 1;
        } else {
          remapped += 1;
          keeperDistIds.add(mapping.distributorProductId);
        }
      }
    }
  }

  console.log(
    `  [${label}] brand=${brandId} keep=${keeper.id} (${keeper.name}) ` +
      `delete=${losers.map((l) => `${l.id}(${l.name})`).join(', ')} ` +
      `remap=${remapped} dropDup=${droppedDupMappings}` +
      (masterFromLoser ? ` backfillMaster=${masterFromLoser}` : ''),
  );

  return {
    kept: keeper.id,
    deleted: losers.map((l) => l.id),
    remapped,
    droppedDupMappings,
    masterBackfilled: masterFromLoser,
  };
}

async function main() {
  console.log(
    `\n=== Merge duplicate brand master products ${DRY_RUN ? '(DRY RUN)' : '(APPLY)'} ===\n`,
  );

  const rows = await prisma.brandMasterProduct.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      brandId: true,
      name: true,
      sku: true,
      masterProductId: true,
      createdAt: true,
      mappings: {
        select: {
          id: true,
          distributorProductId: true,
          status: true,
          confidenceScore: true,
          matchedBy: true,
          reviewedBy: true,
          reviewNote: true,
        },
      },
    },
  });

  // brandId → rows (clustered by shared masterProductId OR sku)
  const byBrand = new Map<string, BmpRow[]>();
  for (const row of rows as BmpRow[]) {
    const list = byBrand.get(row.brandId) ?? [];
    list.push(row);
    byBrand.set(row.brandId, list);
  }

  let groupCount = 0;
  let deletedTotal = 0;
  let remappedTotal = 0;
  let droppedTotal = 0;

  for (const [brandId, brandRows] of byBrand) {
    const clusters = clusterDuplicates(brandRows);
    for (const group of clusters) {
      groupCount += 1;
      const result = await mergeGroup(brandId, group);
      deletedTotal += result.deleted.length;
      remappedTotal += result.remapped;
      droppedTotal += result.droppedDupMappings;
    }
  }

  console.log(
    `\nDone. duplicateGroups=${groupCount} deleted=${deletedTotal} ` +
      `remapped=${remappedTotal} droppedDupMappings=${droppedTotal}` +
      (DRY_RUN ? '\n(DRY RUN — re-run with --apply to write)\n' : '\n'),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
