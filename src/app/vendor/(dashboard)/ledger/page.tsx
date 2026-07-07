'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { BookOpen, Download, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EarningsBreakdown } from '@/components/features/vendor/finance/EarningsBreakdown';

type LedgerFilter = 'all' | 'earnings' | 'refunds' | 'settlements' | 'credit';

interface LedgerEntry {
  id: string;
  date: string;
  type: 'earnings' | 'refund' | 'settlement' | 'adjustment' | 'credit_debit' | 'credit_payment';
  description: string;
  referenceNumber: string | null;
  gross: number | null;
  platformFee: number | null;
  gatewayFee: number | null;
  credit: number;
  debit: number;
  balance: number;
}

interface Pagination {
  page: number;
  take: number;
  total: number;
  totalPages: number;
}

const TYPE_LABELS: Record<LedgerEntry['type'], string> = {
  earnings: 'Earnings',
  refund: 'Refund',
  settlement: 'Settlement',
  adjustment: 'Adjustment',
  credit_debit: 'Credit Issued',
  credit_payment: 'Credit Paid',
};

const TYPE_COLORS: Record<LedgerEntry['type'], string> = {
  earnings: 'bg-[#EEF8F1] text-[#299E60]',
  refund: 'bg-[#FFF0F0] text-[#E74C3C]',
  settlement: 'bg-purple-50 text-purple-600',
  adjustment: 'bg-blue-50 text-blue-600',
  credit_debit: 'bg-amber-50 text-amber-600',
  credit_payment: 'bg-[#EEF8F1] text-[#299E60]',
};

const FILTERS: { id: LedgerFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'settlements', label: 'Settlements' },
  { id: 'credit', label: 'Credit receivables' },
];

