'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { GitMerge, Search, Loader2, Package, ArrowRight, CheckCircle2, Clock, Ban, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';

type AuthStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface BrandStoreCard {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  authStatus: AuthStatus;
  catalogSize: number;
  mappedCount: number;
}

const AUTH_BADGE: Record<AuthStatus, { label: string; className: string; icon: React.ReactNode }> = {
  none: {
    label: 'Not requested',
    className: 'bg-gray-100 text-gray-600',
    icon: <CircleDashed size={11} />,
  },
  pending: {
    label: 'Pending approval',
    className: 'bg-amber-50 text-amber-700',
    icon: <Clock size={11} />,
  },
  approved: {
    label: 'Approved',
    className: 'bg-primary-light text-primary',
    icon: <CheckCircle2 size={11} />,
  },
  rejected: {
    label: 'Unlinked',
    className: 'bg-red-50 text-red-600',
    icon: <Ban size={11} />,
  },
};

export default function VendorBrandMappingsIndexPage() {
  const [brands, setBrands] = useState<BrandStoreCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/v1/vendor/brand-mappings?view=stores');
      const j = await r.json();
      if (j.success) setBrands(j.data.brands ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q));
  }, [brands, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.125rem,2vw+0.5rem,1.375rem)] font-black text-[#181725] flex items-center gap-2">
            <GitMerge size={20} className="text-primary" />
            Brand Mappings
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Browse brand catalogs and map your SKUs. First mapping requests distributor approval.
          </p>
        </div>
        <div className="relative w-full sm:w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brands…"
            className="w-full h-10 pl-9 pr-3 border border-gray-200 rounded-xl text-[13px] bg-white outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {brands.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4 bg-white rounded-[14px] border border-[#EEEEEE]">
          <Package size={36} className="text-gray-200 mb-3" />
          <h2 className="text-[16px] font-bold text-[#181725]">No brands available</h2>
          <p className="text-[13px] text-gray-500 mt-1 max-w-sm">
            There are no approved brands to map yet. Check back once brands join the platform.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[30vh] text-center px-4 bg-white rounded-[14px] border border-[#EEEEEE]">
          <Search size={28} className="text-gray-200 mb-3" />
          <p className="text-[14px] font-bold text-gray-500">No brands match “{search.trim()}”</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((brand) => {
            const badge = AUTH_BADGE[brand.authStatus] ?? AUTH_BADGE.none;
            const progress =
              brand.catalogSize > 0
                ? Math.min(100, Math.round((brand.mappedCount / brand.catalogSize) * 100))
                : 0;

            return (
              <Link
                key={brand.id}
                href={`/vendor/brand-mappings/${brand.id}`}
                className="group bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5 flex flex-col gap-4 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="relative w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
                    {brand.logoUrl ? (
                      <Image src={brand.logoUrl} alt={brand.name} fill sizes="48px" className="object-contain p-1" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={18} className="text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-[#181725] truncate group-hover:text-primary transition-colors">
                      {brand.name}
                    </p>
                    <p className="text-[12px] text-gray-400 mt-0.5">
                      {brand.catalogSize} SKU{brand.catalogSize === 1 ? '' : 's'} in catalog
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-1"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[12px] mb-1.5">
                    <span className="font-semibold text-gray-600">
                      {brand.mappedCount} of {brand.catalogSize} mapped
                    </span>
                    <span className="text-gray-400">{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={cn(
                        'h-full w-full rounded-full transition-transform origin-left',
                        progress === 100 ? 'bg-primary' : progress > 0 ? 'bg-primary' : 'bg-transparent',
                      )}
                      style={{ transform: `scaleX(${progress / 100})` }}
                    />
                  </div>
                </div>

                <span
                  className={cn(
                    'inline-flex items-center gap-1 self-start text-[11px] font-bold px-2 py-1 rounded-md',
                    badge.className,
                  )}
                >
                  {badge.icon}
                  {badge.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
