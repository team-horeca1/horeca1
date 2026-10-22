/**
 * Pricing workspace — review, publish (with version check + server guardrails),
 * rollback, clone, export. Drafts stay client-side until publish.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, Errors } from '@/middleware/errorHandler';
import { logPriceHistory, type PriceHistoryEntry } from '@/lib/priceHistory';
import { evaluateCellGuardrails, type GuardrailFlag } from '@/modules/pricing/guardrails';

export type CellState = {
  customPrice: number | null;
  isExcluded: boolean;
  isLocked: boolean;
  validFrom: string | null;
  validTo: string | null;
  note: string | null;
  scheduledPrice: number | null;
  scheduledFrom: string | null;
  scheduledTo: string | null;
};

export type DraftCell = {
  priceListId: string;
  productId: string;
  /** True when the row was explicitly added to the list in this draft (membership intent). */
  added?: boolean;
  customPrice?: number | null;
  isExcluded?: boolean;
  isLocked?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  note?: string | null;
  scheduledPrice?: number | null;
  scheduledFrom?: string | null;
  scheduledTo?: string | null;
};

export type DiffRow = {
  priceListId: string;
  productId: string;
  productName: string;
  sku: string | null;
  listName: string;
  before: CellState | null;
  after: CellState | null;
  kind: 'priced' | 'base' | 'removed' | 'restored' | 'locked' | 'meta';
  guardrails: GuardrailFlag[];
  previousEffective: number;
  newEffective: number | null;
};

function toCellState(row: {
  customPrice: Prisma.Decimal | number | null;
  isExcluded: boolean;
  isLocked: boolean;
  validFrom: Date | null;
  validTo: Date | null;
  note: string | null;
  scheduledPrice: Prisma.Decimal | number | null;
  scheduledFrom: Date | null;
  scheduledTo: Date | null;
} | null): CellState | null {
  if (!row) return null;
  return {
    customPrice: row.customPrice != null ? Number(row.customPrice) : null,
    isExcluded: row.isExcluded,
    isLocked: row.isLocked,
    validFrom: row.validFrom?.toISOString() ?? null,
    validTo: row.validTo?.toISOString() ?? null,
    note: row.note,
    scheduledPrice: row.scheduledPrice != null ? Number(row.scheduledPrice) : null,
    scheduledFrom: row.scheduledFrom?.toISOString() ?? null,
    scheduledTo: row.scheduledTo?.toISOString() ?? null,
  };
}

function effectivePrice(
  cell: CellState | null,
  basePrice: number,
  listDiscountPercent: number,
): number {
  if (cell?.isExcluded) return basePrice;
  if (cell?.customPrice != null) return cell.customPrice;
  if (listDiscountPercent > 0) {
    return Math.round(basePrice * (1 - listDiscountPercent / 100) * 100) / 100;
  }
  return basePrice;
}

function classifyKind(before: CellState | null, after: CellState | null): DiffRow['kind'] {
  if (after?.isExcluded && !before?.isExcluded) return 'removed';
  if (before?.isExcluded && after && !after.isExcluded) return 'restored';
  if (after === null && before !== null) return 'base';
  if (after?.customPrice != null) return 'priced';
  if (after?.isLocked !== before?.isLocked || after?.note !== before?.note) return 'meta';
  return 'priced';
}

