'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { OffersList } from './OffersList';

export function OffersSheet({
  open,
  onClose,
  vendorId,
  vendorName,
}: {
  open: boolean;
  onClose: () => void;
  vendorId?: string;
  vendorName?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // z-[10001] clears sticky Navbar (z-[10000]) and MobileBottomNav (z-[9999]).
  // Portal to body so a parent stacking context cannot trap the overlay.
  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-end md:items-center justify-center">
      <button
        type="button"
        aria-label="Close deals"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="offers-sheet-title"
        className="relative w-full md:w-[min(720px,92vw)] max-h-[88vh] overflow-y-auto bg-white rounded-t-3xl md:rounded-2xl shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white px-[clamp(1rem,3vw,1.5rem)] py-4 border-b border-gray-100">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">Deals & Coupons</p>
            <h2 id="offers-sheet-title" className="text-[18px] font-black text-[#181725]">
              {vendorName ? `${vendorName} + platform` : 'Deals & Discounts'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-50 text-gray-500 cursor-pointer"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        <div className="px-[clamp(1rem,3vw,1.5rem)] py-4 pb-8">
          <OffersList vendorId={vendorId} compact />
        </div>
      </div>
    </div>,
    document.body,
  );
}
