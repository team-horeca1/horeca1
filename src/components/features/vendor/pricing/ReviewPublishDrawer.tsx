'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { dirtyToPublishCells, inr, type DraftCell } from './types';

type DiffRow = {
  priceListId: string;
  productId: string;
  productName: string;
  sku: string | null;
  listName: string;
  kind: string;
  guardrails: Array<{ severity: 'block' | 'warn'; code: string; message: string }>;
  previousEffective: number;
  newEffective: number | null;
};

type ReviewData = {
  stale: boolean;
  latestVersion: string | null;
  diffs: DiffRow[];
  summary: {
    priced: number;
    base: number;
    removed: number;
    restored: number;
    blocks: number;
    warns: number;
    unpriced?: number;
    customersAffected: number;
  };
  unpriced?: Array<{ priceListId: string; productId: string; productName: string; listName: string }>;
};

interface Props {
  open: boolean;
  onClose: () => void;
  dirty: Record<string, DraftCell>;
  baseVersion: string | null;
  onPublished: (rollbackPublishId?: string) => void;
}

export function ReviewPublishDrawer({ open, onClose, dirty, baseVersion, onPublished }: Props) {
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [ackWarnings, setAckWarnings] = useState(false);
  const [lastPublishId, setLastPublishId] = useState<string | null>(null);

  const cells = useMemo(() => dirtyToPublishCells(dirty), [dirty]);

  const loadReview = useCallback(async () => {
    if (!open || cells.length === 0) return;
    setLoading(true);
    setAckWarnings(false);
    try {
      const res = await fetch('/api/v1/vendor/price-lists/workspace/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseVersion, cells }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'Review failed');
      }
      setReview(json.data as ReviewData);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Review failed');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [open, baseVersion, cells, onClose]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  const publish = async (forceAck = false) => {
    if (cells.length === 0) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/v1/vendor/price-lists/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseVersion,
          cells,
          acknowledgeWarnings: forceAck || ackWarnings,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        const code = json.error?.code as string | undefined;
        if (code === 'STALE_DRAFT') {
          toast.error(json.error?.message || 'Draft is stale — reload and re-apply changes.');
          return;
        }
        if (code === 'NEEDS_ACK') {
          toast.message('Acknowledge warnings to continue');
          return;
        }
        throw new Error(json.error?.message || 'Publish failed');
      }
      const publishId = json.data?.publishId as string | undefined;
      setLastPublishId(publishId ?? null);
      const upserted = Number(json.data?.upserted ?? 0);
      const cleared = Number(json.data?.cleared ?? 0);
      const skipped = Number(json.data?.skipped ?? 0);
      if (upserted + cleared === 0) {
        toast.message(
          skipped > 0
            ? `Nothing published (${skipped} change(s) skipped — e.g. locked or unpriced)`
            : 'Nothing published — set a price on added rows, or discard empty changes',
        );
      } else {
        const parts: string[] = [];
        if (upserted > 0) parts.push(`${upserted} updated`);
        if (cleared > 0) parts.push(`${cleared} cleared`);
        toast.success(`Published ${parts.join(', ')}`);
      }
      onPublished(publishId);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  if (!open) return null;

  const blocks = review?.summary.blocks ?? 0;
  const warns = review?.summary.warns ?? 0;
  const canPublish = review && blocks === 0 && (!warns || ackWarnings) && !review.stale;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[480px] h-full bg-white shadow-2xl flex flex-col">
        <div className="p-5 border-b border-[#E9E3DD] flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-[#181725]">Review & publish</h2>
            <p className="text-[12px] text-[#7C7C7C] mt-0.5 tabular-nums">{cells.length} cell change(s)</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[#FAF7F2] text-[#7C7C7C]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#7C7C7C] gap-2">
              <Loader2 size={20} className="animate-spin" /> Analysing changes…
            </div>
          ) : review ? (
            <>
              {review.stale && (
                <div className="p-3 rounded-[12px] bg-red-50 border border-red-200 text-[13px] text-red-800 flex gap-2">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                  Someone else published since you started. Reload the grid, then re-apply your edits.
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[12px]">
                {[
                  ['Priced', review.summary.priced],
                  ['Back to base', review.summary.base],
                  ['Removed', review.summary.removed],
                  ['Restored', review.summary.restored],
                ].map(([label, n]) => (
                  <div key={String(label)} className="p-3 rounded-[12px] bg-[#FAF7F2] border border-[#E9E3DD]">
                    <div className="text-[#7C7C7C]">{label}</div>
                    <div className="font-bold text-[#181725] tabular-nums">{n}</div>
                  </div>
                ))}
              </div>

              {blocks > 0 && (
                <div className="p-3 rounded-[12px] bg-red-50 border border-red-200 text-[13px] text-red-800">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <ShieldAlert size={14} /> {blocks} blocking issue(s)
                  </div>
                  Fix blocked rows in the grid before publishing.
                </div>
              )}

              {(review.unpriced?.length ?? review.summary.unpriced ?? 0) > 0 && (
                <div className="p-3 rounded-[12px] bg-amber-50 border border-amber-200 text-[13px] text-amber-900">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <AlertTriangle size={14} /> {review.unpriced?.length ?? review.summary.unpriced} added product(s) have no price
                  </div>
                  <p>These were added to a list but left without a price, so they will <strong>not</strong> be saved. Set a price in the grid, or publish now and add them later.</p>
                  {review.unpriced && review.unpriced.length > 0 && (
                    <ul className="mt-1.5 list-disc pl-4 space-y-0.5">
                      {review.unpriced.slice(0, 20).map((u) => (
                        <li key={`${u.priceListId}:${u.productId}`}>{u.productName} <span className="text-amber-700">({u.listName})</span></li>
                      ))}
                      {review.unpriced.length > 20 && <li>+ {review.unpriced.length - 20} more</li>}
                    </ul>
                  )}
                </div>
              )}

              {warns > 0 && (
                <div className="p-3 rounded-[12px] bg-amber-50 border border-amber-200 text-[13px] text-amber-900">
                  <div className="font-bold flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={14} /> {warns} warning(s)
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ackWarnings}
                      onChange={(e) => setAckWarnings(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>I reviewed the warnings and want to publish anyway.</span>
                  </label>
                </div>
              )}

              <div className="border border-[#E9E3DD] rounded-[12px] overflow-hidden">
                <div className="max-h-[320px] overflow-auto divide-y divide-[#E9E3DD]">
                  {review.diffs.slice(0, 200).map((d) => {
                    const hasBlock = d.guardrails.some((g) => g.severity === 'block');
                    const hasWarn = d.guardrails.some((g) => g.severity === 'warn');
                    return (
                      <div
                        key={`${d.productId}:${d.priceListId}`}
                        className={cn(
                          'p-3 text-[12px]',
                          hasBlock && 'bg-red-50/80',
                          !hasBlock && hasWarn && 'bg-amber-50/50',
                        )}
                      >
                        <div className="font-semibold text-[#181725] truncate">{d.productName}</div>
                        <div className="text-[#7C7C7C]">{d.listName} · {d.sku || '—'}</div>
                        <div className="tabular-nums mt-1 text-[#181725]">
                          {inr(d.previousEffective)} → {d.newEffective != null ? inr(d.newEffective) : 'Base'}
                          <span className="text-[#7C7C7C] ml-2 capitalize">({d.kind})</span>
                        </div>
                        {d.guardrails.map((g) => (
                          <div
                            key={g.code}
                            className={cn(
                              'mt-1 text-[11px]',
                              g.severity === 'block' ? 'text-red-700' : 'text-amber-800',
                            )}
                          >
                            {g.message}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                {review.diffs.length > 200 && (
                  <p className="p-2 text-[11px] text-[#7C7C7C] bg-[#FAF7F2]">
                    Showing first 200 of {review.diffs.length} changes.
                  </p>
                )}
              </div>

              {lastPublishId && (
                <p className="text-[11px] text-[#7C7C7C]">
                  Last publish id: {lastPublishId.slice(0, 8)}… — roll back from History tab if needed.
                </p>
              )}
            </>
          ) : null}
        </div>

        <div className="p-4 border-t border-[#E9E3DD] flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-[12px] border border-[#E9E3DD] font-semibold text-[#181725]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canPublish || publishing}
            onClick={() => void publish()}
            className="flex-1 h-11 rounded-[12px] bg-primary text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {publishing ? <Loader2 size={16} className="animate-spin" /> : null}
            Publish
          </button>
        </div>
      </div>
    </div>
  );
}
