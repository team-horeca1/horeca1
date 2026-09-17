'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, Plus, Loader2, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VendorProduct } from '@/types';

export interface VendorOfferPickerProps {
  productName: string;
  offers: VendorProduct[];
  pincode?: string;
  addingId?: string | null;
  onClose: () => void;
  onAdd: (offer: VendorProduct) => void;
}

const emptySubscribe = () => () => {};

function offerPrice(p: VendorProduct): number {
  return Number(p.price) || 0;
}

function inStock(p: VendorProduct): boolean {
  return typeof p.stock === 'number' ? p.stock > 0 : true;
}

/** Modal drawer to pick among competing vendor listings for the same master SKU. */
export function VendorOfferPicker({
  productName,
  offers,
  pincode,
  addingId,
  onClose,
  onAdd,
}: VendorOfferPickerProps) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const sorted = offers.slice().sort((a, b) => {
    const stockDiff = Number(inStock(b)) - Number(inStock(a));
    if (stockDiff !== 0) return stockDiff;
    return offerPrice(a) - offerPrice(b);
  });

  const vendorHref = (offer: VendorProduct) =>
    `/vendor/${offer.vendorId}?q=${encodeURIComponent(productName)}`;

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`Vendors for ${productName}`}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] sm:max-h-[80vh] flex flex-col overflow-hidden shadow-2xl z-10 animate-in slide-in-from-bottom-6 duration-200 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab handle */}
        <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-divider sm:hidden" />

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-divider flex items-center justify-between gap-3">
          <div className="min-w-0 text-left">
            <h3 className="text-[16px] font-bold text-text truncate">{productName}</h3>
            <p className="text-[12px] text-text-secondary mt-0.5">
              Pick a supplier — prices &amp; bulk slabs vary by vendor
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 rounded-full hover:bg-black/5 text-text-secondary flex items-center justify-center shrink-0 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Offers list */}
        <div className="flex-1 overflow-y-auto divide-y divide-divider overscroll-contain px-1 py-1 pb-6 sm:pb-2">
          {sorted.map((offer) => {
            const stocked = inStock(offer);
            const isAdding = addingId === offer.id;
            const addDisabled = !stocked || isAdding;

            return (
              <div key={offer.id} className="p-4 flex items-center gap-3 hover:bg-ivory/50 transition-colors">
                <Link
                  href={vendorHref(offer)}
                  onClick={onClose}
                  className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                >
                  <p className="text-[14px] font-bold text-text truncate">
                    {offer.vendorName || 'Supplier'}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[17px] font-extrabold text-primary tabular-nums">
                      ₹{Math.round(offerPrice(offer)).toLocaleString('en-IN')}
                    </span>
                    {!stocked ? (
                      <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                        Out of stock
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        In stock
                      </span>
                    )}
                    {offer.bulkPrices && offer.bulkPrices.length > 0 && (
                      <span className="text-[10px] font-semibold text-text-secondary">
                        {offer.bulkPrices.length} bulk tier
                        {offer.bulkPrices.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </Link>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={vendorHref(offer)}
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-xl text-[12px] font-bold flex items-center gap-1 bg-white border border-primary/30 text-primary hover:bg-primary-light min-h-10 transition-colors"
                  >
                    View
                    <ChevronRight size={13} strokeWidth={3} />
                  </Link>
                  {stocked && (
                    <button
                      type="button"
                      onClick={() => onAdd(offer)}
                      disabled={addDisabled}
                      className={cn(
                        'px-3.5 py-1.5 rounded-xl text-[12px] font-bold flex items-center gap-1.5 transition-all min-h-10 shadow-xs active:scale-95',
                        'bg-primary text-white hover:bg-primary-dark',
                        isAdding && 'opacity-60',
                      )}
                    >
                      {isAdding ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Plus size={13} strokeWidth={3} />
                      )}
                      Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {sorted.length === 0 && (
            <div className="p-8 text-center text-[13px] text-text-secondary">
              <AlertCircle className="mx-auto mb-2 text-text-muted" size={24} />
              No suppliers available
              {pincode ? ` for ${pincode}` : ''}.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

