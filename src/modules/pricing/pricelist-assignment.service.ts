/**
 * Assignment preview (read-only) + save.
 * Client rule: a customer may have several lists from one supplier when
 * they cover DIFFERENT products. If two applicable lists both price the
 * SAME product for the same customer at the SAME ladder level, that is a
 * conflict — detected here at assignment time; the supplier must Skip,
 * Replace, or Review Manually. Never silently resolved by list order.
 * Different levels follow the client's documented ladder (specific beats
 * broad). Hidden (excluded) items are not prices, so they never conflict
 * (Hidden wins at resolve time). Suppliers are independent (vendor-scoped).
 */

import { prisma } from '@/lib/prisma';
import { Errors, ApiError } from '@/middleware/errorHandler';
import { normalizeCreditStatus } from '@/modules/pricing/pricing.service';
import { marketplaceCustomerFilter } from '@/lib/marketplaceCustomers';
import type { PriceListAssignmentType } from '@prisma/client';

export type AssignmentTarget = {
  type: PriceListAssignmentType;
  userId?: string | null;
  businessAccountId?: string | null;
  outletId?: string | null;
  brandId?: string | null;
  groupId?: string | null;
  pincode?: string | null;
  area?: string | null;
  segment?: string | null;
  brandName?: string | null;
  creditStatus?: string | null;
  /** When set, move this target off the other list (one-list-per-target). */
  moveFrom?: string | null;
};

export type ConflictResolution = {
  userId: string;
  action: 'skip' | 'replace';
};

function targetKey(t: AssignmentTarget): string {
  switch (t.type) {
    case 'customer': return `customer:${t.userId ?? t.businessAccountId ?? ''}`;
    case 'outlet': return `outlet:${t.outletId ?? ''}`;
    case 'pincode': return `pincode:${t.pincode ?? ''}`;
    case 'area': return `area:${(t.area ?? '').toLowerCase()}`;
    case 'segment': return `segment:${(t.segment ?? '').toLowerCase()}`;
    case 'group': return `group:${t.groupId ?? ''}`;
    case 'brand': return `brand:${t.brandId ?? t.brandName ?? ''}`;
    case 'credit_status': return `credit_status:${(t.creditStatus ?? '').toLowerCase()}`;
    default: return `${t.type}:`;
  }
}

type UniverseCustomer = {
  userId: string;
  label: string;
  hcidDisplay: string | null;
  tags: string[];
  creditStatus: string | null;
  accountIds: Set<string>;
  outletIds: Set<string>;
  pincodes: Set<string>;
  cities: Set<string>;
  states: Set<string>;
  groupIds: Set<string>;
};

const userLabel = (u: { fullName: string | null; businessName: string | null; email: string | null }, id: string) =>
  u.businessName ?? u.fullName ?? u.email ?? id;

/**
 * Every customer this vendor actually trades with — CRM rows UNION order
 * buyers UNION credit-wallet holders. pricing-targets uses the same union;
 * assignments must too, otherwise order-only buyers (no CRM row) preview as
 * "0 affected" and show "Base catalogue" even when directly assigned.
 */
