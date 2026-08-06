// GET  /api/v1/vendor/brand-mappings — Vendor's own mappings, split by state.
//   Returns:
//     - unmapped:      products with NO live AND NO pending mapping (vendor must pick a brand SKU)
//     - pendingReview: products with one OR MORE auto-detected candidates awaiting confirm/reject;
//                      each row groups ALL candidates for the same product so the vendor can see
//                      every suggestion the auto-mapper produced (not just the latest one).
//     - mapped:        one row per LIVE mapping (auto_mapped or verified). A vendor product may
//                      appear more than once here if it's linked to multiple brand catalogs
//                      (e.g. private-label SKU listed under two distinct brand storefronts).
//   view=stores: brand-store index — every active+approved brand with authStatus,
//                catalogSize, and mappedCount (distinct live-mapped brand SKUs for this vendor).
//   view=table:  also returns every active+approved brand with per-brand authStatus
//                (none | pending | approved | rejected) — vendors can browse any brand catalog.
// POST /api/v1/vendor/brand-mappings — Vendor manually links one of their products to a brand SKU.
//   BODY: { distributorProductId, brandMasterProductId }
//   First mapping to a brand upserts a pending BrandAuthorizedDistributor request.
// REQUIRES: role=vendor (or admin), products:write permission for POST

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { ensurePendingDistributorAuth, healRejectedDistributorsWithLiveMappings } from '@/lib/brandAuthorizedDistributor';
import type { AuthContext } from '@/middleware/auth';
import type { BrandAuthorizedDistributorStatus } from '@prisma/client';

const createMappingSchema = z.object({
  distributorProductId: z.string().uuid(),
  brandMasterProductId: z.string().uuid(),
});

type AuthStatus = 'none' | BrandAuthorizedDistributorStatus;

