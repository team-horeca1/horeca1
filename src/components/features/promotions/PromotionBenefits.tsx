'use client';

import React from 'react';
import Image from 'next/image';
import { Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VendorPromoSummary } from '@/types';

/** Per-vendor strip: "You're getting 1 FREE … — Buy 1 Get 1 Free" */
export function VendorPromoBanner({
  summary,
  className,
}: {
  summary: VendorPromoSummary;
  className?: string;
}) {
  const freeCount = summary.freeLines.reduce((s, l) => s + l.quantity, 0);
  const sameProductFree = summary.paidLines.reduce((s, l) => s + l.freeQty, 0);
  const totalFree = freeCount + sameProductFree;
  if (totalFree <= 0) return null;

  const firstFree = summary.freeLines[0];
  const firstPaid = summary.paidLines.find((l) => l.freeQty > 0);
  const label = firstFree
    ? `${firstFree.quantity}× ${firstFree.name}`
    : firstPaid
      ? `${firstPaid.freeQty}× ${firstPaid.name}`
      : 'free item(s)';

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-violet-50 px-3 py-2.5 md:px-4 md:py-3',
        className,
      )}
    >
      <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
        <Gift size={16} className="text-purple-600" strokeWidth={2.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] md:text-[14px] font-bold text-purple-900 leading-snug">
          You&apos;re getting {totalFree} FREE — {label}
        </p>
        <p className="text-[11px] md:text-[12px] text-purple-700/80 font-medium mt-0.5">
          {summary.promotionName}
        </p>
      </div>
    </div>
  );
}

/** Chip under paid line qty: "+1 FREE included" */
export function PaidLineWithBonus({ freeQty }: { freeQty: number }) {
  if (freeQty <= 0) return null;
  return (
    <p className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-100 rounded-lg px-2 py-1 mt-1.5 w-fit">
      +{freeQty} FREE included with this offer
    </p>
  );
}

/** Cart/checkout free gift row */
export function FreeGiftLine({
  name,
  quantity,
  image,
  packSize,
  unitValueSaved,
  compact = false,
}: {
  name: string;
  quantity: number;
  image?: string;
  packSize?: string;
  unitValueSaved?: number;
  compact?: boolean;
}) {
  const saved = unitValueSaved != null ? unitValueSaved * quantity : null;

  if (compact) {
    return (
      <div className="flex items-center justify-between text-[13px] py-1">
        <span className="text-purple-700 font-medium flex items-center gap-1.5 min-w-0">
          <Gift size={14} className="shrink-0" />
          <span className="truncate">Free: {quantity}× {name}</span>
        </span>
        <span className="font-bold text-purple-700 shrink-0 ml-2">
          {saved != null && saved > 0 ? (
            <span className="line-through text-purple-400 mr-1 text-[12px]">₹{saved.toFixed(0)}</span>
          ) : null}
          FREE
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 px-4 py-3 md:px-7 md:py-4 bg-purple-50/60 border border-purple-100/80 rounded-xl">
      <div className="w-14 h-14 md:w-[72px] md:h-[72px] rounded-xl bg-white border border-purple-100 shrink-0 relative overflow-hidden">
        <Image
          src={image || '/images/recom-product/product-img10.png'}
          alt={name}
          fill
          className="object-contain p-1.5"
          sizes="72px"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-wide bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white px-2 py-0.5 rounded-full">
            Free gift
          </span>
          <span className="text-[11px] font-bold text-purple-600">Qty {quantity}</span>
        </div>
        <h4 className="text-[14px] md:text-[15px] font-bold text-[#181725] leading-snug mt-1 line-clamp-2">{name}</h4>
        {packSize && (
          <p className="text-[12px] text-gray-400 font-medium mt-0.5">{packSize}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        {saved != null && saved > 0 && (
          <p className="text-[12px] text-gray-400 line-through font-medium">₹{saved.toFixed(0)}</p>
        )}
        <p className="text-[16px] font-black text-purple-700">FREE</p>
      </div>
    </div>
  );
}

/** Bill summary block for free items + optional % discount */
export function PromoSavingsSummary({
  bxgyFreeItems,
  freeItemsValue,
  promoDiscount,
  promoLabel,
  contractPricing,
}: {
  bxgyFreeItems?: Array<{
    productName: string;
    quantity: number;
    promotionName?: string;
  }>;
  freeItemsValue?: number;
  promoDiscount?: number;
  promoLabel?: string;
  contractPricing?: boolean;
}) {
  const hasBxgy = (bxgyFreeItems?.length ?? 0) > 0;
  const hasDiscount = (promoDiscount ?? 0) > 0;
  if (!hasBxgy && !hasDiscount && !contractPricing) return null;

  return (
    <div className="space-y-2">
      {hasBxgy && (
        <div className="rounded-xl border border-purple-100 bg-purple-50/50 px-3 py-2.5 space-y-1">
          <p className="text-[12px] font-black text-purple-800 uppercase tracking-wide">Your free items</p>
          {bxgyFreeItems!.map((item, idx) => (
            <FreeGiftLine
              key={`${item.productName}-${idx}`}
              name={item.productName}
              quantity={item.quantity}
              compact
            />
          ))}
          {freeItemsValue != null && freeItemsValue > 0 && (
            <p className="text-[12px] font-bold text-purple-700 pt-1 border-t border-purple-100">
              Free items worth ₹{freeItemsValue.toLocaleString('en-IN')}
            </p>
          )}
        </div>
      )}
      {hasDiscount && (
        <div className="flex justify-between items-center text-[14px]">
          <span className="text-success font-medium">Store Offer{promoLabel ? ` (${promoLabel})` : ''}</span>
          <span className="font-bold text-primary">−₹{promoDiscount!.toFixed(2)}</span>
        </div>
      )}
      {contractPricing && (
        <p className="text-[11px] text-primary font-medium">Contract pricing applied for this order</p>
      )}
    </div>
  );
}

/** "Your price" chip for price-list lines */
export function YourPriceChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'text-[9px] font-black uppercase tracking-wide bg-gradient-to-r from-primary to-primary-dark text-white px-1.5 py-0.5 rounded-full',
        className,
      )}
    >
      Your price
    </span>
  );
}

/** Plain-language checkout total helper */
export function promoTotalCaption(args: {
  paidItemCount: number;
  freeItemCount: number;
  totalPay: number;
}): string {
  const { paidItemCount, freeItemCount, totalPay } = args;
  const totalUnits = paidItemCount + freeItemCount;
  if (freeItemCount <= 0) {
    return `You pay ₹${totalPay.toLocaleString('en-IN')} for ${paidItemCount} item${paidItemCount !== 1 ? 's' : ''}`;
  }
  return `You pay ₹${totalPay.toLocaleString('en-IN')} for ${totalUnits} items (${freeItemCount} free)`;
}
