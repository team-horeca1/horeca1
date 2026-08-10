/**
 * One-off: approve vendor listings that stayed `approvalStatus: pending` after
 * draft→publish despite being catalog-linked (verified brand mapping and/or an
 * approved active masterProductId).
 *
 * Root cause: draft autosave wrote pending, then publish never re-ran
 * evaluateInstantApproval. See plan fix-draft-publish-auto-approve.
 *
 * Usage (from repo root):
 *   npx tsx prisma/scripts/repair-stuck-catalog-approvals.ts            # dry-run (default)
 *   npx tsx prisma/scripts/repair-stuck-catalog-approvals.ts --dry-run   # same
 *   npx tsx prisma/scripts/repair-stuck-catalog-approvals.ts --apply     # write approvals
 *
 * Skips rows where the same vendor already has another active listing on that
 * master (mirrors evaluateInstantApproval's duplicate guard). Composes `sku`
 * via composeVendorListingSku when missing (POS lives in vendorSku on drafts).
 */
import 'dotenv/config';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { transitionProductApproval } from '../../src/modules/catalog/approval-state.service';
import {
  composeVendorListingSku,
  TOMBSTONE_PREFIX,
} from '../../src/modules/catalog/catalog.service';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

async function resolveMasterProductId(input: {
  masterProductId: string | null;
  brandMasterProductId: string | null;
}): Promise<string | null> {
  if (input.masterProductId) {
    const master = await prisma.masterProduct.findFirst({
      where: {
        id: input.masterProductId,
        approvalStatus: 'approved',
        isActive: true,
      },
      select: { id: true },
    });
    if (master) return master.id;
  }

  if (!input.brandMasterProductId) return null;

  const bmp = await prisma.brandMasterProduct.findFirst({
    where: {
      id: input.brandMasterProductId,
      isActive: true,
      brand: { isActive: true, approvalStatus: 'approved' },
    },
    select: { masterProductId: true, sku: true },
  });
  if (!bmp) return null;
  if (bmp.masterProductId) return bmp.masterProductId;
  if (!bmp.sku) return null;

  const linked = await prisma.masterProduct.findFirst({
    where: {
      sku: { equals: bmp.sku, mode: 'insensitive' },
      approvalStatus: 'approved',
      isActive: true,
    },
    select: { id: true },
  });
  return linked?.id ?? null;
}

async function vendorAlreadyListsMaster(
  vendorId: string,
  masterProductId: string,
  excludeProductId: string,
): Promise<boolean> {
  const dup = await prisma.product.findFirst({
    where: {
      vendorId,
      masterProductId,
      slug: { not: { startsWith: TOMBSTONE_PREFIX } },
      id: { not: excludeProductId },
    },
    select: { id: true, name: true },
  });
  return !!dup;
}

