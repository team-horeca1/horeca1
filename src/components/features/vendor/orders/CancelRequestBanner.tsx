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

  const noteTrimmed = note.trim();
  const canDecline = noteTrimmed.length >= 10;

  const review = async (status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !canDecline) {
      toast.error('Add a note to the customer (at least 10 characters) before declining.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/vendor/cancel-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          vendorNote: noteTrimmed || undefined,
        }),
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
      <div>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#7C7C7C]">
          Note to customer (required to decline)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Explain why you are declining, or optional note if approving..."
          data-testid="vendor-cancel-note"
          className="w-full resize-none rounded-[10px] border border-[#EEEEEE] bg-white px-3 py-2 text-[13px] outline-none focus:border-primary/40"
        />
        {!canDecline && (
          <p className="mt-1 text-[11px] text-[#AEAEAE]">
            Decline needs at least 10 characters. Approve can skip the note.
          </p>
        )}
      </div>
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
          disabled={busy || !canDecline}
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
