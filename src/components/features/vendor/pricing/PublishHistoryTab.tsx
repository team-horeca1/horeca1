'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type PublishSummary = {
  priced?: number;
  base?: number;
  removed?: number;
  restored?: number;
  customersAffected?: number;
  rollbackOf?: string;
};

type PublishRow = {
  id: string;
  kind: string;
  summary: PublishSummary | string | null;
  cellCount: number;
  createdAt: string;
  actor: { id: string; name: string } | null;
  rollbackOfId: string | null;
};

function formatSummary(summary: PublishRow['summary']): string | null {
  if (!summary) return null;
  if (typeof summary === 'string') return summary;
  const parts: string[] = [];
  if (typeof summary.priced === 'number' && summary.priced > 0) parts.push(`${summary.priced} priced`);
  if (typeof summary.removed === 'number' && summary.removed > 0) parts.push(`${summary.removed} removed`);
  if (typeof summary.restored === 'number' && summary.restored > 0) parts.push(`${summary.restored} restored`);
  if (typeof summary.customersAffected === 'number' && summary.customersAffected > 0) {
    parts.push(`${summary.customersAffected} customers affected`);
  }
  return parts.length ? parts.join(' · ') : null;
}

interface Props {
  onRollbackDone?: () => void;
}

export function PublishHistoryTab({ onRollbackDone }: Props) {
  const [rows, setRows] = useState<PublishRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const rollback = async (id: string) => {
    if (!confirm('Roll back this publish? Prices revert to the snapshot before this change.')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/vendor/price-lists/publishes/${id}/rollback`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Rollback failed');
      toast.success(`Rolled back · ${json.data?.restored ?? 0} cells restored`);
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
      <div className="py-16 text-center text-[#7C7C7C] text-[14px]">
        No publishes yet. Changes appear here after you publish from the Prices tab.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div
          key={r.id}
          className="p-4 rounded-[12px] border border-[#E9E3DD] bg-white flex flex-wrap items-center justify-between gap-3"
        >
          <div>
            <div className="font-semibold text-[#181725] capitalize">
              {r.kind.replace(/_/g, ' ')}
              {r.rollbackOfId && (
                <span className="text-[12px] font-normal text-[#7C7C7C] ml-2">(rollback)</span>
              )}
            </div>
            <div className="text-[12px] text-[#7C7C7C] mt-0.5">
              {new Date(r.createdAt).toLocaleString('en-IN')}
              {r.actor?.name && ` · ${r.actor.name}`}
              <span className="tabular-nums"> · {r.cellCount} cells</span>
            </div>
            {formatSummary(r.summary) && (
              <p className="text-[12px] text-[#181725] mt-1">{formatSummary(r.summary)}</p>
            )}
          </div>
          <button
            type="button"
            disabled={busyId === r.id || r.kind === 'rollback'}
            onClick={() => void rollback(r.id)}
            className={cn(
              'h-10 px-4 rounded-[12px] border border-[#E9E3DD] font-semibold text-[13px] flex items-center gap-2',
              'hover:bg-[#FAF7F2] disabled:opacity-50',
            )}
          >
            {busyId === r.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Roll back
          </button>
        </div>
      ))}

      {nextCursor && (
        <button
          type="button"
          onClick={() => void load(nextCursor, true)}
          className="w-full h-11 rounded-[12px] border border-[#E9E3DD] font-semibold text-[#181725]"
        >
          Load more
        </button>
      )}
    </div>
  );
}
