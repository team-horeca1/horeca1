'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Check, Loader2, X } from 'lucide-react';
import { mappingStatusLabel, TONE_STYLES } from '@/lib/brandMappingLabels';

export interface DistributorMappedProductsModalProps {
  vendorId: string;
  vendorName: string;
  authStatus: 'pending' | 'approved';
  onClose: () => void;
  onApprove?: () => void;
  onUnlink?: () => void;
  busy?: boolean;
}

interface CoverageRow {
  mappingId: string;
  masterProductId: string;
  masterProductName: string;
  masterPackSize: string | null;
  masterUnit: string | null;
  masterSku: string | null;
  distributorProductId: string;
  distributorProductName: string;
  distributorPackSize: string | null;
  status: string;
}

function formatMasterMeta(row: CoverageRow): string {
  const parts = [
    row.masterSku ? `SKU ${row.masterSku}` : null,
    [row.masterPackSize, row.masterUnit].filter(Boolean).join(' ').trim() || null,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}

function formatDistributorMeta(row: CoverageRow): string {
  return row.distributorPackSize?.trim() || '—';
}

export default function DistributorMappedProductsModal({
  vendorId,
  vendorName,
  authStatus,
  onClose,
  onApprove,
  onUnlink,
  busy = false,
}: DistributorMappedProductsModalProps) {
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/brand/coverage?vendorId=${encodeURIComponent(vendorId)}`);
        const json = (await res.json()) as {
          success?: boolean;
          data?: { rows?: CoverageRow[] };
          error?: { message?: string };
        };
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message ?? 'Failed to load mapped products');
        }
        if (!cancelled) setRows(json.data?.rows ?? []);
      } catch (e: unknown) {
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : 'Failed to load mapped products');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const isPending = authStatus === 'pending';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mapped-products-title"
        className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[min(90vh,720px)] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE] shrink-0">
          <h2 id="mapped-products-title" className="text-[16px] font-bold text-[#181725] truncate pr-3">
            {vendorName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded hover:bg-[#F5F5F5] disabled:opacity-50 shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-[160px]">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={22} className="animate-spin text-[#53B175]" />
            </div>
          ) : error ? (
            <p className="text-[13px] text-red-600 text-center py-10">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-[13px] text-gray-400 text-center py-10">
              No mapped SKUs for this store yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
              {rows.map((row) => {
                const status = mappingStatusLabel(row.status, 'brand');
                const tone = TONE_STYLES[status.tone];
                return (
                  <li key={row.mappingId} className="px-4 py-3">
                    <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">
                          Your product
                        </p>
                        <p className="text-[13px] font-bold text-[#181725] leading-tight">
                          {row.masterProductName}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{formatMasterMeta(row)}</p>
                      </div>

                      <div className="hidden md:flex items-center pt-5 shrink-0">
                        <ArrowRight size={14} className="text-gray-300" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">
                          Store product
                        </p>
                        <p className="text-[13px] font-bold text-[#181725] leading-tight">
                          {row.distributorProductName}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{formatDistributorMeta(row)}</p>
                      </div>

                      <div className="md:pt-5 shrink-0">
                        <span
                          className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-md border ${tone.text} ${tone.bg} ${tone.border}`}
                        >
                          {status.label}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EEEEEE] shrink-0">
          {isPending ? (
            <>
              <button
                type="button"
                onClick={onUnlink}
                disabled={busy || !onUnlink}
                className="h-[36px] px-4 bg-gray-50 text-gray-600 rounded-lg text-[13px] font-bold hover:bg-red-50 hover:text-red-600 disabled:opacity-50 flex items-center gap-1.5"
              >
                <X size={14} />
                Unlink
              </button>
              <button
                type="button"
                onClick={onApprove}
                disabled={busy || !onApprove}
                className="h-[36px] px-4 bg-[#53B175] text-white rounded-lg text-[13px] font-bold hover:bg-[#3d9e5f] disabled:opacity-50 flex items-center gap-1.5"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Approve
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-[36px] px-4 bg-gray-50 text-gray-700 rounded-lg text-[13px] font-bold hover:bg-gray-100 disabled:opacity-50"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
