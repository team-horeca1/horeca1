export const DEFAULT_GST_SLABS = [0, 5, 12, 18, 28] as const;

export function normalizeGstSlabs(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_GST_SLABS];
  const next = raw
    .map((n) => (typeof n === 'number' ? n : Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
  const unique = [...new Set(next.map((n) => Math.round(n * 100) / 100))].sort((a, b) => a - b);
  return unique.length > 0 ? unique : [...DEFAULT_GST_SLABS];
}

export function gstSlabSelectOptions(slabs: number[], current?: string): string[] {
  const options = slabs.map((n) => String(n));
  const cur = (current ?? '').trim();
  if (cur && !options.includes(cur)) {
    options.push(cur);
    options.sort((a, b) => Number(a) - Number(b));
  }
  return options;
}
