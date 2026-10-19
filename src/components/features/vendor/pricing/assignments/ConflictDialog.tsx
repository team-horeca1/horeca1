'use client';

import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

export type PreviewConflict = {
  userId: string;
  customerName: string;
  existingPricelistId: string;
  existingPricelist: string;
  via: string;
};

interface Props {
  open: boolean;
  listName: string;
  affectedCount: number;
  conflicts: PreviewConflict[];
  alreadyBound: { priceListId: string; priceListName: string } | null;
  onClose: () => void;
  onSkip: () => void;
  onReplace: () => void;
}

export function ConflictDialog({
  open,
  listName,
  affectedCount,
  conflicts,
  alreadyBound,
  onClose,
  onSkip,
  onReplace,
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
              <h2 className="text-[17px] font-bold text-[#181725]">Assignment conflicts</h2>
              <p className="text-[12px] text-[#7C7C7C] mt-0.5">
                Assigning <span className="font-semibold text-[#181725]">{listName}</span> affects{' '}
                <span className="tabular-nums">{affectedCount}</span> customer(s).
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#FAF7F2]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-auto flex-1 space-y-3 text-[13px]">
          {alreadyBound && (
            <div className="p-3 rounded-[12px] bg-amber-50 border border-amber-200 text-amber-900">
              This target is already on list <strong>{alreadyBound.priceListName}</strong>. Replacing will
              move it to {listName}.
            </div>
          )}

          {conflicts.length === 0 ? (
            <p className="text-[#7C7C7C]">No per-customer conflicts detected.</p>
          ) : (
            <ul className="divide-y divide-[#E9E3DD] border border-[#E9E3DD] rounded-[12px]">
              {conflicts.slice(0, 50).map((c) => (
                <li key={c.userId} className="p-3">
                  <div className="font-medium text-[#181725]">{c.customerName}</div>
                  <div className="text-[12px] text-[#7C7C7C]">
                    Currently on {c.existingPricelist} ({c.via})
                  </div>
                </li>
              ))}
            </ul>
          )}
          {conflicts.length > 50 && (
            <p className="text-[11px] text-[#7C7C7C]">+ {conflicts.length - 50} more conflicts</p>
          )}
        </div>

        <div className="p-4 border-t border-[#E9E3DD] flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-4 rounded-[12px] border border-[#E9E3DD] font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="h-11 px-4 rounded-[12px] border border-[#E9E3DD] font-semibold flex-1 min-w-[120px]"
          >
            Skip conflicts
          </button>
          <button
            type="button"
            onClick={onReplace}
            className="h-11 px-4 rounded-[12px] bg-primary text-white font-semibold flex-1 min-w-[120px]"
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
