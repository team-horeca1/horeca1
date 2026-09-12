export type BrandVegMark = 'veg' | 'nonveg' | 'egg';

export function formatShelfLife(days?: number | null): string | null {
  if (days == null || !Number.isFinite(days) || days <= 0) return null;
  if (days >= 365 && days % 365 === 0) {
    const years = days / 365;
    return `Shelf life: ${years} year${years === 1 ? '' : 's'}`;
  }
  if (days >= 30) {
    const months = Math.round(days / 30);
    return `Shelf life: ${months} month${months === 1 ? '' : 's'}`;
  }
  return `Shelf life: ${days} day${days === 1 ? '' : 's'}`;
}

export function brandHighlightTag(input: {
  tags?: string[] | null;
  fssaiRef?: string | null;
}): string | null {
  const story = (input.tags ?? []).map((t) => t.trim()).find(Boolean);
  if (story) return story;
  if (input.fssaiRef?.trim()) return 'FSSAI Certified';
  return null;
}

export function isBulkPack(packSize?: string | null, unit?: string | null): boolean {
  const hay = `${packSize ?? ''} ${unit ?? ''}`.toLowerCase();
  return /\b(case|dozen|carton|crate|tin|tray)\b/.test(hay) || /x\s*\d{2,}/.test(hay);
}

export function isFrozenStorage(storageType?: string | null): boolean {
  return (storageType ?? '').toLowerCase().includes('frozen');
}

export function nearbySupplierCount(
  distributors: Array<{ inStock: boolean; servicesPincode?: boolean }>,
): number {
  return distributors.filter((d) => d.inStock && d.servicesPincode !== false).length;
}
