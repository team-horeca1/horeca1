/**
 * "NA" (not applicable) support for the four mandatory product fields:
 * Country of Origin, Veg / Non-Veg, Storage type, Shelf Life (days).
 *
 * Storage rules (no DB migration):
 * - Country of Origin -> string "NA"
 * - Storage type      -> string "NA"
 * - Veg / Non-Veg     -> null in DB (enum veg|nonveg|egg), shown as "NA"
 * - Shelf Life        -> 0 in DB, shown as "NA" (buyer formatShelfLife hides <= 0)
 */

export const NA_TEXT = 'NA';

const NA_VARIANTS = new Set(['na', 'n/a', 'n.a.', 'n.a', 'not applicable', 'notapplicable', '-na-']);

export function isNaInput(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return false;
  return NA_VARIANTS.has(s) || NA_VARIANTS.has(s.replace(/\s/g, ''));
}

/** Normalise any NA spelling to the canonical "NA", otherwise return trimmed original. */
export function normalizeNaText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (isNaInput(value)) return NA_TEXT;
  return String(value).trim();
}

/** DB -> form: 0 => "NA", null/undefined => "", otherwise numeric string. */
export function shelfLifeToForm(days: number | null | undefined): string {
  if (days === null || days === undefined) return '';
  const n = Number(days);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return NA_TEXT;
  return String(n);
}

/** Form -> DB payload: blank => undefined, NA => 0, numeric string => int, else undefined. */
export function shelfLifeFromForm(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  if (isNaInput(s)) return 0;
  const n = Number(s);
  if (Number.isNaN(n)) return undefined;
  return Math.trunc(n);
}

/** Display: 0 => "NA", null => "", otherwise numeric string. */
export function shelfLifeDisplay(days: number | null | undefined): string {
  if (days === null || days === undefined) return '';
  const n = Number(days);
  if (!Number.isFinite(n)) return '';
  return n === 0 ? NA_TEXT : String(n);
}

export type VegFormValue = '' | 'veg' | 'nonveg' | 'egg' | 'na';

/** DB -> form: null/unknown => "na" only when explicitly requested, otherwise "". */
export function vegToForm(
  value: string | null | undefined,
  opts?: { nullAsNa?: boolean },
): VegFormValue {
  if (value === 'veg' || value === 'nonveg' || value === 'egg') return value;
  if (value && isNaInput(value)) return 'na';
  if ((value === null || value === undefined || value === '') && opts?.nullAsNa) return 'na';
  // Saved NA is null in DB. Callers that know the product was saved use nullAsNa.
  return value === null && opts?.nullAsNa ? 'na' : '';
}

/**
 * Form -> DB payload: 'na'/NA text => null, blank => undefined,
 * veg/nonveg/egg passthrough. Pass `explicitNull=true` handling is inherent:
 * null means "set NA", undefined means "don't touch".
 */
export function vegFromForm(
  value: string | null | undefined,
): 'veg' | 'nonveg' | 'egg' | null | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  if (s === 'veg' || s === 'nonveg' || s === 'egg') return s;
  if (isNaInput(s) || s.toLowerCase() === 'na') return null;
  return undefined;
}

/** Display helper: null/NA => "NA", otherwise raw value. */
export function vegDisplay(value: string | null | undefined): string {
  if (value === 'veg' || value === 'nonveg' || value === 'egg') return value;
  if (value && isNaInput(value)) return NA_TEXT;
  if (value === null || value === undefined || value === '') return NA_TEXT;
  return String(value);
}