async function loadCustomerUniverse(vendorId: string): Promise<UniverseCustomer[]> {
  const [crm, orders, wallets, platformCustomers] = await Promise.all([
    prisma.vendorCustomer.findMany({
      where: { vendorId },
      select: {
        userId: true, tags: true,
        user: { select: { id: true, fullName: true, businessName: true, email: true, hcidDisplay: true, pincode: true, userRoles: { select: { businessAccountId: true } } } },
      },
    }),
    prisma.order.findMany({
      where: { vendorId },
      distinct: ['userId'],
      select: { userId: true, businessAccountId: true, user: { select: { id: true, fullName: true, businessName: true, email: true, hcidDisplay: true, pincode: true } } },
    }),
    prisma.creditWallet.findMany({ where: { vendorId }, select: { userId: true, status: true, workflowStatus: true } }),
    // All platform customers — assignments/effective must work for buyers who
    // have not ordered from this vendor yet too, not only past buyers.
    prisma.user.findMany({
      where: marketplaceCustomerFilter(),
      select: { id: true, fullName: true, businessName: true, email: true, hcidDisplay: true, pincode: true, accountMemberships: { select: { businessAccountId: true } } },
    }),
  ]);

  const byId = new Map<string, UniverseCustomer & { creditRaw?: { status: string; workflowStatus: string } }>();
  const ensure = (userId: string, label: string): UniverseCustomer & { creditRaw?: { status: string; workflowStatus: string } } => {
    let c = byId.get(userId);
    if (!c) {
      c = { userId, label, hcidDisplay: null, tags: [], creditStatus: null, accountIds: new Set(), outletIds: new Set(), pincodes: new Set(), cities: new Set(), states: new Set(), groupIds: new Set() };
      byId.set(userId, c);
    }
    return c;
  };

  for (const c of crm) {
    const cust = ensure(c.userId, userLabel(c.user, c.userId));
    cust.tags = Array.from(new Set([...cust.tags, ...(c.tags ?? [])]));
    if (!cust.hcidDisplay && c.user.hcidDisplay) cust.hcidDisplay = c.user.hcidDisplay;
    if (c.user.pincode) cust.pincodes.add(c.user.pincode);
    for (const r of c.user.userRoles) cust.accountIds.add(r.businessAccountId);
  }
  for (const o of orders) {
    const cust = ensure(o.userId, userLabel(o.user, o.userId));
    if (!cust.hcidDisplay && o.user.hcidDisplay) cust.hcidDisplay = o.user.hcidDisplay;
    if (o.user.pincode) cust.pincodes.add(o.user.pincode);
    if (o.businessAccountId) cust.accountIds.add(o.businessAccountId);
  }
  for (const u of platformCustomers) {
    const cust = ensure(u.id, userLabel(u, u.id));
    if (!cust.hcidDisplay && u.hcidDisplay) cust.hcidDisplay = u.hcidDisplay;
    if (u.pincode) cust.pincodes.add(u.pincode);
    for (const m of u.accountMemberships) cust.accountIds.add(m.businessAccountId);
  }
  const walletUserIds = wallets.map((w) => w.userId).filter((id) => !byId.has(id));
  if (walletUserIds.length > 0) {
    const users = await prisma.user.findMany({ where: { id: { in: walletUserIds } }, select: { id: true, fullName: true, businessName: true, email: true } });
    for (const u of users) ensure(u.id, userLabel(u, u.id));
  }
  for (const w of wallets) {
    const cust = byId.get(w.userId);
    if (cust) cust.creditStatus = normalizeCreditStatus(w.status, w.workflowStatus);
  }

  const accountIds = [...new Set([...byId.values()].flatMap((c) => [...c.accountIds]))];
  if (accountIds.length > 0) {
    const [outlets, roles, memberships] = await Promise.all([
      prisma.outlet.findMany({ where: { businessAccountId: { in: accountIds }, isActive: true }, select: { id: true, businessAccountId: true, pincode: true, city: true, state: true } }),
      prisma.userRole.findMany({ where: { businessAccountId: { in: accountIds } }, select: { userId: true, businessAccountId: true } }),
      prisma.customerGroupMember.findMany({ where: { group: { vendorId }, OR: [{ userId: { in: [...byId.keys()] } }, { businessAccountId: { in: accountIds } }] }, select: { userId: true, businessAccountId: true, groupId: true } }),
    ]);
    const accountToUsers = new Map<string, string[]>();
    for (const r of roles) {
      const arr = accountToUsers.get(r.businessAccountId) ?? [];
      arr.push(r.userId);
      accountToUsers.set(r.businessAccountId, arr);
    }
    // Also link accounts discovered via orders/CRM even if userRole rows differ
    for (const c of byId.values()) for (const acc of c.accountIds) {
      const arr = accountToUsers.get(acc) ?? [];
      if (!arr.includes(c.userId)) arr.push(c.userId);
      accountToUsers.set(acc, arr);
    }
    for (const o of outlets) {
      for (const uid of accountToUsers.get(o.businessAccountId) ?? []) {
        const cust = byId.get(uid);
        if (!cust) continue;
        cust.outletIds.add(o.id);
        if (o.pincode) cust.pincodes.add(o.pincode);
        if (o.city) cust.cities.add(o.city);
        if (o.state) cust.states.add(o.state);
      }
    }
    for (const m of memberships) {
      const targets = new Set<string>();
      if (m.userId) targets.add(m.userId);
      if (m.businessAccountId) for (const uid of accountToUsers.get(m.businessAccountId) ?? []) targets.add(uid);
      for (const uid of targets) byId.get(uid)?.groupIds.add(m.groupId);
    }
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

type AssignmentRow = {
  type: string; userId: string | null; businessAccountId: string | null; outletId: string | null;
  groupId: string | null; pincode: string | null; area: string | null; segment: string | null;
  creditStatus: string | null; assignedAt: Date | null;
  priceList: { id: string; name: string; priority?: number; createdAt?: Date | string; _count?: { items: number } };
};

const VIA_LABELS: Record<string, string> = {
  outlet: 'Outlet rule', customer: 'Direct customer rule', group: 'Customer group rule',
  credit_status: 'Credit status rule', segment: 'Segment rule', pincode: 'Pincode rule', area: 'Area rule',
};
const LADDER_ORDER = ['outlet', 'customer', 'group', 'credit_status', 'segment', 'pincode', 'area'] as const;

function assignmentMatchesCustomer(a: AssignmentRow, c: UniverseCustomer): boolean {
  switch (a.type) {
    case 'outlet': return !!a.outletId && c.outletIds.has(a.outletId);
    case 'customer': return (!!a.userId && a.userId === c.userId) || (!!a.businessAccountId && c.accountIds.has(a.businessAccountId));
    case 'group': return !!a.groupId && c.groupIds.has(a.groupId);
    case 'credit_status': return !!a.creditStatus && !!c.creditStatus && a.creditStatus.toLowerCase() === c.creditStatus.toLowerCase();
    case 'segment': return !!a.segment && c.tags.some((t) => t.toLowerCase() === a.segment!.toLowerCase());
    case 'pincode': return !!a.pincode && c.pincodes.has(a.pincode);
    case 'area': {
      if (!a.area) return false;
      const n = a.area.toLowerCase();
      return [...c.cities, ...c.states].some((v) => v.toLowerCase() === n);
    }
    default: return false;
  }
}

export type EffectiveList = {
  priceListId: string; priceListName: string; via: string; type: string; assignedAt: string | null; itemCount: number;
};

function computeEffectiveLists(c: UniverseCustomer, assignments: AssignmentRow[], excludeListId?: string): EffectiveList[] {
  const lists: EffectiveList[] = [];
  for (const type of LADDER_ORDER) {
    const matches = assignments
      .filter((a) => a.type === type && a.priceList.id !== excludeListId && assignmentMatchesCustomer(a, c))
      .sort((x, y) => {
        const dp = (x.priceList.priority ?? 0) - (y.priceList.priority ?? 0);
        if (dp !== 0) return dp;
        return new Date(x.priceList.createdAt ?? 0).getTime() - new Date(y.priceList.createdAt ?? 0).getTime();
      });
    for (const m of matches) {
      if (lists.some((l) => l.priceListId === m.priceList.id)) continue;
      lists.push({
        priceListId: m.priceList.id,
        priceListName: m.priceList.name,
        via: VIA_LABELS[type] ?? type,
        type,
        assignedAt: m.assignedAt?.toISOString() ?? null,
        itemCount: m.priceList._count?.items ?? 0,
      });
    }
  }
  return lists;
}

export type PriceConflict = {
  userId: string;
  customerName: string;
  existingPricelistId: string;
  existingPricelist: string;
  via: string;
  viaType: string;
  targetKey: string;
  productCount: number;
  productNames: string[];
};

/** Products each active list actually prices (excluded/Hidden items are not prices). */
async function loadPricedProducts(vendorId: string): Promise<Map<string, Set<string>>> {
  const [lists, allProducts] = await Promise.all([
    prisma.priceList.findMany({
      where: { vendorId, isActive: true },
      select: {
        id: true, discountPercent: true,
        items: { select: { productId: true, isExcluded: true, customPrice: true, discountPercent: true } },
      },
    }),
    prisma.product.findMany({
      where: { vendorId, isActive: true, approvalStatus: 'approved', listingStatus: 'submitted' },
      select: { id: true },
    }),
  ]);
  const allIds = allProducts.map((p) => p.id);
  const map = new Map<string, Set<string>>();
  for (const l of lists) {
    // A list-wide % list defines a price for every product.
    if (Number(l.discountPercent) > 0) { map.set(l.id, new Set(allIds)); continue; }
    const priced = new Set<string>();
    for (const it of l.items) {
      if (it.isExcluded) continue;
      if (it.customPrice != null || it.discountPercent != null) priced.add(it.productId);
    }
    map.set(l.id, priced);
  }
  return map;
}

async function productNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * For newly-added targets on `priceListId`, find customers for whom another
 * already-applicable list prices the same product(s) as this list.
 */
async function detectConflicts(args: {
  vendorId: string;
  priceListId: string;
  targets: AssignmentTarget[];
}): Promise<PriceConflict[]> {
  if (args.targets.length === 0) return [];
  const [universe, allAssignments, pricedMap] = await Promise.all([
    loadCustomerUniverse(args.vendorId),
    prisma.priceListAssignment.findMany({
      where: { priceList: { vendorId: args.vendorId, isActive: true } },
      include: { priceList: { select: { id: true, name: true, priority: true, createdAt: true, _count: { select: { items: true } } } } },
    }),
    loadPricedProducts(args.vendorId),
  ]);
  const thisPriced = pricedMap.get(args.priceListId) ?? new Set<string>();
  if (thisPriced.size === 0) return [];
  const universeById = new Map(universe.map((u) => [u.userId, u]));
  const conflicts: PriceConflict[] = [];
  const seen = new Set<string>();
  const overlapIds = new Set<string>();

  for (const target of args.targets) {
    const affected = await expandAffectedCustomers(args.vendorId, target);
    const targetLevel = (LADDER_ORDER as readonly string[]).indexOf(target.type);
    for (const aff of affected) {
      const cust = universeById.get(aff.userId);
      if (!cust) continue;
      const others = computeEffectiveLists(cust, allAssignments as AssignmentRow[], args.priceListId);
      for (const other of others) {
        // Client ladder resolves DIFFERENT levels deterministically
        // (customer > group > area > global). Only a SAME-level overlap is
        // ambiguous — that is the conflict the supplier must decide.
        const otherLevel = (LADDER_ORDER as readonly string[]).indexOf(other.type);
        if (targetLevel >= 0 && otherLevel >= 0 && otherLevel !== targetLevel) continue;
        const otherPriced = pricedMap.get(other.priceListId) ?? new Set<string>();
        const overlap = [...thisPriced].filter((id) => otherPriced.has(id));
        if (overlap.length === 0) continue;
        const key = `${aff.userId}:${other.priceListId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        overlap.forEach((id) => overlapIds.add(id));
        conflicts.push({
          userId: aff.userId,
          customerName: aff.label,
          existingPricelistId: other.priceListId,
          existingPricelist: other.priceListName,
          via: other.via,
          viaType: other.type,
          targetKey: targetKey(target),
          productCount: overlap.length,
          productNames: [],
        });
      }
    }
  }
  if (conflicts.length > 0) {
    const names = await productNames([...overlapIds].slice(0, 200));
    // Recompute per-conflict names (cheap: sets are small in practice)
    for (const c of conflicts) {
      const otherPriced = pricedMap.get(c.existingPricelistId) ?? new Set<string>();
      c.productNames = [...thisPriced].filter((id) => otherPriced.has(id)).slice(0, 10).map((id) => names.get(id) ?? id);
    }
  }
  return conflicts;
}

function computeEffective(c: UniverseCustomer, assignments: AssignmentRow[], excludeListId?: string) {
  const lists = computeEffectiveLists(c, assignments, excludeListId);
  const first = lists[0];
  if (first) {
    return { priceListId: first.priceListId as string | null, priceListName: first.priceListName, via: first.via, assignedAt: first.assignedAt, lists };
  }
  return { priceListId: null as string | null, priceListName: 'Base catalogue', via: 'No rule matched — Base price applies', assignedAt: null as string | null, lists };
}

async function expandAffectedCustomers(
  vendorId: string,
  target: AssignmentTarget,
): Promise<Array<{ userId: string; label: string }>> {
  if (target.type === 'customer' && target.userId) {
    const u = await prisma.user.findUnique({
      where: { id: target.userId },
      select: { id: true, fullName: true, businessName: true, email: true },
    });
    if (!u) return [];
    return [{ userId: u.id, label: u.businessName ?? u.fullName ?? u.email ?? u.id }];
  }

  if (target.type === 'group' && target.groupId) {
    const members = await prisma.customerGroupMember.findMany({
      where: { groupId: target.groupId, group: { vendorId } },
      select: { userId: true },
    });
    const ids = members.map((m) => m.userId).filter(Boolean) as string[];
    if (ids.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, businessName: true, email: true },
    });
    return users.map((u) => ({
      userId: u.id,
      label: u.businessName ?? u.fullName ?? u.email ?? u.id,
    }));
  }

  // Pincode / area / segment / credit_status / outlet — expand via the full customer universe
  const universe = await loadCustomerUniverse(vendorId);
  const toRef = (c: UniverseCustomer) => ({ userId: c.userId, label: c.label });

  if (target.type === 'segment' && target.segment) {
    const needle = target.segment.toLowerCase();
    return universe.filter((c) => c.tags.some((t) => t.toLowerCase() === needle)).map(toRef);
  }
  if (target.type === 'credit_status' && target.creditStatus) {
    const needle = target.creditStatus.toLowerCase();
    return universe.filter((c) => c.creditStatus?.toLowerCase() === needle).map(toRef);
  }
  if (target.type === 'pincode' && target.pincode) {
    return universe.filter((c) => c.pincodes.has(target.pincode!)).map(toRef);
  }
  if (target.type === 'area' && target.area) {
    const needle = target.area.toLowerCase();
    return universe.filter((c) => [...c.cities, ...c.states].some((v) => v.toLowerCase() === needle)).map(toRef);
  }
  if (target.type === 'outlet' && target.outletId) {
    return universe.filter((c) => c.outletIds.has(target.outletId!)).map(toRef);
  }
  return [];
}

export async function previewAssignment(args: {
  vendorId: string;
  priceListId: string;
  target: AssignmentTarget;
}) {
  const list = await prisma.priceList.findFirst({
    where: { id: args.priceListId, vendorId: args.vendorId },
    select: { id: true, name: true, priority: true, createdAt: true, discountPercent: true, _count: { select: { items: true } } },
  });
  if (!list) throw Errors.notFound('Price list');

  const affected = await expandAffectedCustomers(args.vendorId, args.target);
  const alreadyBound: { priceListId: string; priceListName: string } | null = null;
  // Conflicts = SAME product priced by another applicable list for the same
  // customer. Different products on different lists is fine (no conflict).
  const conflicts = await detectConflicts({
    vendorId: args.vendorId,
    priceListId: args.priceListId,
    targets: [args.target],
  });
  const overlaps = [...new Map(conflicts.map((c) => [c.existingPricelistId, {
    otherListId: c.existingPricelistId,
    otherListName: c.existingPricelist,
    productCount: c.productCount,
  }])).values()];

  return {
    priceListId: list.id,
    priceListName: list.name,
    itemCount: list._count.items,
    affectedCount: affected.length,
    affected,
    conflicts,
    overlaps,
    alreadyBound,
    targetKey: targetKey(args.target),
  };
}

export async function saveAssignments(args: {
  vendorId: string;
  actorId: string;
  priceListId: string;
  assignments: AssignmentTarget[];
  resolutions?: ConflictResolution[];
}): Promise<{ saved: number; skipped: number; replaced: number }> {
  const list = await prisma.priceList.findFirst({
    where: { id: args.priceListId, vendorId: args.vendorId },
    select: { id: true },
  });
  if (!list) throw Errors.notFound('Price list');

  // ---- Conflict gate: only NEWLY added targets can create conflicts. ----
  const existingRows = await prisma.priceListAssignment.findMany({
    where: { priceListId: args.priceListId },
    select: { type: true, userId: true, businessAccountId: true, outletId: true, brandId: true, groupId: true, pincode: true, area: true, segment: true, brandName: true, creditStatus: true },
  });
  const existingKeys = new Set(existingRows.map((r) => targetKey(r as AssignmentTarget)));
  const addedTargets = args.assignments.filter((a) => !existingKeys.has(targetKey(a)));

  const resMap = new Map((args.resolutions ?? []).map((r) => [r.userId, r.action]));
  let finalAssignments = args.assignments;
  let skipped = 0;
  let replaced = 0;

  if (addedTargets.length > 0) {
    const conflicts = await detectConflicts({
      vendorId: args.vendorId,
      priceListId: args.priceListId,
      targets: addedTargets,
    });
    if (conflicts.length > 0) {
      const unresolved = conflicts.filter((c) => !resMap.has(c.userId));
      if (unresolved.length > 0) {
        throw new ApiError(
          'PRICE_CONFLICT',
          `${unresolved.length} product-price conflict(s): the same product is already priced for the customer on another list. Choose Skip, Replace, or Review Manually.`,
          409,
          { conflicts: unresolved },
        );
      }
      // Replace cannot surgically remove a group/pincode/etc rule that
      // covers many customers — that needs Review Manually.
      const manual = conflicts.filter(
        (c) => resMap.get(c.userId) === 'replace' && c.viaType !== 'customer',
      );
      if (manual.length > 0) {
        throw new ApiError(
          'PRICE_CONFLICT',
          'These customers get the other list via a shared rule (group/pincode/area/segment/credit), so Replace cannot move only them. Review Manually instead.',
          409,
          { conflicts: manual, reviewRequired: true },
        );
      }
      const addedKeys = new Map(addedTargets.map((a) => [targetKey(a), a]));
      const skipUsers = new Set(conflicts.filter((c) => resMap.get(c.userId) === 'skip').map((c) => c.userId));
      const replaceConflicts = conflicts.filter((c) => resMap.get(c.userId) === 'replace');

      // Skip: drop a direct-customer target for that customer; for shared
      // targets, drop the target (it would clash for that customer).
      finalAssignments = finalAssignments.filter((a) => {
        if (!addedKeys.has(targetKey(a))) return true;
        if (a.type === 'customer') {
          const uid = a.userId ?? null;
          if (uid && skipUsers.has(uid)) { skipped += 1; return false; }
          return true;
        }
        // shared target: dropped if any of its conflicting customers chose Skip
        const hits = conflicts.some(
          (c) => resMap.get(c.userId) === 'skip' && c.targetKey === targetKey(a),
        );
        if (hits) { skipped += 1; return false; }
        return true;
      });

      // Replace: remove the customer's direct assignment from the old list,
      // then the new assignment (already in finalAssignments) takes over.
      if (replaceConflicts.length > 0) {
        await prisma.priceListAssignment.deleteMany({
          where: {
            OR: replaceConflicts.map((c) => ({
              priceListId: c.existingPricelistId,
              type: 'customer' as const,
              userId: c.userId,
            })),
          },
        });
        replaced = replaceConflicts.length;
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.priceListAssignment.deleteMany({ where: { priceListId: args.priceListId } });
    if (finalAssignments.length > 0) {
      const assignedAt = new Date();
      await tx.priceListAssignment.createMany({
        data: finalAssignments.map((a) => ({
          priceListId: args.priceListId,
          type: a.type,
          userId: a.type === 'customer' ? a.userId ?? null : null,
          businessAccountId: a.type === 'customer' ? a.businessAccountId ?? null : null,
          outletId: a.type === 'outlet' ? a.outletId ?? null : null,
          brandId: a.type === 'brand' ? a.brandId ?? null : null,
          groupId: a.type === 'group' ? a.groupId ?? null : null,
          pincode: a.type === 'pincode' ? a.pincode ?? null : null,
          area: a.type === 'area' ? a.area ?? null : null,
          segment: a.type === 'segment' ? a.segment ?? null : null,
          brandName: a.type === 'brand' ? a.brandName ?? null : null,
          creditStatus: a.type === 'credit_status' ? a.creditStatus ?? null : null,
          assignedById: args.actorId,
          assignedAt,
        })),
      });
    }
  });

  return { saved: finalAssignments.length, skipped, replaced };
}

export async function listEffectiveAssignments(vendorId: string) {
  const [universe, assignments, pricedMap] = await Promise.all([
    loadCustomerUniverse(vendorId),
    prisma.priceListAssignment.findMany({
      where: { priceList: { vendorId, isActive: true } },
      include: { priceList: { select: { id: true, name: true, priority: true, createdAt: true, _count: { select: { items: true } } } } },
    }),
    loadPricedProducts(vendorId),
  ]);

  return universe.map((c) => {
    const effective = computeEffective(c, assignments as AssignmentRow[]);
    // Existing SAME-level overlap between lists this customer already gets
    // (created before the conflict gate). Cross-level overlaps are resolved
    // by the client ladder and are not conflicts.
    let conflict: { productCount: number; listNames: string[] } | null = null;
    const lists = effective?.lists ?? [];
    if (lists.length > 1) {
      const seenByLevel = new Map<string, Set<string>>();
      const clash = new Set<string>();
      const clashLists = new Set<string>();
      for (const l of lists) {
        const seen = seenByLevel.get(l.type) ?? new Set<string>();
        for (const pid of pricedMap.get(l.priceListId) ?? []) {
          if (seen.has(pid)) { clash.add(pid); clashLists.add(l.priceListName); }
          seen.add(pid);
        }
        seenByLevel.set(l.type, seen);
      }
      if (clash.size > 0) conflict = { productCount: clash.size, listNames: [...clashLists] };
    }
    return {
      userId: c.userId,
      label: c.label,
      hcidDisplay: c.hcidDisplay,
      tags: c.tags,
      creditStatus: c.creditStatus,
      pincodes: [...c.pincodes],
      cities: [...c.cities],
      effective,
      conflict,
    };
  });
}
