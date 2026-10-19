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

  // For pincode / area / segment / credit_status — expand via CRM + outlets
  const crm = await prisma.vendorCustomer.findMany({
    where: { vendorId },
    select: {
      userId: true,
      tags: true,
      user: {
        select: {
          id: true,
          fullName: true,
          businessName: true,
          email: true,
          userRoles: { select: { businessAccountId: true } },
        },
      },
    },
  });

  if (target.type === 'segment' && target.segment) {
    const needle = target.segment.toLowerCase();
    return crm
      .filter((c) => c.tags.some((t) => t.toLowerCase() === needle))
      .map((c) => ({
        userId: c.userId,
        label: c.user.businessName ?? c.user.fullName ?? c.user.email ?? c.userId,
      }));
  }

  if (target.type === 'credit_status' && target.creditStatus) {
    const wallets = await prisma.creditWallet.findMany({
      where: { vendorId },
      select: { userId: true, status: true, workflowStatus: true },
    });
    const needle = target.creditStatus.toLowerCase();
    const matched = new Set(
      wallets
        .filter((w) => normalizeCreditStatus(w.status, w.workflowStatus) === needle)
        .map((w) => w.userId),
    );
    return crm
      .filter((c) => matched.has(c.userId))
      .map((c) => ({
        userId: c.userId,
        label: c.user.businessName ?? c.user.fullName ?? c.user.email ?? c.userId,
      }));
  }

  if ((target.type === 'pincode' && target.pincode) || (target.type === 'area' && target.area)) {
    const accountIds = new Set(
      crm.flatMap((c) => c.user.userRoles.map((r) => r.businessAccountId)),
    );
    const outlets = accountIds.size
      ? await prisma.outlet.findMany({
          where: { businessAccountId: { in: [...accountIds] }, isActive: true },
          select: { businessAccountId: true, pincode: true, city: true, state: true },
        })
      : [];
    const matchingAccounts = new Set<string>();
    for (const o of outlets) {
      if (target.type === 'pincode' && o.pincode === target.pincode) {
        matchingAccounts.add(o.businessAccountId);
      }
      if (target.type === 'area') {
        const needle = (target.area ?? '').toLowerCase();
        if (o.city?.toLowerCase() === needle || o.state?.toLowerCase() === needle) {
          matchingAccounts.add(o.businessAccountId);
        }
      }
    }
    return crm
      .filter((c) => c.user.userRoles.some((r) => matchingAccounts.has(r.businessAccountId)))
      .map((c) => ({
        userId: c.userId,
        label: c.user.businessName ?? c.user.fullName ?? c.user.email ?? c.userId,
      }));
  }

  if (target.type === 'outlet' && target.outletId) {
    const outlet = await prisma.outlet.findUnique({
      where: { id: target.outletId },
      select: { businessAccountId: true },
    });
    if (!outlet) return [];
    return crm
      .filter((c) => c.user.userRoles.some((r) => r.businessAccountId === outlet.businessAccountId))
      .map((c) => ({
        userId: c.userId,
        label: c.user.businessName ?? c.user.fullName ?? c.user.email ?? c.userId,
      }));
  }

  return [];
}

async function currentEffectiveListForCustomer(
  vendorId: string,
  userId: string,
  excludeListId?: string,
): Promise<{ priceListId: string; priceListName: string; via: string } | null> {
  const assignments = await prisma.priceListAssignment.findMany({
    where: {
      priceList: { vendorId, isActive: true, ...(excludeListId ? { id: { not: excludeListId } } : {}) },
      type: 'customer',
      userId,
    },
    include: { priceList: { select: { id: true, name: true } } },
    take: 1,
  });
  if (assignments[0]) {
    return {
      priceListId: assignments[0].priceList.id,
      priceListName: assignments[0].priceList.name,
      via: 'Direct customer assignment',
    };
  }
  return null;
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

  for (const c of affected) {
    const cur = await currentEffectiveListForCustomer(args.vendorId, c.userId, args.priceListId);
    if (cur) {
      conflicts.push({
        userId: c.userId,
        customerName: c.label,
        existingPricelistId: cur.priceListId,
        existingPricelist: cur.priceListName,
        via: cur.via,
      });
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
  const [crm, directAssignments, creditWallets] = await Promise.all([
    prisma.vendorCustomer.findMany({
      where: { vendorId },
      select: {
        userId: true,
        tags: true,
        user: { select: { fullName: true, businessName: true, email: true } },
      },
    }),
    prisma.priceListAssignment.findMany({
      where: { priceList: { vendorId, isActive: true }, type: 'customer' },
      include: { priceList: { select: { id: true, name: true } } },
    }),
    prisma.creditWallet.findMany({
      where: { vendorId },
      select: { userId: true, status: true, workflowStatus: true },
    }),
  ]);

  const directByUser = new Map(
    directAssignments
      .filter((a) => a.userId)
      .map((a) => [a.userId!, {
        priceListId: a.priceList.id,
        priceListName: a.priceList.name,
        via: 'Direct customer',
        assignedAt: a.assignedAt?.toISOString() ?? null,
      }]),
  );

  const creditByUser = new Map(
    creditWallets.map((w) => [w.userId, normalizeCreditStatus(w.status, w.workflowStatus)]),
  );

  return crm.map((c) => {
    const direct = directByUser.get(c.userId);
    return {
      userId: c.userId,
      label: c.user.businessName ?? c.user.fullName ?? c.user.email ?? c.userId,
      tags: c.tags,
      creditStatus: creditByUser.get(c.userId) ?? null,
      effective: direct ?? { priceListId: null, priceListName: 'Base', via: 'Base catalogue', assignedAt: null },
    };
  });
}
