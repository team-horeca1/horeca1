// GET /api/v1/categories — List all product categories
// WHY: Homepage category grid, sidebar filters, and category browsing pages need this
//      Returns hierarchical categories (parent + children) sorted by display order
// PUBLIC: No login needed
// SUPPORTS: ?parentId=xxx (to get subcategories of a specific parent)

import { NextRequest, NextResponse } from 'next/server';
import { CatalogService, resolveCategoriesForPicker } from '@/modules/catalog/catalog.service';
import { getCachedCategoryTree } from '@/lib/catalogCache';
import { errorResponse } from '@/middleware/errorHandler';

const catalogService = new CatalogService();

const TREE_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=600';

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const resolveIds = params
      .get('resolveIds')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);

    if (resolveIds && resolveIds.length > 0) {
      const data = await resolveCategoriesForPicker(resolveIds);
      return NextResponse.json({ success: true, data });
    }

    const parentId = params.get('parentId') || undefined;

    // Full approved tree is shared across all visitors — serve from Redis.
    if (!parentId) {
      const categories = await getCachedCategoryTree();
      return NextResponse.json(
        { success: true, data: categories },
        { headers: { 'Cache-Control': TREE_CACHE_CONTROL } },
      );
    }

    const categories = await catalogService.getCategories(parentId);
    return NextResponse.json(
      { success: true, data: categories },
      { headers: { 'Cache-Control': TREE_CACHE_CONTROL } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
