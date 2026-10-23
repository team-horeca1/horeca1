'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Share2, Users } from 'lucide-react';
import {
  AdminRegistryEmptyState,
  AdminRegistryFilterBar,
  AdminRegistryLoadingState,
  AdminRegistryPageHeader,
  AdminRegistryStatsGrid,
  AdminRegistryTableBody,
  AdminRegistryTableHead,
  AdminRegistryTableShell,
} from '@/components/features/admin/entity';

interface AffiliateCodeRow {
  code: string;
  customers: number;
  suppliers: number;
  brands: number;
}

export default function AdminAffiliatesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [codesTracked, setCodesTracked] = useState(0);
  const [codes, setCodes] = useState<AffiliateCodeRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/admin/affiliates', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || 'Could not load affiliates');
        if (cancelled) return;
        setTotal(json.data.totalRegistrations ?? 0);
        setCodesTracked(json.data.codesTracked ?? 0);
        setCodes(json.data.codes ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load affiliates');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return codes;
    return codes.filter((row) => row.code.includes(q));
  }, [codes, search]);

  if (loading) return <AdminRegistryLoadingState message="Loading affiliates..." />;

  return (
    <div className="space-y-8 pb-10 px-4 md:px-0">
      <AdminRegistryPageHeader
        title="Affiliates"
        subtitle="Referral codes captured from affiliate links, and who registered with each code"
      />
      {error ? <p className="text-[13px] font-semibold text-[#DC2626]">{error}</p> : null}
      <AdminRegistryStatsGrid
        stats={[
          { label: 'Referred registrations', value: total, icon: Users, iconBg: 'bg-[#F8E8EC]', iconColor: 'text-[#6B1D2E]' },
          { label: 'Affiliate codes tracked', value: codesTracked, icon: Share2, iconBg: 'bg-[#EFF6FF]', iconColor: 'text-[#2563EB]' },
        ]}
      />
      <AdminRegistryFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search referral code..."
      />
      {visible.length === 0 ? (
        <AdminRegistryEmptyState
          icon={Share2}
          title="No referral codes yet"
          subtitle="Codes appear here after someone registers through an affiliate link."
        />
      ) : (
        <AdminRegistryTableShell minWidth="720px">
          <AdminRegistryTableHead>
            <th className="px-4 py-3">Referral code</th>
            <th className="px-4 py-3 tabular-nums text-right">Customers</th>
            <th className="px-4 py-3 tabular-nums text-right">Suppliers</th>
            <th className="px-4 py-3 tabular-nums text-right">Brands</th>
            <th className="px-4 py-3 tabular-nums text-right">Total</th>
            <th className="px-4 py-3" />
          </AdminRegistryTableHead>
          <AdminRegistryTableBody>
            {visible.map((row) => {
              const totalForCode = row.customers + row.suppliers + row.brands;
              return (
                <tr key={row.code} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/admin/affiliates/${encodeURIComponent(row.code)}`}
                      className="inline-flex items-center gap-2 font-bold text-[#6B1D2E] hover:underline"
                    >
                      <span className="font-mono tracking-wide">{row.code}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-right font-semibold text-[#1C1C1C]">{row.customers}</td>
                  <td className="px-4 py-3.5 tabular-nums text-right font-semibold text-[#1C1C1C]">{row.suppliers}</td>
                  <td className="px-4 py-3.5 tabular-nums text-right font-semibold text-[#1C1C1C]">{row.brands}</td>
                  <td className="px-4 py-3.5 tabular-nums text-right font-bold text-[#6B1D2E]">{totalForCode}</td>
                  <td className="px-4 py-3.5 text-right">
                    <Link
                      href={`/admin/affiliates/${encodeURIComponent(row.code)}`}
                      className="inline-flex items-center gap-1 text-[12px] font-bold text-[#667085] hover:text-[#6B1D2E]"
                    >
                      View <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </AdminRegistryTableBody>
        </AdminRegistryTableShell>
      )}
    </div>
  );
}
