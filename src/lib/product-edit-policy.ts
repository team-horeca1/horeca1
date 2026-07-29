/**
 * Product edit policy — material vs non-material field classification.
 * Material changes on approved listings queue as pending_edit; non-material apply live.
 *
 * Approval gate (vendor edits on live listings):
 * - New products → pending (handled at create, not here)
 * - Image changes → pending_edit (wrong media / adult content risk)
 * - Everything else (veg/nonveg, name, brand, HSN, pack, unit, category, …) → live
 */

export const MATERIAL_PRODUCT_FIELDS = ['imageUrl', 'images'] as const;

export const NON_MATERIAL_PRODUCT_FIELDS = [
  'brand',
  'name',
  'hsn',
  'packSize',
  'unit',
  'vegNonVeg',
  'masterProductId',
  'basePrice',
  'originalPrice',
  'taxPercent',
  'description',
  'aliasNames',
  'minOrderQty',
  'promoPrice',
  'promoStartTime',
  'promoEndTime',
  'storageType',
  'barcode',
  'tags',
  'fssaiRef',
  'shelfLifeDays',
  'countryOfOrigin',
  'creditEligible',
  'isFeatured',
] as const;

export type MaterialProductField = (typeof MATERIAL_PRODUCT_FIELDS)[number];
export type NonMaterialProductField = (typeof NON_MATERIAL_PRODUCT_FIELDS)[number];

/** Levenshtein distance — kept for callers / historical typo tooling. */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Name-only typo: distance ≤ 30% of original length. */
export function isMinorNameChange(oldName: string, newName: string): boolean {
  const old = oldName.trim();
  const next = newName.trim();
  if (old === next) return true;
  if (!old || !next) return false;
  const dist = levenshteinDistance(old.toLowerCase(), next.toLowerCase());
  return dist <= Math.ceil(old.length * 0.3);
}

/**
 * Queued pending-edit shape. Image fields are the only ones newly queued;
 * other keys remain for applying older pending_edit payloads still in the DB.
 */
export interface PendingEditPayload {
  name?: string;
  brand?: string | null;
  hsn?: string | null;
  packSize?: string | null;
  unit?: string | null;
  vegNonVeg?: string | null;
  masterProductId?: string | null;
  categoryIds?: string[];
  imageUrl?: string | null;
  images?: string[];
  taxPercent?: number;
  submittedAt: string;
  submittedBy: string;
}

export function serializeFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(value);
}

export interface MaterialChangeResult {
  materialPayload: Partial<PendingEditPayload>;
  hasMaterialChanges: boolean;
  /** Always false — name edits apply live; kept for call-site compatibility. */
  nameIsMinorOnly: boolean;
}

type ProductSnapshot = {
  name: string;
  brand: string | null;
  hsn: string | null;
  packSize: string | null;
  unit: string | null;
  vegNonVeg: string | null;
  masterProductId: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  images: string[];
};

/**
 * Compare incoming update against current product.
 * Only image fields are material (queued as pending_edit).
 */
export function detectMaterialChanges(
  current: ProductSnapshot,
  _currentCategoryIds: string[],
  incoming: Record<string, unknown>,
  _incomingCategoryIds?: string[],
): MaterialChangeResult {
  const materialPayload: Partial<PendingEditPayload> = {};
  let hasMaterialChanges = false;

  if (incoming.imageUrl !== undefined) {
    const oldStr = current.imageUrl ?? '';
    const nextStr =
      incoming.imageUrl === null || incoming.imageUrl === undefined
        ? ''
        : String(incoming.imageUrl);
    if (oldStr !== nextStr) {
      materialPayload.imageUrl = incoming.imageUrl as string | null;
      hasMaterialChanges = true;
    }
  }

  if (incoming.images !== undefined) {
    const oldImages = current.images || [];
    const newImages = (incoming.images as string[]) || [];
    const oldStr = [...oldImages].sort().join(',');
    const newStr = [...newImages].sort().join(',');
    if (oldStr !== newStr) {
      materialPayload.images = newImages;
      hasMaterialChanges = true;
    }
  }

  return { materialPayload, hasMaterialChanges, nameIsMinorOnly: false };
}

/**
 * taxPercent is never material now (HSN / identity fields apply live).
 * Kept for call-site compatibility.
 */
export function isTaxPercentMaterial(
  _incoming: Record<string, unknown>,
  _materialPayload: Partial<PendingEditPayload>,
): boolean {
  return false;
}
