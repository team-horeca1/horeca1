'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import type { WorkbenchCancelRequest } from './types';

export function CancelRequestBanner({
  request,
  onReviewed,
}: {
  request: WorkbenchCancelRequest;
  onReviewed: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const review = async (status: 'approved' | 'rejected') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/cancel-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, vendorNote: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Review failed');
      toast.success(status === 'approved' ? 'Order cancelled for customer.' : 'Cancellation declined.');
      onReviewed();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-[14px] border border-[#F59E0B]/40 bg-[#FFF8EB] p-4 space-y-3 print:hidden"
      data-testid="vendor-cancel-request-banner"
    >
      <div>
        <p className="text-[14px] font-bold text-[#181725]">Customer cancellation request</p>
        <p className="mt-1 text-[13px] text-[#7C7C7C]">{request.reason}</p>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Optional note to customer..."
        data-testid="vendor-cancel-note"
        className="w-full resize-none rounded-[10px] border border-[#EEEEEE] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#299E60]/40"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          data-testid="approve-cancel-request"
          onClick={() => void review('approved')}
          className="h-10 rounded-[10px] bg-[#E74C3C] px-4 text-[13px] font-bold text-white disabled:opacity-50"
        >
          Approve cancel
        </button>
        <button
          type="button"
          disabled={busy}
          data-testid="reject-cancel-request"
          onClick={() => void review('rejected')}
          className="h-10 rounded-[10px] border border-[#EEEEEE] px-4 text-[13px] font-bold text-[#7C7C7C] hover:bg-white disabled:opacity-50"
        >
          Decline request
        </button>
      </div>
    </div>
  );
}
