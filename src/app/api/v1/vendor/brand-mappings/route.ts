// GET  /api/v1/vendor/brand-mappings — Vendor's own mappings, split by state.
//   Returns:
//     - unmapped:      products with NO live AND NO pending mapping (vendor must pick a brand SKU)
//     - pendingReview: products with one OR MORE auto-detected candidates awaiting confirm/reject;
//                      each row groups ALL candidates for the same product so the vendor can see
//                      every suggestion the auto-mapper produced (not just the latest one).
//     - mapped:        one row per LIVE mapping (auto_mapped or verified). A vendor product may
//                      appear more than once here if it's linked to multiple brand catalogs
//                      (e.g. private-label SKU listed under two distinct brand storefronts).
// POST /api/v1/vendor/brand-mappings — Vendor manually links one of their products to a brand SKU.
//   BODY: { distributorProductId, brandMasterProductId }
// REQUIRES: role=vendor (or admin), products:write permission for POST

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { resolveVendorContext } from '@/lib/resolveVendorId';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import { getApprovedDistributorKeys, approvedDistributorWhere } from '@/lib/brandAuthorizedDistributor';
import type { AuthContext } from '@/middleware/auth';

const createMappingSchema = z.object({
  distributorProductId: z.string().uuid(),
  brandMasterProductId: z.string().uuid(),
});

export const GET = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    const view = req.nextUrl.searchParams.get('view');
    const brandFilter = req.nextUrl.searchParams.get('brandId') ?? undefined;

    const distributorAuths = await prisma.brandAuthorizedDistributor.findMany({
      where: { vendorId },
      select: { brandId: true, status: true, brandApprovedAt: true },
    });
    const approvedKeys = await getApprovedDistributorKeys({ vendorId });
    const approvedBrandIds = [...approvedKeys].map((k) => k.split(':')[0]);

    if (approvedBrandIds.length === 0) {
      if (view === 'table') {
        return NextResponse.json({
          success: true,
          data: { rows: [], brands: [], distributorAuths, hasAuthorizedBrands: false },
        });
      }
      return NextResponse.json({
        success: true,
        data: { unmapped: [], pendingReview: [], mapped: [], hasAuthorizedBrands: false },
      });
    }

    const approvedBrandSet = new Set(approvedBrandIds);
    const authByBrand = new Map(distributorAuths.map((a) => [a.brandId, a.status]));

    const products = await prisma.product.findMany({
      where: { vendorId, isActive: true, approvalStatus: 'approved' },
      select: {
        id: true, name: true, brand: true, packSize: true, imageUrl: true, basePrice: true,
        brandMappings: {
          where: { status: { in: ['auto_mapped', 'verified', 'pending_review'] } },
          include: {
            brandMasterProduct: {
              select: {
                id: true, name: true, packSize: true, imageUrl: true, sku: true,
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
      const brandMappings = p.brandMappings.filter((m) => approvedBrandSet.has(m.brandId ?? m.brandMasterProduct.brand.id));
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
        basePrice: number;
        brandId: string | null;
        brandName: string | null;
        brandMasterProductId: string | null;
        brandItemName: string | null;
        brandPackSize: string | null;
        brandSku: string | null;
        mappingId: string | null;
        mappingStatus: 'mapped' | 'pending' | 'unmapped';
        linkStatus: 'auto_mapped' | 'verified' | 'pending_review' | null;
        distributorAuthStatus: 'pending' | 'approved' | 'rejected' | null;
      };

      const rows: TableRow[] = [];

      for (const p of products) {
        const brandMappings = p.brandMappings.filter((m) => approvedBrandSet.has(m.brandMasterProduct.brand.id));
        const liveMappings = brandMappings.filter(
          (m) => m.status === 'auto_mapped' || m.status === 'verified',
        );
        const pendingMappings = brandMappings.filter((m) => m.status === 'pending_review');

        if (liveMappings.length > 0) {
          for (const m of liveMappings) {
            if (brandFilter && m.brandMasterProduct.brand.id !== brandFilter) continue;
            rows.push({
              productId: p.id,
              distributorProductName: p.name,
              distributorPackSize: p.packSize,
              distributorImage: p.imageUrl,
              basePrice: Number(p.basePrice),
              brandId: m.brandMasterProduct.brand.id,
              brandName: m.brandMasterProduct.brand.name,
              brandMasterProductId: m.brandMasterProduct.id,
              brandItemName: m.brandMasterProduct.name,
              brandPackSize: m.brandMasterProduct.packSize,
              brandSku: m.brandMasterProduct.sku,
              mappingId: m.id,
              mappingStatus: 'mapped',
              linkStatus: m.status as 'auto_mapped' | 'verified',
              distributorAuthStatus: authByBrand.get(m.brandMasterProduct.brand.id) ?? null,
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
              basePrice: Number(p.basePrice),
              brandId: pending.brandMasterProduct.brand.id,
              brandName: pending.brandMasterProduct.brand.name,
              brandMasterProductId: pending.brandMasterProduct.id,
              brandItemName: pending.brandMasterProduct.name,
              brandPackSize: pending.brandMasterProduct.packSize,
              brandSku: pending.brandMasterProduct.sku,
              mappingId: pending.id,
              mappingStatus: 'pending',
              linkStatus: 'pending_review',
              distributorAuthStatus: authByBrand.get(pending.brandMasterProduct.brand.id) ?? null,
            });
          }
        }

        if (liveMappings.length === 0 && pendingMappings.length === 0) {
          rows.push({
            productId: p.id,
            distributorProductName: p.name,
            distributorPackSize: p.packSize,
            distributorImage: p.imageUrl,
            basePrice: Number(p.basePrice),
            brandId: null,
            brandName: null,
            brandMasterProductId: null,
            brandItemName: null,
            brandPackSize: null,
            brandSku: null,
            mappingId: null,
            mappingStatus: 'unmapped',
            linkStatus: null,
            distributorAuthStatus: null,
          });
        }
      }

      const brands = await prisma.brand.findMany({
        where: {
          id: { in: approvedBrandIds },
          isActive: true,
          approvalStatus: 'approved',
        },
        select: { id: true, name: true, slug: true, logoUrl: true },
        orderBy: { name: 'asc' },
      });

      return NextResponse.json({
        success: true,
        data: { rows, brands, distributorAuths, hasAuthorizedBrands: true },
      });
    }

    return NextResponse.json({
      success: true,
      data: { unmapped, pendingReview, mapped },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = vendorOnly(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const { vendorId } = await resolveVendorContext(ctx, req);
    requirePermission(ctx, 'products.edit');

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

    const auth = await prisma.brandAuthorizedDistributor.findFirst({
      where: approvedDistributorWhere({ brandId: masterProduct.brandId, vendorId }),
      select: { status: true },
    });
    if (!auth) {
      throw Errors.forbidden('Your vendor is not an authorized distributor for this brand');
    }

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
