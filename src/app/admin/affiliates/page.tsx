'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Share2, Users } from 'lucide-react';
import {
  AdminRegistryFilterBar,
  AdminRegistryLoadingState,
  AdminRegistryPageHeader,
  AdminRegistryStatsGrid,
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
      <div className="bg-white rounded-[16px] border border-[#E9E3DD] overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-[#FAF7F2] text-[#667085]">
            <tr>
              <th className="px-4 py-3 font-semibold">Referral code</th>
              <th className="px-4 py-3 font-semibold tabular-nums">Customers</th>
              <th className="px-4 py-3 font-semibold tabular-nums">Suppliers</th>
              <th className="px-4 py-3 font-semibold tabular-nums">Brands</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[#667085]">No referral codes yet.</td>
              </tr>
            ) : visible.map((row) => (
              <tr key={row.code} className="border-t border-[#E9E3DD]">
                <td className="px-4 py-3">
                  <Link href={`/admin/affiliates/${encodeURIComponent(row.code)}`} className="font-semibold text-[#6B1D2E] hover:underline">
                    {row.code}
                  </Link>
                </td>
                <td className="px-4 py-3 tabular-nums">{row.customers}</td>
                <td className="px-4 py-3 tabular-nums">{row.suppliers}</td>
                <td className="px-4 py-3 tabular-nums">{row.brands}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
