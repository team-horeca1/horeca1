'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface ReactivateWalletModalProps {
  customerName: string;
  walletId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReactivateWalletModal({ customerName, walletId, onClose, onSuccess }: ReactivateWalletModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason.trim()) {
      toast.error('Please enter a reason for reactivation');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/wallet/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId, reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || json.message || 'Failed to reactivate wallet');
      toast.success('Wallet reactivated');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reactivate wallet');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[420px] shadow-2xl">
        <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-[#181725]">Reactivate wallet</h2>
            <p className="text-[12px] text-[#AEAEAE]">{customerName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-[6px] hover:bg-[#F5F5F5]">
            <X size={16} className="text-[#AEAEAE]" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-[13px] text-[#7C7C7C]">
            This restores the customer&apos;s credit line to <strong className="text-[#181725]">Active</strong> and logs the action in the audit trail.
          </p>
          <div>
            <label className="block text-[12px] font-semibold text-[#7C7C7C] mb-1">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Customer cleared outstanding dues"
              className="w-full border border-[#EEEEEE] rounded-[10px] px-3 py-2 text-[13px] outline-none focus:border-[#6B1D2E]/40 resize-none bg-white"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#EEEEEE] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 h-[38px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-semibold text-[#7C7C7C]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="px-5 h-[38px] rounded-[10px] bg-[#6B1D2E] text-white text-[13px] font-bold disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            Confirm reactivate
          </button>
        </div>
      </div>
    </div>
  );
}
