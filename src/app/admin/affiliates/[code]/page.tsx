'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { AdminRegistryPageHeader } from '@/components/features/admin/entity';

interface AffiliatePerson {
  accountId: string;
  businessName: string;
  mobile: string | null;
  email: string | null;
  createdAt: string;
  accountType: 'customer' | 'vendor' | 'brand';
  gstin: string | null;
  fssai: string | null;
  liveProductCount: number | null;
  referralCode: string | null;
}

const TYPE_LABEL: Record<AffiliatePerson['accountType'], string> = {
  customer: 'Customer',
  vendor: 'Supplier',
  brand: 'Brand',
};

export default function AdminAffiliateCodePage() {
  const params = useParams<{ code: string }>();
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

  function exportHref(format: 'csv' | 'xlsx') {
    const query = new URLSearchParams({ code, format });
    if (kind) query.set('kind', kind);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (q.trim()) query.set('q', q.trim());
    return `/api/v1/admin/affiliates/export?${query.toString()}`;
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
        <div className="bg-white rounded-[16px] border border-[#E9E3DD] overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#FAF7F2] text-[#667085]">
              <tr>
                {['Business', 'Mobile', 'Email', 'Registered', 'Type', 'GSTIN', 'FSSAI', 'Live products', 'Code'].map((label) => (
                  <th key={label} className="px-3 py-3 font-semibold whitespace-nowrap">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-[#667085]">No registrations for this code.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.accountId} className="border-t border-[#E9E3DD]">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-[#111827]">{row.businessName}</div>
                    <div className="text-[11px] text-[#667085]">{row.accountId}</div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{row.mobile || '—'}</td>
                  <td className="px-3 py-3">{row.email || '—'}</td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-3">{TYPE_LABEL[row.accountType]}</td>
                  <td className="px-3 py-3">{row.gstin || '—'}</td>
                  <td className="px-3 py-3">{row.fssai || '—'}</td>
                  <td className="px-3 py-3 tabular-nums">{row.accountType === 'customer' ? '—' : row.liveProductCount ?? 0}</td>
                  <td className="px-3 py-3">{row.referralCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
