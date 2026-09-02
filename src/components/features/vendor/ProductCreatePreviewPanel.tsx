'use client';

import React from 'react';
import Image from 'next/image';
import { Badge } from '@/components/ui/Badge';
import { BulkSlabJourney } from '@/components/features/vendor/BulkSlabJourney';
import type { BulkPriceTier } from '@/types';

export interface ProductPreviewFormState {
  name: string;
  brandName?: string;
  imageUrl?: string;
  sellingPrice: number;
  mrp?: number;
  unit?: string;
  bulkEnabled: boolean;
  priceSlabs: BulkPriceTier[];
  creditEligible?: boolean;
}

export interface ProductPreviewChecklist {
  id: string;
  label: string;
  done: boolean;
  required?: boolean;
}

export function ProductCreatePreviewPanel({
  form,
  checklist,
}: {
  form: ProductPreviewFormState;
  checklist: ProductPreviewChecklist[];
}) {
  const savings =
    form.mrp && form.mrp > form.sellingPrice
      ? form.mrp - form.sellingPrice
      : null;

  return (
    <aside className="sticky top-4 space-y-4">
      <div className="bg-white border border-primary/30 rounded-xl overflow-hidden shadow-cdl-1 max-w-[280px]">
        <div className="relative aspect-square bg-ivory">
          {form.imageUrl ? (
            <Image src={form.imageUrl} alt="" fill className="object-contain p-4" unoptimized />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-text-muted">
              Primary image
            </div>
          )}
        </div>
        <div className="p-3 space-y-2">
          {form.brandName && (
            <p className="text-[11px] text-text-muted uppercase tracking-wide">{form.brandName}</p>
          )}
          <h3 className="text-[14px] font-semibold text-text line-clamp-2 min-h-[2.5rem]">
            {form.name || 'Product name'}
          </h3>
          <p className="text-[18px] font-bold text-primary tabular-nums">
            ₹{form.sellingPrice > 0 ? form.sellingPrice.toFixed(2) : '—'}
            {form.unit && <span className="text-[12px] font-medium text-text-muted"> /{form.unit}</span>}
          </p>
          {savings != null && savings > 0 && (
            <p className="text-[11px] text-success font-medium">Save ₹{savings.toFixed(0)}</p>
          )}
          {form.bulkEnabled && form.priceSlabs.length > 0 && (
            <BulkSlabJourney tiers={form.priceSlabs} currentQty={0} unitLabel={form.unit ?? 'Pc'} />
          )}
          {form.creditEligible && (
            <Badge variant="verified" className="text-[10px]">DiSCCO Eligible</Badge>
          )}
          <div className="w-full h-10 rounded-xl bg-primary text-white text-[13px] font-semibold flex items-center justify-center mt-2">
            Add to Cart
          </div>
        </div>
      </div>

      <div className="bg-white border border-divider rounded-xl p-3 max-w-[280px] shadow-cdl-1">
        <p className="text-[13px] font-semibold text-text mb-2">Launch checklist</p>
        <ul className="space-y-1.5">
          {checklist.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-[12px]">
              <span
                className={item.done ? 'text-success' : item.required ? 'text-error' : 'text-text-muted'}
                aria-hidden
              >
                {item.done ? '✓' : item.required ? '!' : '○'}
              </span>
              <span className={item.done ? 'text-text-secondary' : 'text-text'}>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