export const GET = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    requirePermission(ctx, 'brandMappings.view');
    const { vendorId } = await resolveVendorContext(ctx, req);
    const view = req.nextUrl.searchParams.get('view');
    const brandFilter = req.nextUrl.searchParams.get('brandId') ?? undefined;

    // Rejected + live mappings → pending (badge / Requests stay consistent)
    await healRejectedDistributorsWithLiveMappings({ vendorId });

    const distributorAuths = await prisma.brandAuthorizedDistributor.findMany({
      where: { vendorId },
      select: { brandId: true, status: true, brandApprovedAt: true },
    });
    const authByBrand = new Map(distributorAuths.map((a) => [a.brandId, a.status]));
    const authStatusFor = (brandId: string): AuthStatus => authByBrand.get(brandId) ?? 'none';
    const hasAuthorizedBrands = distributorAuths.some((a) => a.status === 'approved');

    // Brand-store index: lightweight brand cards with catalog + mapped counts.
    if (view === 'stores') {
      const brandRows = await prisma.brand.findMany({
        where: { isActive: true, approvalStatus: 'approved' },
        select: { id: true, name: true, slug: true, logoUrl: true },
        orderBy: { name: 'asc' },
      });

      const brandIds = brandRows.map((b) => b.id);

      const [catalogGroups, liveMappings] = await Promise.all([
        brandIds.length === 0
          ? Promise.resolve([] as Array<{ brandId: string; _count: { _all: number } }>)
          : prisma.brandMasterProduct.groupBy({
              by: ['brandId'],
              where: { brandId: { in: brandIds }, isActive: true },
              _count: { _all: true },
            }),
        brandIds.length === 0
          ? Promise.resolve([] as Array<{ brandId: string; brandMasterProductId: string }>)
          : prisma.brandProductMapping.findMany({
              where: {
                brandId: { in: brandIds },
                status: { in: ['auto_mapped', 'verified'] },
                distributorProduct: { vendorId },
              },
              select: { brandId: true, brandMasterProductId: true },
            }),
      ]);

      const catalogByBrand = new Map(catalogGroups.map((g) => [g.brandId, g._count._all]));
      const mappedByBrand = new Map<string, Set<string>>();
      for (const m of liveMappings) {
        let set = mappedByBrand.get(m.brandId);
        if (!set) {
          set = new Set();
          mappedByBrand.set(m.brandId, set);
        }
        set.add(m.brandMasterProductId);
      }

      const brands = brandRows.map((b) => ({
        ...b,
        authStatus: authStatusFor(b.id),
        catalogSize: catalogByBrand.get(b.id) ?? 0,
        mappedCount: mappedByBrand.get(b.id)?.size ?? 0,
      }));

      return NextResponse.json({
        success: true,
        data: { brands, hasAuthorizedBrands },
      });
    }

    const products = await prisma.product.findMany({
      where: { vendorId, isActive: true, approvalStatus: 'approved' },
      select: {
        id: true, name: true, brand: true, packSize: true, imageUrl: true, basePrice: true,
        category: { select: { id: true, name: true } },
        brandMappings: {
          where: { status: { in: ['auto_mapped', 'verified', 'pending_review'] } },
          include: {
            brandMasterProduct: {
              select: {
                id: true, name: true, packSize: true, imageUrl: true, sku: true, category: true,
                categoryRel: { select: { id: true, name: true } },
                brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
              },
            },
          },
          orderBy: { confidenceScore: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    type Suggestion = {
      mappingId: string;
      confidenceScore: number;
      brandMasterProduct: {
        id: string; name: string; packSize: string | null; imageUrl: string | null; sku: string | null;
        brand: { id: string; name: string; slug: string; logoUrl: string | null };
      };
    };

    const unmapped: Array<{ productId: string; name: string; brand: string | null; packSize: string | null; imageUrl: string | null; basePrice: number }> = [];
    const pendingReview: Array<{
      productId: string; productName: string; productImage: string | null;
      brand: string | null; packSize: string | null; basePrice: number;
      suggestions: Suggestion[];
    }> = [];
    const mapped: Array<{
      mappingId: string; productId: string; productName: string; productImage: string | null;
      status: 'auto_mapped' | 'verified'; confidenceScore: number;
      brandMasterProduct: Suggestion['brandMasterProduct'];
    }> = [];

    for (const p of products) {
      const brandMappings = p.brandMappings;
      const liveMappings = brandMappings.filter(m => m.status === 'auto_mapped' || m.status === 'verified');
      const pendingMappings = brandMappings.filter(m => m.status === 'pending_review');

      // Each LIVE mapping = its own row (a vendor product can legitimately appear under
      // multiple brand storefronts; the vendor needs per-link controls).
      for (const m of liveMappings) {
        mapped.push({
          mappingId: m.id,
          productId: p.id,
          productName: p.name,
          productImage: p.imageUrl,
          status: m.status as 'auto_mapped' | 'verified',
          confidenceScore: Number(m.confidenceScore),
          brandMasterProduct: m.brandMasterProduct,
        });
      }

      // Pending suggestions: ONE row per product, with ALL candidates nested. Vendor picks one
      // (or none). Sorted highest-confidence first so the most likely match leads.
      if (pendingMappings.length > 0) {
        pendingReview.push({
          productId: p.id,
          productName: p.name,
          productImage: p.imageUrl,
          brand: p.brand,
          packSize: p.packSize,
          basePrice: Number(p.basePrice),
          suggestions: pendingMappings.map(m => ({
            mappingId: m.id,
            confidenceScore: Number(m.confidenceScore),
            brandMasterProduct: m.brandMasterProduct,
          })),
        });
      }

      // Unmapped: nothing live, nothing pending — vendor needs to manually pick a brand SKU.
      if (liveMappings.length === 0 && pendingMappings.length === 0) {
        unmapped.push({
          productId: p.id,
          name: p.name,
          brand: p.brand,
          packSize: p.packSize,
          imageUrl: p.imageUrl,
          basePrice: Number(p.basePrice),
        });
      }
    }

    if (view === 'table') {
      type TableRow = {
        productId: string;
        distributorProductName: string;
        distributorPackSize: string | null;
        distributorImage: string | null;
        distributorCategory: string | null;
        basePrice: number;
        brandId: string | null;
        brandName: string | null;
        brandMasterProductId: string | null;
        brandItemName: string | null;
        brandPackSize: string | null;
        brandSku: string | null;
        brandImage: string | null;
        brandCategory: string | null;
        mappingId: string | null;
        mappingStatus: 'mapped' | 'pending' | 'unmapped';
        linkStatus: 'auto_mapped' | 'verified' | 'pending_review' | null;
        distributorAuthStatus: AuthStatus;
      };

      const brandCategoryLabel = (m: {
        category: string | null;
        categoryRel: { name: string } | null;
      }) => m.categoryRel?.name ?? m.category ?? null;

      const rows: TableRow[] = [];

      for (const p of products) {
        const brandMappings = p.brandMappings;
        const liveMappings = brandMappings.filter(
          (m) => m.status === 'auto_mapped' || m.status === 'verified',
        );
        const pendingMappings = brandMappings.filter((m) => m.status === 'pending_review');
        const distributorCategory = p.category?.name ?? null;

        if (liveMappings.length > 0) {
          for (const m of liveMappings) {
            if (brandFilter && m.brandMasterProduct.brand.id !== brandFilter) continue;
            rows.push({
              productId: p.id,
              distributorProductName: p.name,
              distributorPackSize: p.packSize,
              distributorImage: p.imageUrl,
              distributorCategory,
              basePrice: Number(p.basePrice),
              brandId: m.brandMasterProduct.brand.id,
              brandName: m.brandMasterProduct.brand.name,
              brandMasterProductId: m.brandMasterProduct.id,
              brandItemName: m.brandMasterProduct.name,
              brandPackSize: m.brandMasterProduct.packSize,
              brandSku: m.brandMasterProduct.sku,
              brandImage: m.brandMasterProduct.imageUrl,
              brandCategory: brandCategoryLabel(m.brandMasterProduct),
              mappingId: m.id,
              mappingStatus: 'mapped',
              linkStatus: m.status as 'auto_mapped' | 'verified',
              distributorAuthStatus: authStatusFor(m.brandMasterProduct.brand.id),
            });
          }
        }

        if (pendingMappings.length > 0) {
          for (const pending of pendingMappings) {
            if (brandFilter && pending.brandMasterProduct.brand.id !== brandFilter) continue;
            const alreadyLive = liveMappings.some(
              (m) => m.brandMasterProduct.brand.id === pending.brandMasterProduct.brand.id,
            );
            if (alreadyLive) continue;
            rows.push({
              productId: p.id,
              distributorProductName: p.name,
              distributorPackSize: p.packSize,
              distributorImage: p.imageUrl,
              distributorCategory,
              basePrice: Number(p.basePrice),
              brandId: pending.brandMasterProduct.brand.id,
              brandName: pending.brandMasterProduct.brand.name,
              brandMasterProductId: pending.brandMasterProduct.id,
              brandItemName: pending.brandMasterProduct.name,
              brandPackSize: pending.brandMasterProduct.packSize,
              brandSku: pending.brandMasterProduct.sku,
              brandImage: pending.brandMasterProduct.imageUrl,
              brandCategory: brandCategoryLabel(pending.brandMasterProduct),
              mappingId: pending.id,
              mappingStatus: 'pending',
              linkStatus: 'pending_review',
              distributorAuthStatus: authStatusFor(pending.brandMasterProduct.brand.id),
            });
          }
        }

        if (liveMappings.length === 0 && pendingMappings.length === 0) {
          rows.push({
            productId: p.id,
            distributorProductName: p.name,
            distributorPackSize: p.packSize,
            distributorImage: p.imageUrl,
            distributorCategory,
            basePrice: Number(p.basePrice),
            brandId: null,
            brandName: null,
            brandMasterProductId: null,
            brandItemName: null,
            brandPackSize: null,
            brandSku: null,
            brandImage: null,
            brandCategory: null,
            mappingId: null,
            mappingStatus: 'unmapped',
            linkStatus: null,
            distributorAuthStatus: brandFilter ? authStatusFor(brandFilter) : 'none',
          });
        }
      }

      const brandRows = await prisma.brand.findMany({
        where: {
          isActive: true,
          approvalStatus: 'approved',
        },
        select: { id: true, name: true, slug: true, logoUrl: true },
        orderBy: { name: 'asc' },
      });

      const brands = brandRows.map((b) => ({
        ...b,
        authStatus: authStatusFor(b.id),
      }));

      return NextResponse.json({
        success: true,
        data: { rows, brands, distributorAuths, hasAuthorizedBrands },
      });
    }

    return NextResponse.json({
      success: true,
      data: { unmapped, pendingReview, mapped, hasAuthorizedBrands },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'brandMappings.create');

    const body = await req.json();
    const { distributorProductId, brandMasterProductId } = createMappingSchema.parse(body);

    // Guard: distributor product must belong to caller's vendor (IDOR check)
    const product = await prisma.product.findFirst({
      where: { id: distributorProductId, vendorId },
      select: { id: true, name: true },
    });
    if (!product) throw Errors.notFound('Product not found in your inventory');

    // Brand master product must exist + be active + brand approved
    const masterProduct = await prisma.brandMasterProduct.findFirst({
      where: { id: brandMasterProductId, isActive: true, brand: { isActive: true, approvalStatus: 'approved' } },
      select: { id: true, brandId: true, name: true, brand: { select: { name: true } } },
    });
    if (!masterProduct) throw Errors.notFound('Brand master product not found');

    // First mapping raises a pending distributor request on the brand's side
    await ensurePendingDistributorAuth(masterProduct.brandId, vendorId);

    const mapping = await prisma.brandProductMapping.upsert({
      where: {
        brandMasterProductId_distributorProductId: {
          brandMasterProductId,
          distributorProductId,
        },
      },
      create: {
        brandId: masterProduct.brandId,
        brandMasterProductId,
        distributorProductId,
        confidenceScore: 1.0,
        status: 'verified',
        matchedBy: 'manually_verified',
        reviewedBy: ctx.userId,
      },
      update: {
        status: 'verified',
        matchedBy: 'manually_verified',
        confidenceScore: 1.0,
        reviewedBy: ctx.userId,
        reviewNote: null,
        updatedAt: new Date(),
      },
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.brandMappingVerified,
      entity: 'BrandProductMapping',
      entityId: mapping.id,
      metadata: {
        distributorProductId,
        brandMasterProductId,
        brandName: masterProduct.brand.name,
        masterName: masterProduct.name,
        actor: 'vendor',
      },
    });

    return NextResponse.json({ success: true, data: mapping }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
