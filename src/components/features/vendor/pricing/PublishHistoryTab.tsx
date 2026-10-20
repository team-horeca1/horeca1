'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Loader2, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { inr } from './types';

type PublishSummary = {
  priced?: number;
  base?: number;
  removed?: number;
  restored?: number;
  customersAffected?: number;
  rollbackOf?: string;
};

type PublishChange = {
  productId: string;
  priceListId: string;
  productName: string;
  sku: string | null;
  listName: string;
  beforePrice: number | null;
  afterPrice: number | null;
  beforeExcluded: boolean;
  afterExcluded: boolean;
};

type PublishRow = {
  id: string;
  kind: string;
  summary: PublishSummary | string | null;
  cellCount: number;
  createdAt: string;
  actor: { id: string; name: string } | null;
  rollbackOfId: string | null;
  changes?: PublishChange[];
};

function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : pluralForm ?? `${singular}s`}`;
}

function publishTitle(r: PublishRow): string {
  if (r.kind === 'rollback') return 'Rolled back a publish';
  if (r.kind === 'publish') return 'Published price updates';
  return r.kind.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function formatSummary(summary: PublishRow['summary']): string | null {
  if (!summary) return null;
  if (typeof summary === 'string') return summary;
  const parts: string[] = [];
  if (typeof summary.priced === 'number' && summary.priced > 0) parts.push(`${summary.priced} priced`);
  if (typeof summary.base === 'number' && summary.base > 0) parts.push(`${summary.base} back to Base`);
  if (typeof summary.removed === 'number' && summary.removed > 0) parts.push(`${summary.removed} hidden`);
  if (typeof summary.restored === 'number' && summary.restored > 0) parts.push(`${summary.restored} restored`);
  if (typeof summary.customersAffected === 'number' && summary.customersAffected > 0) {
    parts.push(plural(summary.customersAffected, 'customer') + ' affected');
  }
  return parts.length ? parts.join(' · ') : null;
}

function changeLabel(ch: PublishChange): string {
  if (!ch.beforeExcluded && ch.afterExcluded) return 'Hidden from customers';
  if (ch.beforeExcluded && !ch.afterExcluded) return 'Restored';
  if (ch.beforePrice === null && ch.afterPrice !== null) return 'Custom price set';
  if (ch.afterPrice === null) return 'Back to Base price';
  return 'Price changed';
}

interface Props {
  onRollbackDone?: () => void;
}

export function PublishHistoryTab({ onRollbackDone }: Props) {
  const [rows, setRows] = useState<PublishRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmRollback, setConfirmRollback] = useState<PublishRow | null>(null);

  const load = useCallback(async (cursor?: string | null, append = false) => {
    if (!append) setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '30' });
      if (cursor) qs.set('cursor', cursor);
      const res = await fetch(`/api/v1/vendor/price-lists/publishes?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to load history');
      const data = json.data as { publishes: PublishRow[]; nextCursor: string | null };
      setRows((prev) => (append ? [...prev, ...data.publishes] : data.publishes));
      setNextCursor(data.nextCursor);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(null, false);
  }, [load]);

  const rollback = async (row: PublishRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/v1/vendor/price-lists/publishes/${row.id}/rollback`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Rollback failed');
      toast.success(`Rolled back · ${plural(json.data?.restored ?? 0, 'price')} restored`);
      setConfirmRollback(null);
      void load(null, false);
      onRollbackDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rollback failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-[#7C7C7C] gap-2">
        <Loader2 size={20} className="animate-spin" /> Loading publish history…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-[#7C7C7C] text-[14px] space-y-1">
        <p className="font-semibold text-[#181725]">Nothing published yet</p>
        <p>When you Review &amp; publish price changes on the Prices tab, each publish will appear here — and you can undo it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[#7C7C7C]">Every publish is saved. Expand any entry to see exactly what changed, or roll it back to restore the previous prices.</p>
      {rows.map((r) => {
        const expanded = expandedId === r.id;
        const hasChanges = (r.changes?.length ?? 0) > 0;
        return (
          <div key={r.id} className="rounded-[12px] border border-[#E9E3DD] bg-white overflow-hidden">
            <div className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[#181725]">{publishTitle(r)}</div>
                <div className="text-[12px] text-[#7C7C7C] mt-0.5">
                  {new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  {r.actor?.name && ` · by ${r.actor.name}`}
                  <span className="tabular-nums"> · {r.cellCount === 0 ? 'No price cells changed' : plural(r.cellCount, 'price changed', 'prices changed')}</span>
                </div>
                {formatSummary(r.summary) && (
                  <p className="text-[12px] text-[#181725] mt-1">{formatSummary(r.summary)}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasChanges && (
                  <button type="button" onClick={() => setExpandedId(expanded ? null : r.id)} className="h-10 px-3 rounded-[12px] border border-[#E9E3DD] font-semibold text-[13px] flex items-center gap-1.5 hover:bg-[#FAF7F2]" aria-expanded={expanded}>
                    {expanded ? 'Hide details' : 'View details'} <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} />
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === r.id || r.kind === 'rollback'}
                  onClick={() => setConfirmRollback(r)}
                  title={r.kind === 'rollback' ? 'A rollback cannot itself be rolled back' : 'Undo this publish'}
                  className="h-10 px-4 rounded-[12px] border border-[#E9E3DD] font-semibold text-[13px] flex items-center gap-2 hover:bg-[#FAF7F2] disabled:opacity-50"
                >
                  {busyId === r.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Roll back
                </button>
              </div>
            </div>
            {expanded && hasChanges && (
              <div className="border-t border-[#E9E3DD] divide-y divide-[#E9E3DD] max-h-[320px] overflow-auto">
                {r.changes!.map((ch, i) => (
                  <div key={`${ch.productId}:${ch.priceListId}:${i}`} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px]">
                    <div className="min-w-0">
                      <span className="font-semibold text-[#181725]">{ch.productName}</span>
                      <span className="text-[#7C7C7C]"> · {ch.listName}{ch.sku ? ` · ${ch.sku}` : ''}</span>
                    </div>
                    <div className="tabular-nums font-semibold text-[#181725]">
                      {ch.beforeExcluded ? 'Hidden' : ch.beforePrice !== null ? inr(ch.beforePrice) : 'Base'} → {ch.afterExcluded ? 'Hidden' : ch.afterPrice !== null ? inr(ch.afterPrice) : 'Base'}
                      <span className="ml-2 text-[11px] font-semibold text-primary">{changeLabel(ch)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {nextCursor && (
        <button type="button" onClick={() => void load(nextCursor, true)} className="w-full h-11 rounded-[12px] border border-[#E9E3DD] font-semibold text-[#181725] bg-white">
          Load more history
        </button>
      )}

      {confirmRollback && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmRollback(null)} aria-hidden />
          <div className="relative bg-white rounded-[16px] shadow-xl w-full max-w-md p-6 space-y-3" role="dialog" aria-label="Confirm rollback">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-bold text-[#181725] text-[16px]">Roll back this publish?</h3>
              <button type="button" onClick={() => setConfirmRollback(null)} className="p-1 rounded-lg hover:bg-[#FAF7F2]" aria-label="Close"><X size={17} /></button>
            </div>
            <p className="text-[13px] text-[#7C7C7C]">
              Prices from <strong className="text-[#181725]">{publishTitle(confirmRollback)}</strong> ({new Date(confirmRollback.createdAt).toLocaleString('en-IN')}) will return to exactly what they were before it — {plural(confirmRollback.cellCount, 'price')} affected. This creates a new history entry, so nothing is lost.
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setConfirmRollback(null)} className="flex-1 h-11 rounded-[12px] border border-[#E9E3DD] font-semibold">Keep current prices</button>
              <button type="button" disabled={busyId === confirmRollback.id} onClick={() => void rollback(confirmRollback)} className="flex-1 h-11 rounded-[12px] bg-primary text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                {busyId === confirmRollback.id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Yes, roll back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
