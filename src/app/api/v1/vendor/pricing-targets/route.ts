// GET /api/v1/vendor/pricing-targets — the customers and customer outlets
// this vendor can target in price-list assignments.
//
// Customers come from TWO sources: buyers who have actually ordered from
// this vendor, plus CRM-mapped VendorCustomer rows (which may include
// customers onboarded before their first order). Outlets are the outlets
// of those customers' business accounts — NOT the vendor's own outlets:
// the pricing resolver matches PriceListAssignment.outletId against the
// BUYER's active outlet, so vendor outlets would never match.
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.edit');
    const vendorId = await resolveVendorId(ctx, req);

    const [orderBuyers, crmCustomers, creditAccounts] = await Promise.all([
      prisma.order.findMany({
        where: { vendorId },
        select: {
          businessAccountId: true,
          userId: true,
          user: { select: { fullName: true, businessName: true, email: true } },
        },
        distinct: ['userId'],
      }),
      prisma.vendorCustomer.findMany({
        where: { vendorId },
        select: {
          userId: true,
          tags: true,
          user: {
            select: {
              fullName: true,
              businessName: true,
              email: true,
              userRoles: { select: { businessAccountId: true } },
            },
          },
        },
      }),
      prisma.creditWallet.findMany({
        where: { vendorId },
        select: { userId: true, status: true, workflowStatus: true },
      }),
    ]);

    const label = (u: { fullName: string | null; businessName: string | null; email: string | null }, id: string) =>
      u.businessName ?? u.fullName ?? u.email ?? id;

    const customers = new Map<string, { userId: string; label: string; creditStatus: string | null; pincodes: string[]; cities: string[]; tags: string[] }>();
    const accountIds = new Set<string>();

    const creditMap = new Map(
      creditAccounts.map((c) => [
        c.userId,
        c.status === 'BLACKLISTED' || c.status === 'BLOCKED'
          ? c.status.toLowerCase()
          : c.workflowStatus.toLowerCase(),
      ]),
    );

    for (const o of orderBuyers) {
      customers.set(o.userId, {
        userId: o.userId,
        label: label(o.user, o.userId),
        creditStatus: creditMap.get(o.userId) ?? null,
        pincodes: [],
        cities: [],
        tags: [],
      });
      accountIds.add(o.businessAccountId);
    }
    for (const c of crmCustomers) {
      const existing = customers.get(c.userId);
      if (!existing) {
        customers.set(c.userId, {
          userId: c.userId,
          label: label(c.user, c.userId),
          creditStatus: creditMap.get(c.userId) ?? null,
          pincodes: [],
          cities: [],
          tags: c.tags || [],
        });
      } else {
        existing.tags = Array.from(new Set([...existing.tags, ...(c.tags || [])]));
      }
      for (const r of c.user.userRoles) accountIds.add(r.businessAccountId);
    }

    const outlets = accountIds.size
      ? await prisma.outlet.findMany({
          where: { businessAccountId: { in: [...accountIds] }, isActive: true },
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            pincode: true,
            businessAccountId: true,
            businessAccount: { select: { id: true, displayName: true, legalName: true } },
          },
          orderBy: { name: 'asc' },
        })
      : [];

    // Associate pincodes and cities back to customers
    // Since B2B customer accounts have outlets, we can map outlets to their users/accounts
    const customersList = [...customers.values()];
    const userRoles = accountIds.size
      ? await prisma.userRole.findMany({
          where: { businessAccountId: { in: [...accountIds] } },
          select: { userId: true, businessAccountId: true },
        })
      : [];

    const accountToUsersMap = new Map<string, string[]>();
    for (const ur of userRoles) {
      const arr = accountToUsersMap.get(ur.businessAccountId) ?? [];
      arr.push(ur.userId);
      accountToUsersMap.set(ur.businessAccountId, arr);
    }

    for (const o of outlets) {
      const uIds = accountToUsersMap.get(o.businessAccountId) ?? [];
      for (const uId of uIds) {
        const cust = customers.get(uId);
        if (cust) {
          if (o.pincode) cust.pincodes.push(o.pincode);
          if (o.city) cust.cities.push(o.city);
        }
      }
    }

    const pincodes = [...new Set(outlets.map((o) => o.pincode).filter(Boolean))] as string[];
    const cities = [...new Set(outlets.map((o) => o.city).filter(Boolean))] as string[];
    const states = [...new Set(outlets.map((o) => o.state).filter(Boolean))] as string[];

    const segmentsSet = new Set<string>();
    for (const c of crmCustomers) {
      if (c.tags && Array.isArray(c.tags)) {
        for (const t of c.tags) {
          if (t) segmentsSet.add(t);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        customers: customersList.sort((a, b) => a.label.localeCompare(b.label)),
        outlets: outlets.map((o) => ({
          id: o.id,
          name: o.name,
          city: o.city,
          state: o.state,
          pincode: o.pincode,
          businessName: o.businessAccount.displayName ?? o.businessAccount.legalName,
        })),
        pincodes: pincodes.sort(),
        cities: cities.sort(),
        states: states.sort(),
        segments: [...segmentsSet].sort(),
        creditStatuses: ['pending', 'active', 'suspended', 'closed'],
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

