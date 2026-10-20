/**
 * Assignment preview (read-only) + save with Skip/Replace resolutions.
 * One list per non-customer target value per vendor.
 */

import { prisma } from '@/lib/prisma';
import { Errors, ApiError } from '@/middleware/errorHandler';
import { normalizeCreditStatus } from '@/modules/pricing/pricing.service';
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
  const [crm, orders, wallets] = await Promise.all([
    prisma.vendorCustomer.findMany({
      where: { vendorId },
      select: {
        userId: true, tags: true,
        user: { select: { id: true, fullName: true, businessName: true, email: true, userRoles: { select: { businessAccountId: true } } } },
      },
    }),
    prisma.order.findMany({
      where: { vendorId },
      distinct: ['userId'],
      select: { userId: true, businessAccountId: true, user: { select: { id: true, fullName: true, businessName: true, email: true } } },
    }),
    prisma.creditWallet.findMany({ where: { vendorId }, select: { userId: true, status: true, workflowStatus: true } }),
  ]);

  const byId = new Map<string, UniverseCustomer & { creditRaw?: { status: string; workflowStatus: string } }>();
  const ensure = (userId: string, label: string): UniverseCustomer & { creditRaw?: { status: string; workflowStatus: string } } => {
    let c = byId.get(userId);
    if (!c) {
      c = { userId, label, tags: [], creditStatus: null, accountIds: new Set(), outletIds: new Set(), pincodes: new Set(), cities: new Set(), states: new Set(), groupIds: new Set() };
      byId.set(userId, c);
    }
    return c;
  };

  for (const c of crm) {
    const cust = ensure(c.userId, userLabel(c.user, c.userId));
    cust.tags = Array.from(new Set([...cust.tags, ...(c.tags ?? [])]));
    for (const r of c.user.userRoles) cust.accountIds.add(r.businessAccountId);
  }
  for (const o of orders) {
    const cust = ensure(o.userId, userLabel(o.user, o.userId));
    if (o.businessAccountId) cust.accountIds.add(o.businessAccountId);
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
  priceList: { id: string; name: string };
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

function computeEffective(c: UniverseCustomer, assignments: AssignmentRow[], excludeListId?: string) {
  for (const type of LADDER_ORDER) {
    const match = assignments.find((a) => a.type === type && a.priceList.id !== excludeListId && assignmentMatchesCustomer(a, c));
    if (match) {
      return { priceListId: match.priceList.id, priceListName: match.priceList.name, via: VIA_LABELS[type] ?? type, assignedAt: match.assignedAt?.toISOString() ?? null };
    }
  }
  return { priceListId: null as string | null, priceListName: 'Base catalogue', via: 'No rule matched — Base price applies', assignedAt: null as string | null };
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
    select: { id: true, name: true, _count: { select: { items: true } } },
  });
  if (!list) throw Errors.notFound('Price list');

  // One-list-per-target for non-customer types
  let alreadyBound: { priceListId: string; priceListName: string } | null = null;
  if (args.target.type !== 'customer') {
    const keyFields: Record<string, unknown> = { type: args.target.type };
    if (args.target.type === 'pincode') keyFields.pincode = args.target.pincode;
    if (args.target.type === 'area') keyFields.area = args.target.area;
    if (args.target.type === 'segment') keyFields.segment = args.target.segment;
    if (args.target.type === 'group') keyFields.groupId = args.target.groupId;
    if (args.target.type === 'outlet') keyFields.outletId = args.target.outletId;
    if (args.target.type === 'brand') {
      if (args.target.brandId) keyFields.brandId = args.target.brandId;
      else keyFields.brandName = args.target.brandName;
    }
    if (args.target.type === 'credit_status') keyFields.creditStatus = args.target.creditStatus;

    const other = await prisma.priceListAssignment.findFirst({
      where: {
        ...keyFields,
        priceList: { vendorId: args.vendorId, isActive: true, id: { not: args.priceListId } },
      },
      include: { priceList: { select: { id: true, name: true } } },
    });
    if (other) {
      alreadyBound = { priceListId: other.priceList.id, priceListName: other.priceList.name };
    }
  }

  const affected = await expandAffectedCustomers(args.vendorId, args.target);
  const conflicts: Array<{
    userId: string;
    customerName: string;
    existingPricelistId: string;
    existingPricelist: string;
    via: string;
  }> = [];

  if (affected.length > 0) {
    const [universe, allAssignments] = await Promise.all([
      loadCustomerUniverse(args.vendorId),
      prisma.priceListAssignment.findMany({
        where: { priceList: { vendorId: args.vendorId, isActive: true } },
        include: { priceList: { select: { id: true, name: true } } },
      }),
    ]);
    const universeById = new Map(universe.map((u) => [u.userId, u]));
    for (const c of affected) {
      const cust = universeById.get(c.userId);
      if (!cust) continue;
      const eff = computeEffective(cust, allAssignments as AssignmentRow[], args.priceListId);
      if (eff.priceListId) {
        conflicts.push({
          userId: c.userId,
          customerName: c.label,
          existingPricelistId: eff.priceListId,
          existingPricelist: eff.priceListName,
          via: eff.via,
        });
      }
    }
  }

  return {
    priceListId: list.id,
    priceListName: list.name,
    itemCount: list._count.items,
    affectedCount: affected.length,
    affected,
    conflicts,
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

  const resolutionMap = new Map((args.resolutions ?? []).map((r) => [r.userId, r.action]));
  let skipped = 0;
  let replaced = 0;

  await prisma.$transaction(async (tx) => {
    // Enforce one-list-per-target for non-customer targets
    for (const a of args.assignments) {
      if (a.type === 'customer') continue;
      const other = await tx.priceListAssignment.findFirst({
        where: {
          type: a.type,
          priceList: { vendorId: args.vendorId, isActive: true, id: { not: args.priceListId } },
          ...(a.type === 'pincode' ? { pincode: a.pincode ?? undefined } : {}),
          ...(a.type === 'area' ? { area: a.area ?? undefined } : {}),
          ...(a.type === 'segment' ? { segment: a.segment ?? undefined } : {}),
          ...(a.type === 'group' ? { groupId: a.groupId ?? undefined } : {}),
          ...(a.type === 'outlet' ? { outletId: a.outletId ?? undefined } : {}),
          ...(a.type === 'credit_status' ? { creditStatus: a.creditStatus ?? undefined } : {}),
          ...(a.type === 'brand' && a.brandId ? { brandId: a.brandId } : {}),
          ...(a.type === 'brand' && !a.brandId && a.brandName ? { brandName: a.brandName } : {}),
        },
        include: { priceList: { select: { id: true, name: true } } },
      });
      if (other && a.moveFrom !== other.priceList.id) {
        throw new ApiError(
          'TARGET_BOUND',
          `"${other.priceList.name}" already uses this target. Move it first.`,
          409,
          { holdingListId: other.priceList.id, holdingListName: other.priceList.name },
        );
      }
      if (other && a.moveFrom === other.priceList.id) {
        await tx.priceListAssignment.delete({ where: { id: other.id } });
      }
    }

    // Apply Skip/Replace for customers who already have a direct assignment
    for (const a of args.assignments) {
      if (a.type !== 'customer' || !a.userId) continue;
      const action = resolutionMap.get(a.userId);
      if (!action) continue;
      const other = await tx.priceListAssignment.findFirst({
        where: {
          type: 'customer',
          userId: a.userId,
          priceList: { vendorId: args.vendorId, isActive: true, id: { not: args.priceListId } },
        },
      });
      if (!other) continue;
      if (action === 'replace') {
        await tx.priceListAssignment.delete({ where: { id: other.id } });
        replaced++;
      } else if (action === 'skip') {
        skipped++;
      }
    }

    // Filter out skipped customers from the new assignment set
    const skipUsers = new Set(
      [...resolutionMap.entries()].filter(([, v]) => v === 'skip').map(([k]) => k),
    );
    const finalAssignments = args.assignments.filter(
      (a) => !(a.type === 'customer' && a.userId && skipUsers.has(a.userId)),
    );

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

  return {
    saved: args.assignments.length - skipped,
    skipped,
    replaced,
  };
}

export async function listEffectiveAssignments(vendorId: string) {
  const [universe, assignments] = await Promise.all([
    loadCustomerUniverse(vendorId),
    prisma.priceListAssignment.findMany({
      where: { priceList: { vendorId, isActive: true } },
      include: { priceList: { select: { id: true, name: true } } },
    }),
  ]);

  return universe.map((c) => ({
    userId: c.userId,
    label: c.label,
    tags: c.tags,
    creditStatus: c.creditStatus,
    pincodes: [...c.pincodes],
    cities: [...c.cities],
    effective: computeEffective(c, assignments as AssignmentRow[]),
  }));
}
