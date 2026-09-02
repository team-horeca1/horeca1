'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';

interface MarkPaidModalProps {
  amountLabel: string;
  upiId: string | null;
  trackingKey?: string | null;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (utr: string) => void;
}

export function MarkPaidModal({
  amountLabel,
  upiId,
  trackingKey,
  submitting,
  onClose,
  onConfirm,
}: MarkPaidModalProps) {
  const [utr, setUtr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const trimmed = utr.trim();

  const submit = () => {
    if (!trimmed || submitting) return;
    onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mark-paid-title"
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 id="mark-paid-title" className="text-[16px] font-bold text-[#181725]">
              Mark payout as paid
            </h3>
            <p className="text-[12px] text-gray-500 font-medium mt-1">
              Paying {amountLabel} to {upiId ?? 'this user (no UPI ID yet)'}.
              {trackingKey ? ` · ${trackingKey}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <label htmlFor="mark-paid-utr" className="block text-[11px] font-bold text-gray-500 mb-1">
          UPI / UTR reference
        </label>
        <input
          id="mark-paid-utr"
          ref={inputRef}
          value={utr}
          onChange={(e) => setUtr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          maxLength={100}
          placeholder="e.g. 123456789012"
          disabled={submitting}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] font-medium focus:outline-none focus:border-[#6B1D2E] disabled:bg-gray-50"
        />
        <p className="mt-2 text-[11px] text-gray-400">
          Paste the bank or UPI transaction reference after you send the money.
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl border border-gray-200 text-[12px] font-bold text-[#181725] hover:bg-gray-50 cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !trimmed}
            className="inline-flex items-center justify-center min-w-[110px] px-4 py-2 rounded-xl bg-[#6B1D2E] text-white text-[12px] font-bold hover:bg-primary-dark cursor-pointer disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : 'Confirm paid'}
          </button>
        </div>
      </div>
    </div>
  );
}
