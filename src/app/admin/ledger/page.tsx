'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FinanceSummaryStrip } from '@/components/features/finance/FinanceSummaryStrip';

type Tab = 'revenue' | 'payouts' | 'settlements';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function AdminLedgerPage() {
  const [tab, setTab] = useState<Tab>('revenue');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totals, setTotals] = useState<{ gross: number; platformFee: number; gatewayFee: number; netVendor: number } | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/v1/admin/ledger?${params}`);
      const json = await res.json();
      if (json.success) {
        setRows(json.data.rows ?? []);
        setTotals(json.data.totals ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, from, to]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    const params = new URLSearchParams({ tab, format: 'csv' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    window.open(`/api/v1/admin/ledger?${params}`, '_blank');
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'revenue', label: 'Order earnings (fees)' },
    { id: 'payouts', label: 'Vendor wallet balances' },
    { id: 'settlements', label: 'Bank payout batches' },
  ];

  const EMPTY_BY_TAB: Record<Tab, string> = {
    revenue: 'No delivered orders with settlement snapshots in this period. Deliver COD/prepaid orders to populate.',
    payouts: 'All vendor wallets are at ₹0.',
    settlements: 'No settlement batches yet — run weekly cron or mark from Finance Overview.',
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-12 p-[clamp(1rem,2.5vw,2rem)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[clamp(1.25rem,2vw+0.75rem,1.75rem)] font-bold text-[#181725]">Platform Ledger</h1>
          <p className="text-[clamp(11px,1.5vw,12px)] text-[#7C7C7C] mt-1">
            Customer payments (Razorpay) live on Finance Overview — this page is vendor/platform money.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 h-[40px] px-5 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54]"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {totals && tab === 'revenue' && (
        <FinanceSummaryStrip
          metrics={[
            { label: 'Gross GMV', value: inr(totals.gross) },
            { label: 'Platform revenue', value: inr(totals.platformFee), accent: 'green' },
            { label: 'Gateway fees', value: inr(totals.gatewayFee), accent: 'muted' },
            { label: 'Paid to vendors', value: inr(totals.netVendor) },
          ]}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 rounded-[10px] text-[12px] font-bold transition-colors',
              tab === t.id ? 'bg-[#181725] text-white' : 'bg-white border border-[#EEEEEE] text-[#7C7C7C]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="h-[36px] px-3 rounded-[10px] border border-[#EEEEEE] text-[12px]" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="h-[36px] px-3 rounded-[10px] border border-[#EEEEEE] text-[12px]" />
        <button onClick={load} className="h-[36px] px-4 rounded-[10px] bg-[#299E60] text-white text-[12px] font-bold">Apply</button>
      </div>

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#299E60]" size={28} /></div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center">
            <BookOpen size={36} className="text-[#E5E7EB] mx-auto mb-3" />
            <p className="text-[13px] font-bold text-[#AEAEAE] max-w-md mx-auto">{EMPTY_BY_TAB[tab]}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#F5F5F5]">
                  {tab === 'revenue' && (
                    <>
                      <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Vendor</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Order</th>
                      <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Gross</th>
                      <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Platform fee</th>
                      <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Vendor net</th>
                    </>
                  )}
                  {tab === 'payouts' && (
                    <>
                      <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Vendor</th>
                      <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Wallet balance</th>
                      <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Pending</th>
                    </>
                  )}
                  {tab === 'settlements' && (
                    <>
                      <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Vendor</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Period</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Status</th>
                      <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Net payout</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">UTR</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5]">
                {rows.map((row) => (
                  <tr key={String(row.id ?? row.vendorId)} className="hover:bg-[#FAFAFA]">
                    {tab === 'revenue' && (
                      <>
                        <td className="px-4 py-3 text-[#7C7C7C]">{String(row.date).slice(0, 10)}</td>
                        <td className="px-4 py-3 font-semibold">{String(row.vendorName)}</td>
                        <td className="px-4 py-3 font-mono text-[11px]">{String(row.reference)}</td>
                        <td className="px-4 py-3 text-right">{inr(Number(row.gross))}</td>
                        <td className="px-4 py-3 text-right text-[#299E60] font-semibold">{inr(Number(row.platformFee))}</td>
                        <td className="px-4 py-3 text-right">{inr(Number(row.netVendor))}</td>
                      </>
                    )}
                    {tab === 'payouts' && (
                      <>
                        <td className="px-4 py-3 font-semibold">{String(row.vendorName)}</td>
                        <td className="px-4 py-3 text-right font-bold text-[#299E60]">{inr(Number(row.balance))}</td>
                        <td className="px-4 py-3 text-right">{inr(Number(row.pendingAmount))}</td>
                      </>
                    )}
                    {tab === 'settlements' && (
                      <>
                        <td className="px-4 py-3 font-semibold">{String(row.vendorName)}</td>
                        <td className="px-4 py-3 text-[11px]">{String(row.periodStart)} → {String(row.periodEnd)}</td>
                        <td className="px-4 py-3 capitalize">{String(row.status)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{inr(Number(row.netAmount))}</td>
                        <td className="px-4 py-3 font-mono text-[11px]">{String(row.bankReference ?? '—')}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
