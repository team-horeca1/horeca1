'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';

export interface DistributorMappedProductsModalProps {
  vendorId: string;
  vendorName: string;
  authStatus: 'pending' | 'approved';
  onClose: () => void;
  onApprove?: () => void;
  onUnlink?: () => void;
  busy?: boolean;
}

interface ProductLink {
  mappingId: string;
  status: string;
  distributorProductId: string;
  distributorProductName: string;
  distributorPackSize: string | null;
}

interface MasterRow {
  id: string;
  name: string;
  sku: string | null;
  packSize: string | null;
  unit: string | null;
  imageUrl: string | null;
  link: ProductLink | null;
}

interface StoreHit {
  id: string;
  name: string;
  packSize: string | null;
  imageUrl: string | null;
}

function meta(sku: string | null, packSize: string | null, unit: string | null): string {
  return [sku ? `SKU ${sku}` : null, [packSize, unit].filter(Boolean).join(' ').trim() || null]
    .filter(Boolean)
    .join(' · ');
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
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryByMaster, setQueryByMaster] = useState<Record<string, string>>({});
  const [hitsByMaster, setHitsByMaster] = useState<Record<string, StoreHit[]>>({});
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/brand/product-links?vendorId=${encodeURIComponent(vendorId)}`);
      const json = (await res.json()) as {
        success?: boolean;
        data?: { masters?: MasterRow[] };
        error?: { message?: string };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Failed to load products');
      }
      setRows(json.data?.masters ?? []);
    } catch (e: unknown) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const search = async (masterId: string, q: string) => {
    setSearchingId(masterId);
    try {
      const params = new URLSearchParams({ vendorId, search: '1', q });
      const res = await fetch(`/api/v1/brand/product-links?${params.toString()}`);
      const json = (await res.json()) as { success?: boolean; data?: { products?: StoreHit[] } };
      if (res.ok && json.success) {
        setHitsByMaster((prev) => ({ ...prev, [masterId]: json.data?.products ?? [] }));
      }
    } finally {
      setSearchingId(null);
    }
  };

  const link = async (masterId: string, productId: string) => {
    setLinkingId(masterId);
    setError(null);
    try {
      const res = await fetch('/api/v1/brand/product-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, masterProductId: masterId, distributorProductId: productId }),
      });
      const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Could not link this product');
      }
      setHitsByMaster((prev) => ({ ...prev, [masterId]: [] }));
      setQueryByMaster((prev) => ({ ...prev, [masterId]: '' }));
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not link this product');
    } finally {
      setLinkingId(null);
    }
  };

  const isPending = authStatus === 'pending';
  const linkedCount = rows.filter((row) => row.link?.status === 'verified').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mapped-products-title"
        className="bg-white rounded-2xl w-full max-w-3xl shadow-xl max-h-[min(90vh,760px)] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE] shrink-0">
          <div className="min-w-0 pr-3">
            <h2 id="mapped-products-title" className="text-[16px] font-bold text-[#181725] truncate">
              {vendorName}
            </h2>
            <p className="text-[12px] text-[#667085] mt-0.5">
              Search this store for each of your products. Linked products stay green.
              {rows.length > 0 ? ` ${linkedCount} of ${rows.length} linked.` : ''}
            </p>
          </div>
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
          {loading && rows.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 size={22} className="animate-spin text-primary" />
            </div>
          ) : error && rows.length === 0 ? (
            <p className="text-[13px] text-red-600 text-center py-10">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-[13px] text-gray-400 text-center py-10">No brand products yet.</p>
          ) : (
            <ul className="space-y-3">
              {error && <li className="text-[13px] text-red-600">{error}</li>}
              {rows.map((row) => {
                const linked = row.link?.status === 'verified';
                const hits = hitsByMaster[row.id] ?? [];
                return (
                  <li
                    key={row.id}
                    className={`rounded-xl border px-4 py-3 ${linked ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-[#181725] leading-tight">{row.name}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{meta(row.sku, row.packSize, row.unit) || '—'}</p>
                      </div>
                      {linked && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border border-green-200 bg-white text-green-700 shrink-0">
                          <Check size={12} /> Linked
                        </span>
                      )}
                    </div>
                    {row.link && (
                      <p className={`text-[12px] mt-2 ${linked ? 'text-green-800' : 'text-[#374151]'}`}>
                        Store product: {row.link.distributorProductName}
                        {row.link.distributorPackSize ? ` · ${row.link.distributorPackSize}` : ''}
                      </p>
                    )}
                    <div className="relative mt-2">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={queryByMaster[row.id] ?? ''}
                        onChange={(e) => {
                          const q = e.target.value;
                          setQueryByMaster((prev) => ({ ...prev, [row.id]: q }));
                          if (q.trim().length >= 2) void search(row.id, q.trim());
                          else setHitsByMaster((prev) => ({ ...prev, [row.id]: [] }));
                        }}
                        placeholder="Search this store's products"
                        className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-[#6B1D2E]"
                      />
                      {searchingId === row.id && (
                        <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
                      )}
                    </div>
                    {hits.length > 0 && (
                      <ul className="mt-2 border border-gray-100 rounded-lg overflow-hidden">
                        {hits.map((hit) => (
                          <li key={hit.id}>
                            <button
                              type="button"
                              disabled={linkingId === row.id}
                              onClick={() => void link(row.id, hit.id)}
                              className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F8E8EC] disabled:opacity-50"
                            >
                              <span className="font-semibold text-[#181725]">{hit.name}</span>
                              {hit.packSize ? <span className="text-gray-500"> · {hit.packSize}</span> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
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
                className="h-[36px] px-4 bg-primary text-white rounded-lg text-[13px] font-bold hover:bg-primary-dark disabled:opacity-50 flex items-center gap-1.5"
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