export default function VendorLedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [summary, setSummary] = useState({
    walletBalance: 0,
    pendingAmount: 0,
    monthGross: 0,
    monthPlatformFees: 0,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLedger = useCallback(async (p: number, fromDate: string, toDate: string, f: LedgerFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), filter: f });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await fetch(`/api/v1/vendor/ledger?${params}`);
      const json = await res.json();
      if (json.success) {
        setEntries(json.data.entries);
        setPagination(json.data.pagination);
        setSummary(json.data.summary);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLedger(page, from, to, filter); }, [fetchLedger, page, from, to, filter]);

  const downloadCsv = () => {
    const header = ['Date', 'Type', 'Description', 'Reference', 'Gross (₹)', 'Platform Fee (₹)', 'Gateway (₹)', 'Credit (₹)', 'Debit (₹)', 'Balance (₹)'];
    const rows = entries.map((e) => [
      new Date(e.date).toLocaleDateString('en-IN'),
      TYPE_LABELS[e.type],
      e.description,
      e.referenceNumber ?? '',
      e.gross != null ? e.gross.toFixed(2) : '',
      e.platformFee != null ? e.platformFee.toFixed(2) : '',
      e.gatewayFee != null ? e.gatewayFee.toFixed(2) : '',
      e.credit > 0 ? e.credit.toFixed(2) : '',
      e.debit > 0 ? e.debit.toFixed(2) : '',
      e.balance.toFixed(2),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-${filter}-${from || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLedger(1, from, to, filter);
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[clamp(1.25rem,2vw+0.5rem,1.5rem)] font-bold text-[#181725]">Ledger</h1>
          <p className="text-[12px] text-[#AEAEAE]">Every rupee — gross, fees, and what you receive</p>
        </div>
        <button
          onClick={downloadCsv}
          disabled={entries.length === 0}
          className="flex items-center gap-2 px-4 h-[36px] rounded-[10px] border border-[#EEEEEE] bg-white text-[12px] font-semibold text-[#7C7C7C] hover:bg-[#F5F5F5] transition-colors disabled:opacity-40"
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-4">
          <p className="text-[11px] text-[#AEAEAE] font-semibold uppercase tracking-wide">Available balance</p>
          <p className="text-[20px] font-bold text-[#299E60] mt-0.5">
            ₹{summary.walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-4">
          <p className="text-[11px] text-[#AEAEAE] font-semibold uppercase tracking-wide">Pending payout</p>
          <p className="text-[20px] font-bold text-amber-500 mt-0.5">
            ₹{summary.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-4">
          <p className="text-[11px] text-[#AEAEAE] font-semibold uppercase tracking-wide">This month gross</p>
          <p className="text-[20px] font-bold text-[#181725] mt-0.5">
            ₹{summary.monthGross.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-4">
          <p className="text-[11px] text-[#AEAEAE] font-semibold uppercase tracking-wide">This month fees</p>
          <p className="text-[20px] font-bold text-[#E74C3C] mt-0.5">
            ₹{summary.monthPlatformFees.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => { setFilter(f.id); setPage(1); }}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors',
              filter === f.id ? 'bg-[#299E60] text-white' : 'bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:bg-[#F5F5F5]',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleFilter} className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[12px] font-semibold text-[#7C7C7C]">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="h-[36px] px-3 rounded-[10px] border border-[#EEEEEE] text-[12px] outline-none focus:border-[#299E60]/40 bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] font-semibold text-[#7C7C7C]">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="h-[36px] px-3 rounded-[10px] border border-[#EEEEEE] text-[12px] outline-none focus:border-[#299E60]/40 bg-white" />
        </div>
        <button type="submit" className="h-[36px] px-4 rounded-[10px] bg-[#299E60] text-white text-[12px] font-bold hover:bg-[#238a54]">
          Apply
        </button>
      </form>

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-[#299E60]" size={28} />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-14 text-center px-6">
            <BookOpen size={36} className="text-[#E5E7EB] mx-auto mb-3" />
            <p className="text-[13px] font-bold text-[#AEAEAE]">No ledger entries yet</p>
            <p className="text-[12px] text-[#AEAEAE] mt-1">Earnings appear when orders are marked delivered</p>
            <Link href="/vendor/wallet" className="inline-block mt-4 text-[12px] font-bold text-[#299E60] hover:underline">
              View wallet →
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#F5F5F5]">
                    <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Reference</th>
                    <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Gross</th>
                    <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Fees</th>
                    <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Net</th>
                    <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5F5]">
                  {entries.map((entry) => {
                    const fees = (entry.platformFee ?? 0) + (entry.gatewayFee ?? 0);
                    const hasBreakdown = entry.type === 'earnings' && entry.gross != null && entry.gross > 0;
                    const isExpanded = expandedId === entry.id;
                    return (
                      <React.Fragment key={entry.id}>
                        <tr
                          className={cn('hover:bg-[#FAFAFA] transition-colors', hasBreakdown && 'cursor-pointer')}
                          onClick={() => hasBreakdown && setExpandedId(isExpanded ? null : entry.id)}
                        >
                          <td className="px-4 py-3 text-[#7C7C7C] whitespace-nowrap">
                            {new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', TYPE_COLORS[entry.type])}>
                              {TYPE_LABELS[entry.type]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#181725] font-mono text-[11px]">{entry.referenceNumber ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-[#7C7C7C]">
                            {entry.gross != null ? `₹${entry.gross.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-[#E74C3C]">
                            {fees > 0 ? `−₹${fees.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-[#299E60]">
                            {entry.credit > 0 ? `+₹${entry.credit.toLocaleString('en-IN')}` : entry.debit > 0 ? `−₹${entry.debit.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-[#181725]">
                            ₹{entry.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                        {isExpanded && hasBreakdown && (
                          <tr>
                            <td colSpan={7} className="px-4 pb-4 bg-[#FAFAFA]">
                              <EarningsBreakdown
                                compact
                                gross={entry.gross!}
                                platformFee={entry.platformFee ?? 0}
                                platformFeePct={entry.gross! > 0 ? Math.round(((entry.platformFee ?? 0) / entry.gross!) * 1000) / 10 : 0}
                                gatewayFee={entry.gatewayFee ?? 0}
                                net={entry.credit}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="px-5 py-3 border-t border-[#F5F5F5] flex items-center justify-between">
                <p className="text-[12px] text-[#AEAEAE]">
                  Page {pagination.page} of {pagination.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-[#EEEEEE] disabled:opacity-40">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-[#EEEEEE] disabled:opacity-40">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
