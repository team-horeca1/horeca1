// GET /api/v1/admin/approvals/summary — Return pending approval counts
// WHY: Admin dashboard badge counts — shows how many vendors, products, and
//      categories are awaiting review so admin knows what needs attention.
// PROTECTED: Admin only

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse } from '@/middleware/errorHandler';
import { requireAnyPermissionInline } from '@/lib/permissions/engine';

// GET — pending counts for vendors, products, and categories
export const GET = adminOnly(async (_req, ctx) => {
  try {
    requireAnyPermissionInline(ctx, 'vendors.approve', 'brands.approve', 'products.approve');
    const [pendingVendors, pendingVendorProducts, pendingMasterProducts, pendingEditProducts, pendingCategories, pendingBrands] = await Promise.all([
      prisma.vendor.count({ where: { isVerified: false } }),
      prisma.product.count({ where: { approvalStatus: 'pending' } }),
      prisma.masterProduct.count({ where: { approvalStatus: 'pending' } }),
      prisma.product.count({ where: { approvalStatus: 'pending_edit' } }),
      prisma.category.count({ where: { approvalStatus: 'pending' } }),
      prisma.brand.count({ where: { approvalStatus: 'pending' } }),
    ]);

    const pendingProducts = pendingVendorProducts + pendingMasterProducts + pendingEditProducts;

    return NextResponse.json({
      success: true,
      data: { pendingVendors, pendingProducts, pendingCategories, pendingBrands },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
