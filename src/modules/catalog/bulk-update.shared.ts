/**
 * bulk-update.shared — schemas + math shared by the vendor and admin
 * product bulk-update routes so the two can never drift. Both routes import
 * these bases; the admin filter additionally accepts a vendorId scope.
 */

import { z } from 'zod';

// ── Filter ──────────────────────────────────────────────────────────────
// Base criteria common to both portals. AND semantics — every present key
// narrows the matched set further.
export const filterSchemaBase = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(500).optional(),
  skus: z.array(z.string().min(1).max(100)).min(1).max(500).optional(),
  categoryId: z.string().uuid().optional(),
  brand: z.string().min(1).max(150).optional(),
  isActive: z.boolean().optional(),
});

// ── Price adjustment ────────────────────────────────────────────────────
// percent = delta %, fixed = ₹ delta, set = absolute new value.
export const priceAdjustSchema = z.object({
  type: z.enum(['percent', 'fixed', 'set']),
  value: z.number(),
  roundTo: z.number().int().min(0).max(2).default(2).optional(),
});
export type PriceAdjust = z.infer<typeof priceAdjustSchema>;

// ── Offer / deal price ──────────────────────────────────────────────────
// setPrice  = absolute promo (deal) rate ₹.
// percentOff = promo = basePrice × (1 − value/100).
// clear     = wipe promo price + window.
// startTime/endTime are HH:mm daily windows (matches Product.promo*Time).
export const offerSchema = z
  .object({
    mode: z.enum(['setPrice', 'percentOff', 'clear']),
    value: z.number().min(0).optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    applyToSlabs: z.boolean().optional(),
  })
  .refine((o) => o.mode === 'clear' || typeof o.value === 'number', {
    message: 'offer.value is required unless mode is "clear"',
  });

// ── Set block ───────────────────────────────────────────────────────────
// The whitelist of writable fields. Routes add their own `.refine` to require
// at least one key. Anything not listed here can never be written in bulk.
export const setSchemaBase = z.object({
  // Direct writes
  isActive:        z.boolean().optional(),
  minOrderQty:     z.number().int().min(1).max(10000).optional(),
  taxPercent:      z.number().min(0).max(100).optional(),
  creditEligible:  z.boolean().optional().transform((v) => (v === undefined ? undefined : true)),
  isFeatured:      z.boolean().optional(),
  vegNonVeg:       z.enum(['veg', 'nonveg', 'egg']).nullable().optional(),
  storageType:     z.string().max(50).nullable().optional(),
  shelfLifeDays:   z.number().int().min(0).max(3650).nullable().optional(),
  description:     z.string().max(2000).nullable().optional(),
  brand:           z.string().max(150).optional(),
  countryOfOrigin: z.string().max(100).optional(),
  name:            z.string().min(1).max(255).optional(),
  sku:             z.string().max(100).nullable().optional(),
  hsn:             z.string().max(50).nullable().optional(),
  unit:            z.string().max(50).nullable().optional(),
  packSize:        z.string().max(100).nullable().optional(),
  barcode:         z.string().max(100).nullable().optional(),
  fssaiRef:        z.string().max(50).nullable().optional(),
  imageUrl:        z.string().url().nullable().optional(),
  tags:            z.array(z.string()).optional(),
  aliasNames:      z.array(z.string()).optional(),
  images:          z.array(z.string().url()).optional(),
  // Replaces the category set; each must be a leaf (level-2) sub-category.
  categoryIds:     z.array(z.string().uuid()).min(1).max(5).optional(),

  // Price adjustments
  basePrice:       priceAdjustSchema.optional(),
  originalPrice:   priceAdjustSchema.optional(),
  applyToSlabs:    z.boolean().default(false).optional(),

  // Offers
  clearPromo:      z.boolean().optional(),
  offer:           offerSchema.optional(),

  // Seasonal disable — stores window in metadata; sets isActive false when today is in range
  seasonalOffFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  seasonalOffTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type BulkSet = z.infer<typeof setSchemaBase>;

// ── Math ────────────────────────────────────────────────────────────────
export function round(n: number, places = 2): number {
  return Math.round(n * 10 ** places) / 10 ** places;
}

export function applyAdjustment(current: number, adj: PriceAdjust): number {
  const places = adj.roundTo ?? 2;
  if (adj.type === 'set') return Math.max(0.01, round(adj.value, places));
  if (adj.type === 'percent') return Math.max(0.01, round(current + current * (adj.value / 100), places));
  return Math.max(0.01, round(current + adj.value, places)); // 'fixed' = ₹ delta
}

// Promo price as a % off a reference price (base or slab).
export function applyOfferPrice(reference: number, percentOff: number): number {
  return Math.max(0.01, round(reference * (1 - percentOff / 100)));
}

// ── Preview ─────────────────────────────────────────────────────────────
interface PreviewRow {
  id: string;
  name: string;
  basePrice: unknown;
  originalPrice: unknown;
  taxPercent: unknown;
  promoPrice: unknown;
  isActive: boolean;
  creditEligible: boolean;
  isFeatured: boolean;
  minOrderQty: number;
}

export interface PreviewItem {
  id: string;
  name: string;
  before: Record<string, string | number | null>;
  after: Record<string, string | number | null>;
}

// Builds a human-readable before→after map for the fields the `set` block
// actually touches. Used by ?mode=preview so the drawer shows real numbers.
export function buildPreviewSample(rows: PreviewRow[], set: BulkSet): PreviewItem[] {
  return rows.map((p) => {
    const before: Record<string, string | number | null> = {};
    const after: Record<string, string | number | null> = {};
    const base = Number(p.basePrice);

    if (set.basePrice) {
      before['Base price'] = base;
      after['Base price'] = applyAdjustment(base, set.basePrice);
    }
    if (set.originalPrice) {
      const cur = p.originalPrice != null ? Number(p.originalPrice) : base;
      before['MRP'] = cur;
      after['MRP'] = applyAdjustment(cur, set.originalPrice);
    }
    if (set.taxPercent !== undefined) {
      before['GST %'] = Number(p.taxPercent);
      after['GST %'] = set.taxPercent;
    }
    if (set.minOrderQty !== undefined) {
      before['MOQ'] = p.minOrderQty;
      after['MOQ'] = set.minOrderQty;
    }
    if (set.isActive !== undefined) {
      before['Status'] = p.isActive ? 'Active' : 'Inactive';
      after['Status'] = set.isActive ? 'Active' : 'Inactive';
    }
    if (set.creditEligible !== undefined) {
      before['Credit'] = p.creditEligible ? 'Eligible' : 'Not eligible';
      after['Credit'] = set.creditEligible ? 'Eligible' : 'Not eligible';
    }
    if (set.isFeatured !== undefined) {
      before['Featured'] = p.isFeatured ? 'Yes' : 'No';
      after['Featured'] = set.isFeatured ? 'Yes' : 'No';
    }

    const curPromo = p.promoPrice != null ? Number(p.promoPrice) : null;
    if (set.clearPromo || set.offer?.mode === 'clear') {
      before['Deal price'] = curPromo;
      after['Deal price'] = null;
    } else if (set.offer?.mode === 'setPrice') {
      before['Deal price'] = curPromo;
      after['Deal price'] = round(set.offer.value ?? 0);
    } else if (set.offer?.mode === 'percentOff') {
      before['Deal price'] = curPromo;
      after['Deal price'] = applyOfferPrice(base, set.offer.value ?? 0);
    }

    return { id: p.id, name: p.name, before, after };
  });
}