export async function getLatestPublishId(vendorId: string): Promise<string | null> {
  const latest = await prisma.priceListPublish.findFirst({
    where: { vendorId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return latest?.id ?? null;
}

async function countAffectedCustomers(priceListId: string): Promise<number> {
  const assignments = await prisma.priceListAssignment.findMany({
    where: { priceListId },
    select: {
      type: true, userId: true, groupId: true, pincode: true, area: true,
      segment: true, creditStatus: true, outletId: true,
    },
  });
  const userIds = new Set<string>();
  for (const a of assignments) {
    if (a.type === 'customer' && a.userId) userIds.add(a.userId);
  }
  // Approximate: direct customers + count of CRM customers matching geo/segment
  // Full expansion for pincode/group is expensive; use assignment row count as floor
  // and direct unique users as a better signal for the review drawer.
  return Math.max(userIds.size, assignments.length);
}

export async function reviewWorkspacePublish(args: {
  vendorId: string;
  baseVersion: string | null;
  cells: DraftCell[];
}): Promise<{
  stale: boolean;
  latestVersion: string | null;
  diffs: DiffRow[];
  summary: {
    priced: number;
    base: number;
    removed: number;
    restored: number;
    blocks: number;
    warns: number;
    unpriced: number;
    customersAffected: number;
  };
  unpriced: Array<{ priceListId: string; productId: string; productName: string; listName: string }>;
}> {
  const latestVersion = await getLatestPublishId(args.vendorId);
  const stale = (args.baseVersion ?? null) !== latestVersion;

  const listIds = [...new Set(args.cells.map((c) => c.priceListId))];
  const productIds = [...new Set(args.cells.map((c) => c.productId))];

  const [lists, products, existing] = await Promise.all([
    prisma.priceList.findMany({
      where: { id: { in: listIds }, vendorId: args.vendorId },
      select: { id: true, name: true, discountPercent: true, floorPercentOfBase: true },
    }),
    prisma.product.findMany({
      where: { id: { in: productIds }, vendorId: args.vendorId },
      select: { id: true, name: true, sku: true, basePrice: true, originalPrice: true },
    }),
    prisma.priceListItem.findMany({
      where: { priceListId: { in: listIds }, productId: { in: productIds } },
    }),
  ]);

  const listById = new Map(lists.map((l) => [l.id, l]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const existingKey = new Map(existing.map((e) => [`${e.priceListId}:${e.productId}`, e]));

  const customersByList = new Map<string, number>();
  await Promise.all(listIds.map(async (id) => {
    customersByList.set(id, await countAffectedCustomers(id));
  }));

  const diffs: DiffRow[] = [];
  const unpriced: Array<{ priceListId: string; productId: string; productName: string; listName: string }> = [];
  let priced = 0, base = 0, removed = 0, restored = 0, blocks = 0, warns = 0;
  let maxCustomers = 0;

  for (const c of args.cells) {
    const list = listById.get(c.priceListId);
    const product = productById.get(c.productId);
    if (!list || !product) continue;

    const beforeRow = existingKey.get(`${c.priceListId}:${c.productId}`) ?? null;
    const before = toCellState(beforeRow);

    const shouldDelete =
      c.customPrice === null &&
      !c.isExcluded &&
      !c.isLocked &&
      !c.validFrom && !c.validTo &&
      !c.note &&
      c.scheduledPrice == null;

    const after: CellState | null = shouldDelete
      ? null
      : {
          customPrice: c.customPrice !== undefined ? c.customPrice ?? null : before?.customPrice ?? null,
          isExcluded: c.isExcluded ?? before?.isExcluded ?? false,
          isLocked: c.isLocked ?? before?.isLocked ?? false,
          validFrom: c.validFrom !== undefined ? c.validFrom : before?.validFrom ?? null,
          validTo: c.validTo !== undefined ? c.validTo : before?.validTo ?? null,
          note: c.note !== undefined ? c.note : before?.note ?? null,
          scheduledPrice: c.scheduledPrice !== undefined ? c.scheduledPrice : before?.scheduledPrice ?? null,
          scheduledFrom: c.scheduledFrom !== undefined ? c.scheduledFrom : before?.scheduledFrom ?? null,
          scheduledTo: c.scheduledTo !== undefined ? c.scheduledTo : before?.scheduledTo ?? null,
        };

    // Added to the list in this draft but left without a price: it will not
    // be saved on publish (membership = a priced row). Warn, don't block.
    if (c.added && !before && (c.customPrice == null) && !c.isExcluded) {
      unpriced.push({ priceListId: c.priceListId, productId: c.productId, productName: product.name, listName: list.name });
      warns++;
    }

    if (JSON.stringify(before) === JSON.stringify(after)) continue;

    if (before?.isLocked && c.customPrice !== undefined && c.customPrice !== before.customPrice) {
      diffs.push({
        priceListId: c.priceListId,
        productId: c.productId,
        productName: product.name,
        sku: product.sku,
        listName: list.name,
        before,
        after: before,
        kind: 'locked',
        guardrails: [],
        previousEffective: effectivePrice(before, Number(product.basePrice), Number(list.discountPercent)),
        newEffective: null,
      });
      continue;
    }

    const kind = classifyKind(before, after);
    if (kind === 'priced') priced++;
    if (kind === 'base') base++;
    if (kind === 'removed') removed++;
    if (kind === 'restored') restored++;

    const prevEff = effectivePrice(before, Number(product.basePrice), Number(list.discountPercent));
    const newEff = after?.isExcluded
      ? null
      : after === null
        ? Number(product.basePrice)
        : effectivePrice(after, Number(product.basePrice), Number(list.discountPercent));

    const customersAffected = customersByList.get(c.priceListId) ?? 0;
    maxCustomers = Math.max(maxCustomers, customersAffected);

    const guardrails = evaluateCellGuardrails(
      {
        newPrice: after?.isExcluded ? null : (after?.customPrice ?? (after === null ? null : newEff)),
        previousEffective: prevEff,
        basePrice: Number(product.basePrice),
        mrp: product.originalPrice != null ? Number(product.originalPrice) : null,
        floorPercentOfBase: list.floorPercentOfBase != null ? Number(list.floorPercentOfBase) : null,
        isExcluded: after?.isExcluded,
      },
      { customersAffected },
    );
    blocks += guardrails.filter((g) => g.severity === 'block').length;
    warns += guardrails.filter((g) => g.severity === 'warn').length;

    diffs.push({
      priceListId: c.priceListId,
      productId: c.productId,
      productName: product.name,
      sku: product.sku,
      listName: list.name,
      before,
      after,
      kind,
      guardrails,
      previousEffective: prevEff,
      newEffective: newEff,
    });
  }

  return {
    stale,
    latestVersion,
    diffs,
    unpriced,
    summary: {
      priced, base, removed, restored, blocks, warns,
      unpriced: unpriced.length,
      customersAffected: maxCustomers,
    },
  };
}

export async function publishWorkspace(args: {
  vendorId: string;
  actorId: string;
  baseVersion: string | null;
  cells: DraftCell[];
  acknowledgeWarnings?: boolean;
}): Promise<{ publishId: string; upserted: number; cleared: number; skipped: number; summary: Record<string, unknown> }> {
  const review = await reviewWorkspacePublish({
    vendorId: args.vendorId,
    baseVersion: args.baseVersion,
    cells: args.cells,
  });

  if (review.stale) {
    throw new ApiError('STALE_DRAFT', 'Someone published prices since you started editing. Reload and re-apply your changes.', 409, {
      latestVersion: review.latestVersion,
      overlapping: review.diffs.slice(0, 50).map((d) => ({
        priceListId: d.priceListId,
        productId: d.productId,
        productName: d.productName,
      })),
    });
  }

  if (review.summary.blocks > 0) {
    throw Errors.badRequest('Publish blocked: fix invalid prices first', {
      blocks: review.diffs.filter((d) => d.guardrails.some((g) => g.severity === 'block')).slice(0, 20),
    });
  }

  if (review.summary.warns > 0 && !args.acknowledgeWarnings) {
    throw new ApiError('NEEDS_ACK', 'Acknowledge warnings before publishing', 409, {
      warns: review.diffs.filter((d) => d.guardrails.some((g) => g.severity === 'warn')).slice(0, 20),
    });
  }

  const listIds = [...new Set(args.cells.map((c) => c.priceListId))];
  const productIds = [...new Set(args.cells.map((c) => c.productId))];

  let upserted = 0, cleared = 0, skipped = 0;
  const changes: Array<{ priceListId: string; productId: string; before: CellState | null; after: CellState | null }> = [];
  const historyEntries: PriceHistoryEntry[] = [];

  const publishId = await prisma.$transaction(async (tx) => {
    // Re-check version inside the transaction
    const latest = await tx.priceListPublish.findFirst({
      where: { vendorId: args.vendorId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if ((latest?.id ?? null) !== (args.baseVersion ?? null)) {
      throw new ApiError('STALE_DRAFT', 'Someone published prices since you started editing.', 409, {
        latestVersion: latest?.id ?? null,
      });
    }

    const [validLists, validProducts, existingItems] = await Promise.all([
      tx.priceList.findMany({ where: { id: { in: listIds }, vendorId: args.vendorId }, select: { id: true } }),
      tx.product.findMany({
        where: { id: { in: productIds }, vendorId: args.vendorId, isActive: true, approvalStatus: 'approved' },
        select: { id: true },
      }),
      tx.priceListItem.findMany({
        where: { priceListId: { in: listIds }, productId: { in: productIds } },
      }),
    ]);
    const okList = new Set(validLists.map((l) => l.id));
    const okProduct = new Set(validProducts.map((p) => p.id));
    const existingKey = new Map(existingItems.map((e) => [`${e.priceListId}:${e.productId}`, e]));

    for (const c of args.cells) {
      if (!okList.has(c.priceListId) || !okProduct.has(c.productId)) { skipped++; continue; }
      const existing = existingKey.get(`${c.priceListId}:${c.productId}`) ?? null;
      const before = toCellState(existing);

      if (existing?.isLocked && c.customPrice !== undefined && c.customPrice !== (existing.customPrice != null ? Number(existing.customPrice) : null)) {
        skipped++;
        continue;
      }

      const shouldDelete =
        c.customPrice === null &&
        !c.isExcluded &&
        !c.isLocked &&
        !c.validFrom && !c.validTo &&
        !c.note &&
        c.scheduledPrice == null;

      if (shouldDelete) {
        if (existing) {
          await tx.priceListItem.delete({ where: { id: existing.id } });
          cleared++;
          changes.push({ priceListId: c.priceListId, productId: c.productId, before, after: null });
          if (before?.customPrice != null) {
            historyEntries.push({
              vendorId: args.vendorId,
              productId: c.productId,
              priceListId: c.priceListId,
              field: 'customPrice',
              oldValue: before.customPrice,
              newValue: null,
              source: 'pricelist',
              changedBy: args.actorId,
            });
          }
        }
        continue;
      }

      const after: CellState = {
        customPrice: c.customPrice !== undefined ? c.customPrice ?? null : before?.customPrice ?? null,
        isExcluded: c.isExcluded ?? before?.isExcluded ?? false,
        isLocked: c.isLocked ?? before?.isLocked ?? false,
        validFrom: c.validFrom !== undefined ? c.validFrom : before?.validFrom ?? null,
        validTo: c.validTo !== undefined ? c.validTo : before?.validTo ?? null,
        note: c.note !== undefined ? c.note : before?.note ?? null,
        scheduledPrice: c.scheduledPrice !== undefined ? c.scheduledPrice : before?.scheduledPrice ?? null,
        scheduledFrom: c.scheduledFrom !== undefined ? c.scheduledFrom : before?.scheduledFrom ?? null,
        scheduledTo: c.scheduledTo !== undefined ? c.scheduledTo : before?.scheduledTo ?? null,
      };

      let history = existing?.history && Array.isArray(existing.history) ? [...(existing.history as unknown[])] : [];
      if (before?.customPrice !== after.customPrice || before?.isExcluded !== after.isExcluded) {
        history.unshift({
          date: new Date().toISOString(),
          action: after.isExcluded ? 'Removed from list' : before?.customPrice == null ? 'Price created' : 'Price updated',
          oldPrice: before?.customPrice ?? null,
          newPrice: after.customPrice,
          user: 'Vendor (Self)',
        });
        if (history.length > 50) history = history.slice(0, 50);
      }

      await tx.priceListItem.upsert({
        where: { priceListId_productId: { priceListId: c.priceListId, productId: c.productId } },
        create: {
          priceListId: c.priceListId,
          productId: c.productId,
          customPrice: after.customPrice,
          pricingType: 'fixed',
          isLocked: after.isLocked,
          isExcluded: after.isExcluded,
          validFrom: after.validFrom ? new Date(after.validFrom) : null,
          validTo: after.validTo ? new Date(after.validTo) : null,
          note: after.note,
          scheduledPrice: after.scheduledPrice,
          scheduledFrom: after.scheduledFrom ? new Date(after.scheduledFrom) : null,
          scheduledTo: after.scheduledTo ? new Date(after.scheduledTo) : null,
          history: history as Prisma.InputJsonValue,
        },
        update: {
          customPrice: after.customPrice,
          pricingType: 'fixed',
          isLocked: after.isLocked,
          isExcluded: after.isExcluded,
          validFrom: after.validFrom ? new Date(after.validFrom) : null,
          validTo: after.validTo ? new Date(after.validTo) : null,
          note: after.note,
          scheduledPrice: after.scheduledPrice,
          scheduledFrom: after.scheduledFrom ? new Date(after.scheduledFrom) : null,
          scheduledTo: after.scheduledTo ? new Date(after.scheduledTo) : null,
          history: history as Prisma.InputJsonValue,
        },
      });
      upserted++;
      changes.push({ priceListId: c.priceListId, productId: c.productId, before, after });
      if (before?.customPrice !== after.customPrice) {
        historyEntries.push({
          vendorId: args.vendorId,
          productId: c.productId,
          priceListId: c.priceListId,
          field: 'customPrice',
          oldValue: before?.customPrice ?? null,
          newValue: after.customPrice,
          source: 'pricelist',
          changedBy: args.actorId,
        });
      }
    }

    if (historyEntries.length > 0) {
      await logPriceHistory(historyEntries, tx);
    }

    const pub = await tx.priceListPublish.create({
      data: {
        vendorId: args.vendorId,
        actorId: args.actorId,
        kind: 'publish',
        baseVersionId: args.baseVersion,
        summary: review.summary as unknown as Prisma.InputJsonValue,
        changes: changes as unknown as Prisma.InputJsonValue,
        cellCount: changes.length,
      },
      select: { id: true },
    });
    return pub.id;
  });

  return {
    publishId,
    upserted,
    cleared,
    skipped,
    summary: review.summary,
  };
}

export async function listPublishes(vendorId: string, cursor?: string, limit = 30) {
  const rows = await prisma.priceListPublish.findMany({
    where: { vendorId },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      actor: { select: { id: true, fullName: true, email: true } },
    },
  });
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  // Enrich stored cell changes with human-readable product / list names for the History UI
  type RawChange = { priceListId: string; productId: string; before: CellState | null; after: CellState | null };
  const rawById = new Map<string, RawChange[]>();
  const productIds = new Set<string>();
  const listIds = new Set<string>();
  for (const r of rows) {
    const changes = (Array.isArray(r.changes) ? r.changes : []) as RawChange[];
    rawById.set(r.id, changes);
    for (const ch of changes) { productIds.add(ch.productId); listIds.add(ch.priceListId); }
  }
  const [products, lists] = await Promise.all([
    productIds.size ? prisma.product.findMany({ where: { id: { in: [...productIds] } }, select: { id: true, name: true, sku: true } }) : Promise.resolve([]),
    listIds.size ? prisma.priceList.findMany({ where: { id: { in: [...listIds] } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const listById = new Map(lists.map((l) => [l.id, l]));

  return {
    publishes: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      summary: r.summary,
      cellCount: r.cellCount,
      baseVersionId: r.baseVersionId,
      rollbackOfId: r.rollbackOfId,
      createdAt: r.createdAt.toISOString(),
      actor: r.actor
        ? { id: r.actor.id, name: r.actor.fullName || r.actor.email || 'Vendor' }
        : null,
      changes: (rawById.get(r.id) ?? []).slice(0, 200).map((ch) => ({
        productId: ch.productId,
        priceListId: ch.priceListId,
        productName: productById.get(ch.productId)?.name ?? 'Product',
        sku: productById.get(ch.productId)?.sku ?? null,
        listName: listById.get(ch.priceListId)?.name ?? 'Price list',
        beforePrice: ch.before?.customPrice ?? null,
        afterPrice: ch.after?.customPrice ?? null,
        beforeExcluded: !!ch.before?.isExcluded,
        afterExcluded: !!ch.after?.isExcluded,
      })),
    })),
    nextCursor: hasMore ? rows[rows.length - 1]?.id : null,
  };
}

export async function rollbackPublish(args: {
  vendorId: string;
  actorId: string;
  publishId: string;
}): Promise<{ publishId: string; restored: number }> {
  const source = await prisma.priceListPublish.findFirst({
    where: { id: args.publishId, vendorId: args.vendorId },
  });
  if (!source) throw Errors.notFound('Publish');

  const changes = (Array.isArray(source.changes) ? source.changes : []) as Array<{
    priceListId: string;
    productId: string;
    before: CellState | null;
    after: CellState | null;
  }>;

  const historyEntries: PriceHistoryEntry[] = [];
  let restored = 0;

  const newId = await prisma.$transaction(async (tx) => {
    const rollbackChanges: typeof changes = [];

    for (const ch of changes) {
      const current = await tx.priceListItem.findUnique({
        where: { priceListId_productId: { priceListId: ch.priceListId, productId: ch.productId } },
      });
      const currentState = toCellState(current);
      const target = ch.before;

      if (target === null) {
        if (current) {
          await tx.priceListItem.delete({ where: { id: current.id } });
          restored++;
          rollbackChanges.push({
            priceListId: ch.priceListId,
            productId: ch.productId,
            before: currentState,
            after: null,
          });
          historyEntries.push({
            vendorId: args.vendorId,
            productId: ch.productId,
            priceListId: ch.priceListId,
            field: 'customPrice',
            oldValue: currentState?.customPrice ?? null,
            newValue: null,
            source: 'rollback',
            changedBy: args.actorId,
          });
        }
      } else {
        await tx.priceListItem.upsert({
          where: { priceListId_productId: { priceListId: ch.priceListId, productId: ch.productId } },
          create: {
            priceListId: ch.priceListId,
            productId: ch.productId,
            customPrice: target.customPrice,
            pricingType: 'fixed',
            isLocked: target.isLocked,
            isExcluded: target.isExcluded,
            validFrom: target.validFrom ? new Date(target.validFrom) : null,
            validTo: target.validTo ? new Date(target.validTo) : null,
            note: target.note,
            scheduledPrice: target.scheduledPrice,
            scheduledFrom: target.scheduledFrom ? new Date(target.scheduledFrom) : null,
            scheduledTo: target.scheduledTo ? new Date(target.scheduledTo) : null,
          },
          update: {
            customPrice: target.customPrice,
            isLocked: target.isLocked,
            isExcluded: target.isExcluded,
            validFrom: target.validFrom ? new Date(target.validFrom) : null,
            validTo: target.validTo ? new Date(target.validTo) : null,
            note: target.note,
            scheduledPrice: target.scheduledPrice,
            scheduledFrom: target.scheduledFrom ? new Date(target.scheduledFrom) : null,
            scheduledTo: target.scheduledTo ? new Date(target.scheduledTo) : null,
          },
        });
        restored++;
        rollbackChanges.push({
          priceListId: ch.priceListId,
          productId: ch.productId,
          before: currentState,
          after: target,
        });
        historyEntries.push({
          vendorId: args.vendorId,
          productId: ch.productId,
          priceListId: ch.priceListId,
          field: 'customPrice',
          oldValue: currentState?.customPrice ?? null,
          newValue: target.customPrice,
          source: 'rollback',
          changedBy: args.actorId,
        });
      }
    }

    if (historyEntries.length > 0) {
      await logPriceHistory(historyEntries, tx);
    }

    const latest = await tx.priceListPublish.findFirst({
      where: { vendorId: args.vendorId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const pub = await tx.priceListPublish.create({
      data: {
        vendorId: args.vendorId,
        actorId: args.actorId,
        kind: 'rollback',
        rollbackOfId: source.id,
        baseVersionId: latest?.id ?? null,
        summary: { restored, rollbackOf: source.id } as unknown as Prisma.InputJsonValue,
        changes: rollbackChanges as unknown as Prisma.InputJsonValue,
        cellCount: rollbackChanges.length,
      },
      select: { id: true },
    });
    return pub.id;
  });

  return { publishId: newId, restored };
}

export async function clonePriceList(args: {
  vendorId: string;
  sourceId: string;
  name: string;
  adjustPercent?: number;
}): Promise<{ id: string; name: string; itemCount: number }> {
  const source = await prisma.priceList.findFirst({
    where: { id: args.sourceId, vendorId: args.vendorId },
    include: { items: true },
  });
  if (!source) throw Errors.notFound('Price list');

  const adjust = args.adjustPercent ?? 0;
  const created = await prisma.$transaction(async (tx) => {
    const list = await tx.priceList.create({
      data: {
        vendorId: args.vendorId,
        name: args.name.trim(),
        discountPercent: source.discountPercent,
        floorPercentOfBase: source.floorPercentOfBase,
        validFrom: source.validFrom,
        validTo: source.validTo,
      },
    });

    if (source.items.length > 0) {
      await tx.priceListItem.createMany({
        data: source.items.map((it) => {
          let price = it.customPrice != null ? Number(it.customPrice) : null;
          if (price != null && adjust !== 0) {
            price = Math.round(price * (1 + adjust / 100) * 100) / 100;
          }
          return {
            priceListId: list.id,
            productId: it.productId,
            customPrice: price,
            pricingType: it.pricingType,
            discountPercent: it.discountPercent,
            schemeMinQty: it.schemeMinQty,
            schemeFreeQty: it.schemeFreeQty,
            isLocked: it.isLocked,
            isExcluded: it.isExcluded,
            note: it.note,
          };
        }),
      });
    }
    return { id: list.id, name: list.name, itemCount: source.items.length };
  });

  return created;
}

export async function exportWorkspaceCsv(args: {
  vendorId: string;
  search?: string;
  categoryId?: string;
  brandId?: string;
  collectionId?: string;
  listId?: string;
}): Promise<string> {
  const NOT_TOMBSTONED = { slug: { not: { startsWith: '_deleted_' } } } as const;
  const priceLists = await prisma.priceList.findMany({
    where: { vendorId: args.vendorId, isActive: true, ...(args.listId ? { id: args.listId } : {}) },
    select: { id: true, name: true, discountPercent: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  const single = args.listId ? priceLists[0] : undefined;
  const singleIsSelected = !!single && Number(single.discountPercent) === 0;

  const products = await prisma.product.findMany({
    where: {
      vendorId: args.vendorId,
      isActive: true,
      approvalStatus: 'approved',
      listingStatus: 'submitted',
      ...NOT_TOMBSTONED,
      ...(args.categoryId ? { categoryId: args.categoryId } : {}),
      ...(args.brandId
        ? { brandMappings: { some: { brandId: args.brandId, status: { in: ['verified', 'auto_mapped'] } } } }
        : {}),
      ...(args.collectionId
        ? { collectionProducts: { some: { collectionId: args.collectionId } } }
        : {}),
      // Selected-products list export = members only; percent list = whole catalogue.
      ...(singleIsSelected && single
        ? { priceListItems: { some: { priceListId: single.id } } }
        : {}),
      ...(args.search
        ? {
            OR: [
              { name: { contains: args.search, mode: 'insensitive' as const } },
              { sku: { contains: args.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, sku: true, basePrice: true,
      priceListItems: {
        where: { priceList: { vendorId: args.vendorId, isActive: true, ...(args.listId ? { id: args.listId } : {}) } },
        select: { priceListId: true, customPrice: true, isExcluded: true, discountPercent: true },
      },
    },
  });

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ['SKU', 'Product', 'Base', ...priceLists.map((l) => l.name)].map(escape).join(',');
  const lines = [header];

  for (const p of products) {
    const byList = new Map(p.priceListItems.map((i) => [i.priceListId, i]));
    const cells = priceLists.map((l) => {
      const it = byList.get(l.id);
      if (it?.isExcluded) return 'REMOVED';
      if (it?.customPrice != null) return String(Number(it.customPrice));
      if (it?.discountPercent != null) {
        return String(Math.round(Number(p.basePrice) * (1 - Number(it.discountPercent) / 100) * 100) / 100);
      }
      if (Number(l.discountPercent) > 0) {
        return String(Math.round(Number(p.basePrice) * (1 - Number(l.discountPercent) / 100) * 100) / 100);
      }
      return '';
    });
    lines.push([
      escape(p.sku ?? ''),
      escape(p.name),
      String(Number(p.basePrice)),
      ...cells,
    ].join(','));
  }
  return lines.join('\n');
}
