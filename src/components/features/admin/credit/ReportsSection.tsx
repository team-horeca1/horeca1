'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  IndianRupee,
  Loader2,
  ShieldOff,
  TrendingUp,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DownloadBtn } from './DownloadBtn';
import { KpiStatCard } from './KpiStatCard';
import { downloadCsv, fmtDate, fmtDateTime, fmtMoney, formatAuditActor, formatAuditChange, formatAuditValue, type ReportsData } from './adminCreditTypes';

export function ReportsSection() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/wallet/reports?type=all')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success) setData(json.data);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-[#299E60]" size={32} />
      </div>
    );
  }

  const u = data?.utilization;
  const overdue = data?.overdue ?? [];
  const interest = data?.interest ?? [];
  const audit = data?.audit ?? [];

  return (
    <div className="space-y-6">
      {u && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiStatCard label="Credit issued" value={fmtMoney(u.totalCreditIssued)} Icon={IndianRupee} tint="text-blue-600 bg-blue-50" />
          <KpiStatCard label="Credit utilized" value={fmtMoney(u.totalCreditUtilized)} Icon={TrendingUp} tint="text-amber-600 bg-amber-50" />
          <KpiStatCard label="Repayments" value={fmtMoney(u.totalRepayments)} Icon={IndianRupee} tint="text-[#299E60] bg-[#EEF8F1]" />
          <KpiStatCard label="Outstanding" value={fmtMoney(u.outstandingAmount)} Icon={AlertTriangle} tint="text-red-500 bg-red-50" />
          <KpiStatCard label="Active customers" value={u.activeCustomers} Icon={Users} tint="text-indigo-600 bg-indigo-50" />
          <KpiStatCard label="Blacklisted" value={u.blacklistedCustomers} Icon={ShieldOff} tint="text-orange-600 bg-orange-50" />
        </div>
      )}

      <ReportTable
        title="Who is overdue?"
        subtitle="Accounts past due date with outstanding balance"
        headers={['Customer', 'Vendor', 'Limit', 'Outstanding', 'Due', 'Days overdue']}
        empty="No overdue accounts — great news!"
        rows={overdue.map((r) => [
          r.customer,
          r.vendor,
          fmtMoney(r.creditLimit),
          fmtMoney(r.outstanding),
          fmtDate(r.dueDate),
          String(r.overdueDays),
        ])}
        rowClass={(i) => (overdue[i]?.highlightRed ? 'bg-[#FFF0F0]' : '')}
      />

      <ReportTable
        title="Interest charged"
        subtitle="Penalty and interest accruals applied to wallets"
        headers={['Customer', 'Interest', 'Date', 'Outstanding base']}
        empty="No interest entries yet."
        rows={interest.map((r) => [
          r.customer,
          fmtMoney(r.interestApplied),
          fmtDate(r.date),
          fmtMoney(r.outstandingBaseAmount),
        ])}
      />

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5 md:p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-[16px] font-bold text-[#181725]">Audit log</h3>
            <p className="text-[12px] text-[#AEAEAE]">Every credit assignment and policy change</p>
          </div>
          <DownloadBtn
            disabled={audit.length === 0}
            onClick={() =>
              downloadCsv(
                `credit-audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
                ['Timestamp', 'Customer', 'Action', 'By', 'Previous', 'New', 'Remarks'],
                audit.map((r) => [
                  fmtDateTime(r.timestamp),
                  r.customer,
                  r.action.replace(/_/g, ' '),
                  formatAuditActor(r.performedBy),
                  formatAuditValue(r.previousValue),
                  formatAuditValue(r.newValue),
                  r.remarks ?? '',
                ]),
              )
            }
          />
        </div>
        <ReportTable
          title=""
          headers={['Customer', 'Action', 'By', 'Change', 'Remarks', 'When']}
          empty="No audit entries."
          rows={audit.map((r) => [
            r.customer,
            r.action.replace(/_/g, ' '),
            formatAuditActor(r.performedBy),
            formatAuditChange(r.previousValue, r.newValue),
            r.remarks ?? '—',
            fmtDateTime(r.timestamp),
          ])}
          embedded
        />
      </div>
    </div>
  );
}

function ReportTable({
  title,
  subtitle,
  headers,
  rows,
  empty,
  rowClass,
  embedded,
}: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  empty: string;
  rowClass?: (index: number) => string;
  embedded?: boolean;
}) {
  const inner = (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr className="bg-[#F5F5F5] h-[44px]">
            {headers.map((h, i) => (
              <th
                key={h}
                className={cn(
                  'px-4 text-left text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wide',
                  i === 0 && 'first:rounded-l-[10px]',
                  i === headers.length - 1 && 'last:rounded-r-[10px]',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EEEEEE]">
          {rows.length > 0 ? (
            rows.map((row, i) => (
              <tr key={i} className={cn('hover:bg-[#FAFAFA] transition-colors', rowClass?.(i))}>
                {row.map((cell, j) => (
                  <td key={j} className="py-3 px-4 text-[13px] text-[#181725] font-medium">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className="py-12 text-center text-[13px] text-[#AEAEAE]">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  if (embedded) return inner;

  return (
    <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5 md:p-6">
      {title && (
        <div className="mb-4">
          <h3 className="text-[16px] font-bold text-[#181725]">{title}</h3>
          {subtitle && <p className="text-[12px] text-[#AEAEAE]">{subtitle}</p>}
        </div>
      )}
      {inner}
    </div>
  );
}
