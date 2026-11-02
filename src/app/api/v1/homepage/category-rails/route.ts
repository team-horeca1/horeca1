// GET /api/v1/homepage/category-rails — Batched aisle rails for homepage
// PUBLIC. ?pincode=&parentId=
// Base catalog is Redis-cached; contract prices applied after the cache hit.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { errorResponse } from '@/middleware/errorHandler';
import { attachCustomerPricing } from '@/modules/pricing/catalog-pricing';
import {
  collectRailListings,
  getHomepageCategoryRails,
  remapRailsOffers,
  type HomepageRailListing,
} from '@/modules/catalog/homepage-rails.service';

const GUEST_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=120';
const AUTH_CACHE_CONTROL = 'private, no-store';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const pincodeRaw = searchParams.get('pincode')?.trim();
    const pincode =
      pincodeRaw && /^\d{6}$/.test(pincodeRaw) ? pincodeRaw : undefined;
    const parentId = searchParams.get('parentId')?.trim() || undefined;

    const payload = await getHomepageCategoryRails({ pincode, parentId });

    const session = await auth();
    const isLoggedIn = Boolean(session?.user?.id);

    let rails = payload.rails;
    if (isLoggedIn && rails.length > 0) {
      const listings = collectRailListings(rails);
      const priced = (await attachCustomerPricing(
        listings,
      )) as HomepageRailListing[];
      const byId = new Map(priced.map((p) => [p.id, p]));
      rails = remapRailsOffers(rails, byId);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          rails,
          tabs: payload.tabs,
          noVendorsForPincode: payload.noVendorsForPincode,
        },
      },
      {
        headers: {
          'Cache-Control': isLoggedIn ? AUTH_CACHE_CONTROL : GUEST_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
