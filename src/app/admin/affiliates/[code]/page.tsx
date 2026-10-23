'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, ExternalLink, Loader2 } from 'lucide-react';
import {
  AdminRegistryPageHeader,
  AdminRegistryTableBody,
  AdminRegistryTableHead,
  AdminRegistryTableShell,
  AdminStatusBadge,
} from '@/components/features/admin/entity';
import {
  affiliateAccountTypeLabel,
  affiliateDetailHref,
  type AffiliateAccountType,
} from '@/modules/registration/registrationExportFormat';

interface AffiliatePerson {
  accountId: string;
  businessName: string;
  mobile: string | null;
  email: string | null;
  createdAt: string;
  accountType: AffiliateAccountType;
  gstin: string | null;
  fssai: string | null;
  liveProductCount: number | null;
  referralCode: string | null;
  userId?: string | null;
  vendorId?: string | null;
  brandId?: string | null;
}

const TYPE_BADGE: Record<AffiliateAccountType, 'active' | 'pending' | 'verified'> = {
  customer: 'active',
  vendor: 'pending',
  brand: 'verified',
};

export default function AdminAffiliateCodePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = decodeURIComponent(params.code ?? '');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<AffiliatePerson[]>([]);

  useEffect(() => {
    const query = new URLSearchParams({ code });
    if (kind) query.set('kind', kind);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (q.trim()) query.set('q', q.trim());
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });
    fetch(`/api/v1/admin/affiliates?${query.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || 'Could not load registrations');
        if (!cancelled) setRows(json.data.rows ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load registrations');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [code, kind, from, to, q]);

  const counts = useMemo(() => ({
    customers: rows.filter((r) => r.accountType === 'customer').length,
    suppliers: rows.filter((r) => r.accountType === 'vendor').length,
    brands: rows.filter((r) => r.accountType === 'brand').length,
  }), [rows]);

  function exportHref(format: 'csv' | 'xlsx') {
    const query = new URLSearchParams({ code, format });
    if (kind) query.set('kind', kind);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (q.trim()) query.set('q', q.trim());
    return `/api/v1/admin/affiliates/export?${query.toString()}`;
  }

  function openDetail(row: AffiliatePerson) {
    const href = affiliateDetailHref(row);
    if (href) router.push(href);
  }

  return (
    <div className="space-y-6 pb-10 px-4 md:px-0">
      <Link href="/admin/affiliates" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#667085] hover:text-[#6B1D2E]">
        <ArrowLeft size={14} /> All affiliate codes
      </Link>
      <AdminRegistryPageHeader
        title={code}
        subtitle="Registrations attributed to this affiliate link"
        actions={
          <>
            <button
              type="button"
              onClick={() => { window.location.assign(exportHref('csv')); }}
              className="h-12 px-4 bg-white border border-[#E5E7EB] hover:bg-gray-50 text-[#374151] rounded-[12px] text-[13px] font-bold flex items-center gap-2"
            >
              <Download size={16} /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => { window.location.assign(exportHref('xlsx')); }}
              className="h-12 px-4 bg-[#6B1D2E] text-white rounded-[12px] text-[13px] font-bold flex items-center gap-2 hover:bg-[#5A1926]"
            >
              <Download size={16} /> Export Excel
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: rows.length },
          { label: 'Customers', value: counts.customers },
          { label: 'Suppliers', value: counts.suppliers },
          { label: 'Brands', value: counts.brands },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[16px] border border-[#E9E3DD] bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">{stat.label}</p>
            <p className="mt-1 text-[22px] font-bold tabular-nums text-[#1C1C1C]">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search name, mobile, email"
          className="h-11 px-3 rounded-[12px] border border-[#E9E3DD] text-[13px] min-w-[220px]"
        />
        <select value={kind} onChange={(event) => setKind(event.target.value)} className="h-11 px-3 rounded-[12px] border border-[#E9E3DD] text-[13px] bg-white">
          <option value="">All account types</option>
          <option value="customer">Customers</option>
          <option value="vendor">Suppliers</option>
          <option value="brand">Brands</option>
        </select>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From date" className="h-11 px-3 rounded-[12px] border border-[#E9E3DD] text-[13px]" />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To date" className="h-11 px-3 rounded-[12px] border border-[#E9E3DD] text-[13px]" />
      </div>
      {error ? <p className="text-[13px] font-semibold text-[#DC2626]">{error}</p> : null}
      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[#667085]"><Loader2 className="animate-spin" size={16} /> Loading registrations...</div>
      ) : (
        <AdminRegistryTableShell minWidth="960px">
          <AdminRegistryTableHead>
            <th className="px-4 py-3 whitespace-nowrap">Business</th>
            <th className="px-4 py-3 whitespace-nowrap">Type</th>
            <th className="px-4 py-3 whitespace-nowrap">Mobile</th>
            <th className="px-4 py-3 whitespace-nowrap">Email</th>
            <th className="px-4 py-3 whitespace-nowrap">Registered</th>
            <th className="px-4 py-3 whitespace-nowrap">GSTIN</th>
            <th className="px-4 py-3 whitespace-nowrap">FSSAI</th>
            <th className="px-4 py-3 whitespace-nowrap">Live products</th>
            <th className="px-4 py-3 whitespace-nowrap text-right">Open</th>
          </AdminRegistryTableHead>
          <AdminRegistryTableBody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-[#667085]">No registrations for this code.</td>
              </tr>
            ) : rows.map((row) => {
              const href = affiliateDetailHref(row);
              return (
                <tr
                  key={row.accountId}
                  className={href ? 'hover:bg-[#FAF7F2] cursor-pointer transition-colors' : undefined}
                  onClick={() => openDetail(row)}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && href) {
                      event.preventDefault();
                      openDetail(row);
                    }
                  }}
                  tabIndex={href ? 0 : undefined}
                  role={href ? 'link' : undefined}
                >
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-[#1C1C1C]">{row.businessName}</div>
                    <div className="text-[11px] text-[#667085] font-mono">{row.accountId.slice(0, 8)}…</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <AdminStatusBadge variant={TYPE_BADGE[row.accountType]} label={affiliateAccountTypeLabel(row.accountType)} />
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap tabular-nums">{row.mobile || '—'}</td>
                  <td className="px-4 py-3.5 max-w-[200px] truncate">{row.email || '—'}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap tabular-nums text-[#667085]">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[12px]">{row.gstin || '—'}</td>
                  <td className="px-4 py-3.5 font-mono text-[12px]">{row.fssai || '—'}</td>
                  <td className="px-4 py-3.5 tabular-nums">
                    {row.accountType === 'customer' ? '—' : row.liveProductCount ?? 0}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {href ? (
                      <Link
                        href={href}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#6B1D2E] hover:underline"
                      >
                        Detail <ExternalLink size={12} />
                      </Link>
                    ) : (
                      <span className="text-[12px] text-[#667085]">—</span>
                    )}
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
