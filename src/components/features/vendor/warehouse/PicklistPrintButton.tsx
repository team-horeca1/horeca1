'use client';

import React, { useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  orderId: string;
  picklistId?: string;
  onPrinted?: () => void;
  className?: string;
  label?: string;
}

export function PicklistPrintButton({
  orderId,
  picklistId,
  onPrinted,
  className,
  label = 'Print',
}: Props) {
  const [busy, setBusy] = useState(false);

  const handlePrint = async () => {
    setBusy(true);
    try {
      if (picklistId) {
        const res = await fetch(`/api/v1/vendor/warehouse/picklists/${picklistId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'printed' }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || 'Failed to update picklist');
      }
      window.open(`/api/v1/vendor/orders/${orderId}/picklist`, '_blank');
      onPrinted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Print failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={busy}
      className={className ?? 'h-[38px] px-4 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] flex items-center gap-1.5 disabled:opacity-50'}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
      {label}
    </button>
  );
}
