// GET  /api/v1/admin/vendors — List Online Stores (flat) or Suppliers hierarchy (?view=suppliers)
// POST /api/v1/admin/vendors — Admin creates a vendor/store directly (auto-verified)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { createDirectVendor, createDirectVendorSchema } from '@/modules/vendor/vendorOnboarding.service';

function storeLabel(v: { displayName: string | null; businessName: string }): string {
  return (v.displayName ?? v.businessName).trim() || v.businessName;
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  requirePermission(ctx, 'vendors.view');
  try {
    const params = req.nextUrl.searchParams;
    const view = params.get('view');
    const verified = params.has('verified') ? params.get('verified') === 'true' : undefined;
    const search = params.get('search') || undefined;
    const cursor = params.get('cursor') || undefined;
    const limit = Math.min(Number(params.get('limit')) || 20, 100);

    // ── Supplier → Business → Online Store hierarchy ─────────────────────
    if (view === 'suppliers') {
      const storeWhere: Record<string, unknown> = {};
      if (typeof verified === 'boolean') storeWhere.isVerified = verified;
      if (search) {
        storeWhere.OR = [
          { businessName: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
          { user: { fullName: { contains: search, mode: 'insensitive' } } },
          { user: { hcidDisplay: { contains: search, mode: 'insensitive' } } },
          { businessAccount: { legalName: { contains: search, mode: 'insensitive' } } },
          { businessAccount: { displayName: { contains: search, mode: 'insensitive' } } },
        ];
      }

      const stores = await prisma.vendor.findMany({
        where: storeWhere,
        take: Math.min(limit * 5, 500),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          businessName: true,
          displayName: true,
          slug: true,
          logoUrl: true,
          rating: true,
          isVerified: true,
          isActive: true,
          isPrimaryStore: true,
          createdAt: true,
          businessAccountId: true,
          userId: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              hcidDisplay: true,
            },
          },
          businessAccount: {
            select: {
              id: true,
              legalName: true,
              displayName: true,
              status: true,
            },
          },
          _count: {
            select: { products: true, orders: true },
          },
        },
      });

      type StoreRow = (typeof stores)[number];
      const bySupplier = new Map<string, {
        supplier: StoreRow['user'] & { userId: string };
        businesses: Map<string, {
          id: string;
          legalName: string;
          displayName: string | null;
          status: string;
          stores: Array<{
            id: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            rating: number;
            isVerified: boolean;
            isActive: boolean;
            isPrimaryStore: boolean;
            createdAt: string;
            productCount: number;
            orderCount: number;
          }>;
        }>;
        storeCount: number;
        verifiedCount: number;
      }>();

      for (const s of stores) {
        let group = bySupplier.get(s.userId);
        if (!group) {
          group = {
            supplier: { ...s.user, userId: s.userId },
            businesses: new Map(),
            storeCount: 0,
            verifiedCount: 0,
          };
          bySupplier.set(s.userId, group);
        }
        let biz = group.businesses.get(s.businessAccountId);
        if (!biz) {
          biz = {
            id: s.businessAccount.id,
            legalName: s.businessAccount.legalName,
            displayName: s.businessAccount.displayName,
            status: s.businessAccount.status,
            stores: [],
          };
          group.businesses.set(s.businessAccountId, biz);
        }
        biz.stores.push({
          id: s.id,
          name: storeLabel(s),
          slug: s.slug,
          logoUrl: s.logoUrl,
          rating: Number(s.rating),
          isVerified: s.isVerified,
          isActive: s.isActive,
          isPrimaryStore: s.isPrimaryStore,
          createdAt: s.createdAt.toISOString(),
          productCount: s._count.products,
          orderCount: s._count.orders,
        });
        group.storeCount += 1;
        if (s.isVerified) group.verifiedCount += 1;
      }

      const suppliers = Array.from(bySupplier.values()).map((g) => ({
        userId: g.supplier.userId,
        fullName: g.supplier.fullName,
        email: g.supplier.email,
        phone: g.supplier.phone,
        hcid: g.supplier.hcidDisplay,
        storeCount: g.storeCount,
        businessCount: g.businesses.size,
        verifiedCount: g.verifiedCount,
        businesses: Array.from(g.businesses.values()),
      }));

      return NextResponse.json({
        success: true,
        data: {
          view: 'suppliers',
          suppliers,
          nextCursor: null,
          hasMore: false,
        },
      });
    }

    // ── Flat Online Store list (legacy) ──────────────────────────────────
    const where: Record<string, unknown> = {};

    if (typeof verified === 'boolean') {
      where.isVerified = verified;
    }

    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const vendors = await prisma.vendor.findMany({
      where,
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        slug: true,
        logoUrl: true,
        rating: true,
        isVerified: true,
        isActive: true,
        creditEnabled: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
    });

    const hasMore = vendors.length > limit;
    if (hasMore) vendors.pop();

    const nextCursor = hasMore ? vendors[vendors.length - 1].id : null;

    return NextResponse.json({
      success: true,
      data: {
        vendors,
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'vendors.create');
    const body = await req.json();
    const input = createDirectVendorSchema.parse(body);
    const result = await createDirectVendor(input, ctx.userId);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
