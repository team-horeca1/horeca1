'use client';

// AlternateVendorsStrip
// Shown on a PDP when the active product is out of stock. Fetches up to 3
// alternate vendors (same category / name match) with stock available and
// renders them as a horizontal-scroll strip.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Store, ArrowRight } from 'lucide-react';

interface AlternateVendor {
  id: string;
  name: string;
  vendor: { id: string; businessName: string; minOrderValue: number | string } | null;
  inventory?: { qtyAvailable: number } | null;
  category: { id: string; name: string } | null;
}

interface ApiResponse {
  success: boolean;
  data?: { alternates: AlternateVendor[] };
}

interface Props {
  productId: string;
}

// Deterministic colour per vendor name so initials stay stable across renders.
const PALETTE = [
  'bg-emerald-100 text-emerald-700',
  'bg-blue-100 text-blue-700',
  'bg-orange-100 text-orange-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-amber-100 text-amber-700',
];

function colourFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function AlternateVendorsStrip({ productId }: Props) {
  const [alternates, setAlternates] = useState<AlternateVendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => setLoading(true));
    fetch(`/api/v1/products/${productId}/alternates`)
      .then(r => r.json() as Promise<ApiResponse>)
      .then(json => {
        if (cancelled) return;
        if (json.success && json.data?.alternates) setAlternates(json.data.alternates);
      })
      .catch(() => { /* silent — strip simply won't render */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  if (loading) return null;
  if (alternates.length === 0) return null;

  return (
    <section className="my-6 px-4 md:px-0">
      <div className="flex items-center gap-2 mb-4">
        <Store size={18} className="text-[#53B175]" />
        <h2 className="text-[18px] md:text-[20px] font-extrabold text-[#181725] tracking-tight">
          Also Available From
        </h2>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x">
        {alternates.map(alt => {
          const vendor = alt.vendor;
          if (!vendor) return null;
          const initial = vendor.businessName?.charAt(0).toUpperCase() || 'V';
          const colour = colourFor(vendor.businessName || vendor.id);
          const qty = alt.inventory?.qtyAvailable ?? 0;
          const mov = Number(vendor.minOrderValue) || 0;

          return (
            <Link
              key={alt.id}
              href={`/vendor/${vendor.id}`}
              className="shrink-0 w-[260px] snap-start rounded-2xl border border-gray-100 bg-white p-4 hover:shadow-md hover:-translate-y-0.5 transition-all group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-[18px] font-black ${colour}`}>
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-extrabold text-[#181725] truncate">
                    {vendor.businessName}
                  </p>
                  {alt.category && (
                    <p className="text-[11px] font-semibold text-[#7C7C7C] truncate uppercase tracking-wider">
                      {alt.category.name}
                    </p>
                  )}
                </div>
                <ArrowRight
                  size={18}
                  className="text-[#7C7C7C] group-hover:text-[#53B175] group-hover:translate-x-0.5 transition-all shrink-0"
                />
              </div>

              <div className="flex items-center justify-between text-[12px] pt-3 border-t border-gray-50">
                <span className="font-bold text-[#53B175]">
                  {qty} in stock
                </span>
                <span className="font-semibold text-[#7C7C7C]">
                  Min ₹{mov}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
