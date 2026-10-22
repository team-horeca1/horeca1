'use client';

import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

export type PreviewConflict = {
  userId: string;
  customerName: string;
  existingPricelistId: string;
  existingPricelist: string;
  via: string;
  productCount?: number;
  productNames?: string[];
};

interface Props {
  open: boolean;
  listName: string;
  affectedCount: number;
  conflicts: PreviewConflict[];
  onClose: () => void;
  onSkip: () => void;
  onReplace: () => void;
  onReviewManually: () => void;
}

export function ConflictDialog({
  open,
  listName,
  affectedCount,
  conflicts,
  onClose,
  onSkip,
  onReplace,
  onReviewManually,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-[12px] shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-[#E9E3DD] flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-[#181725]">Same product, two prices</h2>
              <p className="text-[12px] text-[#7C7C7C] mt-0.5">
                <span className="font-semibold text-[#181725]">{listName}</span> and another list both
                price the same product for {affectedCount} customer(s). Nothing is saved until you choose.
                Lists covering different products can always be combined.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#FAF7F2]" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-auto flex-1 space-y-3 text-[13px]">
          <ul className="divide-y divide-[#E9E3DD] border border-[#E9E3DD] rounded-[12px]">
            {conflicts.slice(0, 50).map((c) => (
              <li key={`${c.userId}-${c.existingPricelistId}`} className="p-3">
                <div className="font-medium text-[#181725]">{c.customerName}</div>
                <div className="text-[12px] text-[#7C7C7C]">
                  Already priced on <span className="font-medium text-[#181725]">{c.existingPricelist}</span> ({c.via})
                  {typeof c.productCount === 'number' && (
                    <> · <span className="tabular-nums">{c.productCount}</span> shared product{c.productCount === 1 ? '' : 's'}</>
                  )}
                </div>
                {c.productNames && c.productNames.length > 0 && (
                  <div className="text-[11px] text-[#7C7C7C] mt-0.5 truncate">
                    {c.productNames.slice(0, 4).join(', ')}{c.productNames.length > 4 ? '…' : ''}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {conflicts.length > 50 && (
            <p className="text-[11px] text-[#7C7C7C]">+ {conflicts.length - 50} more</p>
          )}
          <div className="text-[12px] text-[#7C7C7C] space-y-1">
            <p><strong className="text-[#181725]">Skip</strong> — keep the existing list; don&apos;t add this one for those customers.</p>
            <p><strong className="text-[#181725]">Replace</strong> — remove those customers from the existing list and put them on {listName}.</p>
            <p><strong className="text-[#181725]">Review manually</strong> — open both lists side-by-side and remove the overlap yourself.</p>
          </div>
        </div>

        <div className="p-4 border-t border-[#E9E3DD] flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReviewManually}
            className="h-11 px-4 rounded-[12px] border border-[#E9E3DD] font-semibold"
          >
            Review manually
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="h-11 px-4 rounded-[12px] border border-[#E9E3DD] font-semibold flex-1 min-w-[110px]"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onReplace}
            className="h-11 px-4 rounded-[12px] bg-primary text-white font-semibold flex-1 min-w-[110px]"
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
