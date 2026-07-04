/**
 * Vendor profile constants — seeded from Profile Mastersheet CSV attribute master (rows 72–83).
 * Single source for cascading Vendor Type → Sub-Type → Categories Handled dropdowns.
 */

export const BUSINESS_SIZES = ['Small', 'Medium', 'Large', 'Enterprise'] as const;

export const COVERAGE_OPTIONS = [
  'Local Area',
  'Local Market',
  'Citywide',
  'Mumbai',
  'Maharashtra',
  'Regional',
  'Gujarat',
  'Pan India',
  'National',
] as const;

export const MONTHLY_SUPPLY_BANDS = ['Low', 'Medium', 'High'] as const;

export const VENDOR_LEAD_STATUSES = ['Lead', 'Contacted', 'Active'] as const;

/** CSV-aligned vendor types (Level 2). Replaces legacy platform enum for new onboarding. */
export const VENDOR_BUSINESS_TYPES = [
  'Distributor',
  'Wholesaler',
  'Sub Distributor',
  'Importer',
  'Manufacturer',
  'Trader',
  'Packaging Supplier',
] as const;

export type VendorBusinessType = (typeof VENDOR_BUSINESS_TYPES)[number];

/** Sub-types keyed by vendor type (Level 3). */
export const SUB_TYPES_BY_TYPE: Record<string, readonly string[]> = {
  Distributor: ['HoReCa Distributor', 'Multi-Category Distributor', 'FMCG Distributor'],
  Wholesaler: ['Fruits & Vegetables', 'Dry Fruits & Spices', 'Frozen Foods'],
  'Sub Distributor': ['FMCG'],
  Importer: ['Specialty Foods'],
  Manufacturer: ['Sauces & Condiments', 'Bakery Ingredients'],
  Trader: ['Commodity Trader'],
  'Packaging Supplier': ['Food Packaging'],
};

/** Category presets keyed by "VendorType|SubType" (Level 4). */
export const CATEGORIES_BY_SUBTYPE: Record<string, readonly string[]> = {
  'Distributor|HoReCa Distributor': ['Foodservice Specialist', 'Frozen + Dairy', 'Frozen Foods'],
  'Distributor|Multi-Category Distributor': ['HoReCa + GT', 'Multi-Category'],
  'Distributor|FMCG Distributor': ['Modern Trade', 'GT + Modern Trade'],
  'Wholesaler|Fruits & Vegetables': ['Fresh Produce'],
  'Wholesaler|Dry Fruits & Spices': ['Bulk Trader', 'Dry Fruits', 'Spices'],
  'Wholesaler|Frozen Foods': ['Cold Chain', 'Frozen Foods'],
  'Sub Distributor|FMCG': ['Last Mile Distributor', 'FMCG'],
  'Importer|Specialty Foods': ['Japanese Imports', 'Seafood + Japanese', 'Specialty Foods'],
  'Manufacturer|Sauces & Condiments': ['Factory Direct', 'Sauces & Condiments'],
  'Manufacturer|Bakery Ingredients': ['Commercial Supply', 'Bakery + Desserts', 'Bakery Ingredients'],
  'Trader|Commodity Trader': ['Sugar/Flour', 'Commodity Trading'],
  'Packaging Supplier|Food Packaging': ['Disposable Products', 'Food Packaging'],
};

/** Legacy platform vendorType values → CSV-aligned VENDOR_BUSINESS_TYPES. */
export const LEGACY_VENDOR_TYPE_MAP: Record<string, VendorBusinessType | null> = {
  distributor: 'Distributor',
  wholesaler: 'Wholesaler',
  manufacturer: 'Manufacturer',
  brand_store: null,
  dark_store: null,
};

/** Slug values stored in Vendor.vendorType for new onboarding (CSV-aligned). */
export const VENDOR_TYPE_SLUGS: Record<VendorBusinessType, string> = {
  Distributor: 'distributor',
  Wholesaler: 'wholesaler',
  'Sub Distributor': 'sub_distributor',
  Importer: 'importer',
  Manufacturer: 'manufacturer',
  Trader: 'trader',
  'Packaging Supplier': 'packaging_supplier',
};

export function subTypesForVendorType(vendorType: string): readonly string[] {
  return SUB_TYPES_BY_TYPE[vendorType] ?? [];
}

export function categoriesForSubType(vendorType: string, subType: string): readonly string[] {
  return CATEGORIES_BY_SUBTYPE[`${vendorType}|${subType}`] ?? [];
}

export function slugForVendorType(vendorType: string): string | undefined {
  if (vendorType in VENDOR_TYPE_SLUGS) {
    return VENDOR_TYPE_SLUGS[vendorType as VendorBusinessType];
  }
  return undefined;
}

/** One vendor type row with multi-select sub-types (onboarding matrix). */
export type VendorTypeSelection = {
  type: VendorBusinessType;
  slug: string;
  subTypes: string[];
};

export function normalizeVendorTypeSelections(
  raw: unknown,
): VendorTypeSelection[] {
  if (!Array.isArray(raw)) return [];
  const out: VendorTypeSelection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const type = String(rec.type ?? '').trim();
    const slug = String(rec.slug ?? slugForVendorType(type) ?? '').trim();
    const subTypes = Array.isArray(rec.subTypes)
      ? rec.subTypes.map((s) => String(s).trim()).filter(Boolean)
      : [];
    if (!type || !(VENDOR_BUSINESS_TYPES as readonly string[]).includes(type)) continue;
    if (subTypes.length === 0) continue;
    const allowed = subTypesForVendorType(type);
    const validSubs = subTypes.filter((s) => allowed.includes(s));
    if (validSubs.length === 0) continue;
    out.push({ type: type as VendorBusinessType, slug: slug || slugForVendorType(type)!, subTypes: validSubs });
  }
  return out;
}

/** Build selections from legacy single type + subType fields. */
export function legacyToVendorTypeSelections(
  vendorBusinessType: string | undefined | null,
  vendorType: string | undefined | null,
  subType: string | undefined | null,
): VendorTypeSelection[] {
  const display = vendorBusinessType?.trim()
    || (vendorType
      ? (VENDOR_BUSINESS_TYPES as readonly string[]).find(
          (t) => slugForVendorType(t as VendorBusinessType) === vendorType,
        )
      : undefined);
  if (!display) return [];
  const st = (subType ?? '').trim();
  if (!st) return [];
  return [{
    type: display as VendorBusinessType,
    slug: slugForVendorType(display as VendorBusinessType) ?? vendorType ?? display,
    subTypes: [st],
  }];
}

/** Primary legacy scalar fields from first selection row. */
export function legacyScalarsFromSelections(
  selections: VendorTypeSelection[],
): { vendorBusinessType: string; vendorType: string; subType: string } | null {
  const first = selections[0];
  if (!first) return null;
  return {
    vendorBusinessType: first.type,
    vendorType: first.slug,
    subType: first.subTypes[0] ?? '',
  };
}

/** Human-readable summary for admin display. */
export function formatVendorTypeSelections(selections: VendorTypeSelection[]): string {
  if (!selections.length) return '';
  return selections
    .map((s) => {
      const subs = s.subTypes.join(', ');
      return subs ? `${s.type} (${subs})` : s.type;
    })
    .join(' · ');
}

/** Union of category presets across all selected type|subType pairs. */
export function categoryPresetsForSelections(selections: VendorTypeSelection[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of selections) {
    for (const st of s.subTypes) {
      for (const cat of categoriesForSubType(s.type, st)) {
        if (!seen.has(cat)) {
          seen.add(cat);
          out.push(cat);
        }
      }
    }
  }
  return out;
}
