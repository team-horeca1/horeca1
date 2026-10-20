import { resolveImportImageUrl } from '@/modules/import-export/excel.service';
import type { ParsedProductRow } from '@/modules/import-export/excel.service';
import { isNaInput } from '@/lib/productNa';

/** Reject parent-only category assignments (Zoho requires a leaf sub-category). */
export function validateImportCategoryColumns(row: {
  parentCategory?: string;
  subCategory?: string;
  legacyCategory?: string;
}): void {
  const parent = row.parentCategory?.trim();
  const sub = row.subCategory?.trim();
  const legacy = row.legacyCategory?.trim();
  if (parent && !sub && !legacy) {
    throw new Error('Sub-category required when parent category is provided.');
  }
}

/** Resolve final image URL from row fields (URL or filename). */
export function resolveRowImageUrl(row: ParsedProductRow): string | undefined {
  return resolveImportImageUrl(row.imageUrl, row.imageName);
}

/** Stamp system IDs into import metadata (Vendor ID = vendorCode, Item ID = product UUID). */
export function enrichImportMetadata(
  metadata: Record<string, unknown> | undefined,
  vendorCode: string | null | undefined,
  productId: string,
): Record<string, unknown> {
  const base = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  return {
    ...base,
    vendorId: vendorCode || base.vendorId || undefined,
    itemId: productId,
  };
}

/** Deep-merge nested metadata section-by-section; blank incoming values preserve base. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mergeMetadata(base: unknown, incoming: Record<string, any>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = (base && typeof base === 'object' ? base : {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = { ...b };
  for (const section of Object.keys(incoming)) {
    const inc = incoming[section] ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: Record<string, any> = { ...(b[section] ?? {}) };
    for (const k of Object.keys(inc)) {
      const v = inc[k];
      if (v !== undefined && v !== null && v !== '') merged[k] = v;
    }
    result[section] = merged;
  }
  // Top-level vendorId/itemId from incoming when present
  if (incoming.vendorId) result.vendorId = incoming.vendorId;
  if (incoming.itemId) result.itemId = incoming.itemId;
  return result;
}

export function normalizedVegForDb(veg?: string | null): 'veg' | 'nonveg' | 'egg' | null | undefined {
  if (!veg) return undefined;
  if (veg === 'veg' || veg === 'nonveg' || veg === 'egg') return veg;
  // "NA" (any spelling) is stored as null so an update row clears the old value.
  if (isNaInput(veg)) return null;
  return undefined;
}
