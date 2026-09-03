'use client';

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

function offerPrice(p: VendorProduct): number {
  return Number(p.price) || 0;
}

function inStock(p: VendorProduct): boolean {
  return typeof p.stock === 'number' ? p.stock > 0 : true;
}

/** Modal to pick among competing vendor listings for the same master SKU. */
export function VendorOfferPicker({
  productName,
  offers,
  pincode,
  addingId,
  onClose,
  onAdd,
}: VendorOfferPickerProps) {
  const sorted = offers.slice().sort((a, b) => {
    const stockDiff = Number(inStock(b)) - Number(inStock(a));
    if (stockDiff !== 0) return stockDiff;
    return offerPrice(a) - offerPrice(b);
  });

  const vendorHref = (offer: VendorProduct) =>
    `/vendor/${offer.vendorId}?q=${encodeURIComponent(productName)}`;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Vendors for ${productName}`}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-divider flex items-center justify-between gap-3">
          <div className="min-w-0 text-left">
            <h3 className="text-[15px] font-bold text-[#1C1C1C] truncate">{productName}</h3>
            <p className="text-[12px] text-[#667085] mt-0.5">
              Pick a supplier — prices &amp; bulk slabs vary by vendor
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-ivory rounded-xl shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-divider">
          {sorted.map((offer) => {
            const stocked = inStock(offer);
            const isAdding = addingId === offer.id;
            const addDisabled = !stocked || isAdding;

            return (
              <div key={offer.id} className="p-4 flex items-center gap-3">
                <Link
                  href={vendorHref(offer)}
                  onClick={onClose}
                  className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                >
                  <p className="text-[13px] font-bold text-[#1C1C1C] truncate">
                    {offer.vendorName || 'Supplier'}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[16px] font-extrabold text-primary tabular-nums">
                      ₹{Math.round(offerPrice(offer)).toLocaleString('en-IN')}
                    </span>
                    {!stocked && (
                      <span className="text-[10px] font-bold text-red-500">Out of stock</span>
                    )}
                    {offer.bulkPrices && offer.bulkPrices.length > 0 && (
                      <span className="text-[10px] font-semibold text-[#667085]">
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
                    className="px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1 bg-white border border-primary/30 text-primary hover:bg-primary-light min-h-10"
                  >
                    View
                    <ChevronRight size={12} strokeWidth={3} />
                  </Link>
                  {stocked && (
                    <button
                      type="button"
                      onClick={() => onAdd(offer)}
                      disabled={addDisabled}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1 transition-colors min-h-10',
                        'bg-primary text-white hover:bg-primary-dark',
                        isAdding && 'opacity-60',
                      )}
                    >
                      {isAdding ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Plus size={12} strokeWidth={3} />
                      )}
                      Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {sorted.length === 0 && (
            <div className="p-8 text-center text-[13px] text-[#667085]">
              <AlertCircle className="mx-auto mb-2 text-[#667085]" size={20} />
              No suppliers available
              {pincode ? ` for ${pincode}` : ''}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
