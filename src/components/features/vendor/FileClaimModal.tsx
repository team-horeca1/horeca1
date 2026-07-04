'use client';

import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  onCreated?: () => void;
}

const TYPES = ['shortage', 'damage', 'quality', 'expiry'] as const;

export function FileClaimModal({ open, onClose, orderId, orderNumber, onCreated }: Props) {
  const [type, setType] = useState<typeof TYPES[number]>('shortage');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/vendor/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          type,
          amount: amount ? Number(amount) : undefined,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to file claim');
      toast.success('Claim filed');
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to file claim');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[440px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE]">
          <div>
            <h2 className="text-[16px] font-bold text-[#181725]">File delivery claim</h2>
            <p className="text-[12px] text-[#AEAEAE]">Order {orderNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[#AEAEAE] hover:text-[#181725]"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Claim type</label>
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px]">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Amount (optional)</label>
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px]" placeholder="₹" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border border-[#EEEEEE] rounded-[10px] px-3 py-2 text-[13px] resize-none" placeholder="Describe shortage or damage..." />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[#EEEEEE] flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 h-[42px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#7C7C7C]">Cancel</button>
          <button type="button" onClick={submit} disabled={submitting} className="flex-1 h-[42px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Submit claim
          </button>
        </div>
      </div>
    </div>
  );
}
