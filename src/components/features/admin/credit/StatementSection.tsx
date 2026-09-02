'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, IndianRupee, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DownloadBtn } from './DownloadBtn';
import { KpiStatCard } from './KpiStatCard';
import {
  DIR_STYLE,
  downloadCsv,
  fmtDateTime,
  fmtMoney,
  TXN_LABEL,
  type StatementRow,
} from './adminCreditTypes';
export function StatementSection() {
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dir, setDir] = useState<'' | 'debit' | 'credit'>('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/wallet/reports?type=statement')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success) setRows(json.data.statement ?? []);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (dir && r.direction !== dir) return false;
      if (!q) return true;
      return (
        r.customer?.toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q) ||
        r.wallet.toLowerCase().includes(q) ||
        (r.note ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, dir]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          if (r.debit != null) acc.debit += r.debit;
          if (r.credit != null) acc.credit += r.credit;
          return acc;
        },
        { debit: 0, credit: 0 },
      ),
    [filtered],
  );

  const exportCsv = () =>
    downloadCsv(
      `credit-statement-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Customer', 'Phone', 'Wallet', 'Description', 'Type', 'Debit (₹)', 'Credit (₹)', 'Balance (₹)', 'Reference'],
      filtered.map((r) => [
        fmtDateTime(r.timestamp),
        r.customer,
        r.phone ?? '',
        r.wallet,
        r.note ?? TXN_LABEL[r.type] ?? r.type,
        TXN_LABEL[r.type] ?? r.type,
        r.debit ?? '',
        r.credit ?? '',
        r.balanceAfter,
        r.referenceId ?? '',
      ]),
    );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiStatCard label="Total spent (debit)" value={fmtMoney(totals.debit)} Icon={IndianRupee} tint="text-red-500 bg-red-50" />
        <KpiStatCard label="Total repaid (credit)" value={fmtMoney(totals.credit)} Icon={IndianRupee} tint="text-[#6B1D2E] bg-[#F8E8EC]" />
        <KpiStatCard label="Entries" value={filtered.length} Icon={FileText} tint="text-blue-600 bg-blue-50" />
      </div>

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-[16px] font-bold text-[#181725]">Transaction statement</h3>
            <p className="text-[12px] text-[#AEAEAE] mt-0.5">
              Every credit movement — spends, repayments, interest &amp; reversals
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={14} />
              <input
                type="text"
                placeholder="Search customer / wallet / note"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-[38px] w-full border border-[#EEEEEE] rounded-[10px] pl-9 pr-3 text-[12.5px] outline-none focus:border-[#6B1D2E]/40 bg-white"
              />
            </div>
            <select
              value={dir}
              onChange={(e) => setDir(e.target.value as '' | 'debit' | 'credit')}
              className="h-[38px] border border-[#EEEEEE] rounded-[10px] px-3 text-[12.5px] font-semibold outline-none focus:border-[#6B1D2E]/40 cursor-pointer bg-white"
            >
              <option value="">All entries</option>
              <option value="debit">Debit (spends / fees)</option>
              <option value="credit">Credit (repayments)</option>
            </select>
            <DownloadBtn onClick={exportCsv} disabled={filtered.length === 0} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-[#6B1D2E]" size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={36} strokeWidth={1.5} className="text-[#E5E7EB] mx-auto mb-3" />
            <p className="text-[14px] font-bold text-[#AEAEAE]">No transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-[#F5F5F5] h-[44px]">
                  {['Date', 'Customer', 'Wallet', 'Description', 'Debit', 'Credit', 'Balance'].map((h, i, arr) => (
                    <th
                      key={h}
                      className={cn(
                        'px-4 text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wide',
                        i < 4 ? 'text-left' : 'text-right',
                        i === 0 && 'rounded-l-[10px]',
                        i === arr.length - 1 && 'rounded-r-[10px]',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE]">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="py-3 px-4 text-left text-[12px] text-[#7C7C7C] whitespace-nowrap">
                      {fmtDateTime(r.timestamp)}
                    </td>
                    <td className="py-3 px-4 text-left">
                      <div className="text-[13px] font-bold text-[#181725]">{r.customer}</div>
                      <div className="text-[11px] text-[#AEAEAE]">{r.phone || '—'}</div>
                    </td>
                    <td className="py-3 px-4 text-left text-[13px] font-semibold text-[#181725]">{r.wallet}</td>
                    <td className="py-3 px-4 text-left">
                      <span className={cn('inline-flex rounded-[7px] text-[10px] font-bold px-2 py-0.5 mb-1', DIR_STYLE[r.direction])}>
                        {TXN_LABEL[r.type] ?? r.type}
                      </span>
                      <div className="text-[11px] text-[#AEAEAE] max-w-[280px]">{r.note ?? '—'}</div>
                    </td>
                    <td className="py-3 px-4 text-right text-[13px] font-bold text-[#E74C3C] whitespace-nowrap">
                      {r.debit != null ? fmtMoney(r.debit) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right text-[13px] font-bold text-[#6B1D2E] whitespace-nowrap">
                      {r.credit != null ? fmtMoney(r.credit) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right text-[13px] font-semibold text-[#181725] whitespace-nowrap">
                      {fmtMoney(r.balanceAfter)}
                    </td>
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
