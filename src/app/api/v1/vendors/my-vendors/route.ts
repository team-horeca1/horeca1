// GET /api/v1/vendors/my-vendors — List vendors the current user follows
// WHY: "My Vendors" section shows vendors the customer has ordered from or favorited
//      This is key for repeat ordering — most B2B customers order from the same 3-5 vendors
// PROTECTED: Must be logged in

import { NextResponse } from 'next/server';
import { VendorService } from '@/modules/vendor/vendor.service';
import { withAuth } from '@/middleware/auth';
import { effectiveCustomerUserId } from '@/lib/resolveCustomerImpersonation';

const vendorService = new VendorService();

export const GET = withAuth(async (_req, ctx) => {
  const vendors = await vendorService.getMyVendors(effectiveCustomerUserId(ctx));
  return NextResponse.json({ success: true, data: vendors });
});