async function main() {
  console.log(
    `\n=== Repair stuck catalog approvals ${DRY_RUN ? '(DRY RUN)' : '(APPLY)'} ===\n`,
  );

  const candidates = await prisma.product.findMany({
    where: {
      approvalStatus: 'pending',
      listingStatus: 'submitted',
      vendorId: { not: null },
      slug: { not: { startsWith: TOMBSTONE_PREFIX } },
      OR: [
        {
          masterProduct: {
            approvalStatus: 'approved',
            isActive: true,
          },
        },
        {
          brandMappings: {
            some: {
              status: 'verified',
              matchedBy: 'manually_verified',
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      vendorId: true,
      masterProductId: true,
      sku: true,
      vendorSku: true,
      brandMappings: {
        where: { status: 'verified', matchedBy: 'manually_verified' },
        select: { brandMasterProductId: true },
        take: 1,
      },
      vendor: { select: { businessName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Candidates (pending + submitted + catalog-linked): ${candidates.length}`);

  type RepairRow = {
    id: string;
    name: string;
    vendorLabel: string;
    masterProductId: string | null;
    willComposeSku: boolean;
    posSku: string | null;
  };

  const toRepair: RepairRow[] = [];
  const skipped: Array<{ id: string; name: string; reason: string }> = [];

  for (const p of candidates) {
    if (!p.vendorId) {
      skipped.push({ id: p.id, name: p.name, reason: 'missing vendorId' });
      continue;
    }

    const brandMasterProductId = p.brandMappings[0]?.brandMasterProductId ?? null;
    const masterProductId = await resolveMasterProductId({
      masterProductId: p.masterProductId,
      brandMasterProductId,
    });

    // Brand-mapped rows qualify even without a resolved master (evaluateInstantApproval).
    // Master-only rows must resolve; otherwise they should not have matched the query.
    if (!brandMasterProductId && !masterProductId) {
      skipped.push({
        id: p.id,
        name: p.name,
        reason: 'no verified brand mapping and master not approved/active',
      });
      continue;
    }

    if (masterProductId) {
      const dup = await vendorAlreadyListsMaster(p.vendorId, masterProductId, p.id);
      if (dup) {
        skipped.push({
          id: p.id,
          name: p.name,
          reason: `vendor already lists master ${masterProductId}`,
        });
        continue;
      }
    }

    const willComposeSku = !p.sku?.trim();
    const posSku = (p.vendorSku?.trim() || p.sku?.trim() || null) as string | null;
    if (willComposeSku && !posSku) {
      skipped.push({
        id: p.id,
        name: p.name,
        reason: 'missing sku and vendorSku (cannot compose POS SKU)',
      });
      continue;
    }

    toRepair.push({
      id: p.id,
      name: p.name,
      vendorLabel: p.vendor?.businessName ?? p.vendorId,
      masterProductId,
      willComposeSku,
      posSku,
    });
  }

  console.log(`Eligible to approve: ${toRepair.length}`);
  console.log(`Skipped: ${skipped.length}`);

  for (const s of skipped) {
    console.log(`  SKIP  ${s.name} (${s.id}): ${s.reason}`);
  }

  for (const r of toRepair) {
    const skuNote = r.willComposeSku
      ? `compose sku from POS "${r.posSku}"`
      : `keep sku`;
    console.log(
      `  ${DRY_RUN ? 'WOULD' : 'WILL '} approve  ${r.name} (${r.id})  vendor=${r.vendorLabel}  master=${r.masterProductId ?? '—'}  ${skuNote}`,
    );
  }

  if (DRY_RUN) {
    console.log('\nDry run. Pass --apply to write approvals.');
    return;
  }

  let approved = 0;
  let failed = 0;

  for (const r of toRepair) {
    try {
      const product = await prisma.product.findUnique({
        where: { id: r.id },
        select: { id: true, vendorId: true, sku: true, vendorSku: true },
      });
      if (!product?.vendorId) {
        console.error(`  FAIL  ${r.name}: product missing or no vendorId`);
        failed += 1;
        continue;
      }

      const data: Prisma.ProductUncheckedUpdateInput = {
        approvedAt: new Date(),
        approvalNote: 'Repaired stuck catalog-linked draft publish (system)',
      };

      if (!product.sku?.trim()) {
        const posSku = product.vendorSku?.trim() || '';
        if (!posSku) {
          console.error(`  FAIL  ${r.name}: POS SKU required`);
          failed += 1;
          continue;
        }
        data.sku = await composeVendorListingSku(product.vendorId, posSku, product.id);
        data.vendorSku = posSku;
      }

      await transitionProductApproval(r.id, 'approved', null, {
        source: 'system',
        data,
      });
      approved += 1;
      console.log(`  OK    ${r.name} (${r.id})`);
    } catch (e) {
      failed += 1;
      console.error(`  FAIL  ${r.name} (${r.id}):`, e);
    }
  }

  console.log(`\nDone. Approved ${approved}, failed ${failed}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
