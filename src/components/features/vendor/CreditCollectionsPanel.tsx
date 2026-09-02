'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2, CreditCard, AlertTriangle, IndianRupee,
  TrendingUp, Clock, Bell, Download, Banknote, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CustomerRow {
  id: string;
  customer: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string;
  };
  creditLimit: number;
  availableCredit: number;
  usedCredit: number;
  outstanding: number;
  dueDate: string | null;
  overdueDays: number;
  status: 'ACTIVE' | 'BLOCKED' | 'BLACKLISTED';
  agingBucket: 'current' | 'd1_30' | 'd31_60' | 'd60plus';
}

interface Summary {
  totalOutstanding: number;
  dueToday: number;
  overdue: number;
  highRiskCount: number;
  agingBuckets: { current: number; d1_30: number; d31_60: number; d60plus: number };
  total: number;
}

function formatINR(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(v);
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-primary-light text-primary',
  BLOCKED: 'bg-amber-50 text-amber-600',
  BLACKLISTED: 'bg-red-50 text-[#E74C3C]',
};

const AGING_COLOR: Record<string, string> = {
  current: 'text-primary', d1_30: 'text-amber-500', d31_60: 'text-orange-500', d60plus: 'text-[#E74C3C]',
};

const AGING_BAR_COLOR: Record<string, string> = {
  current: 'bg-primary', d1_30: 'bg-amber-400', d31_60: 'bg-orange-400', d60plus: 'bg-[#E74C3C]',
};

type FilterTab = 'all' | 'overdue' | 'active' | 'blocked';

export function CreditCollectionsPanel() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/vendor/credit');
      const json = await res.json() as { success: boolean; data?: { customers: CustomerRow[]; summary: Summary } };
      if (json.success && json.data) {
        setCustomers(json.data.customers);
        setSummary(json.data.summary);
      }
    } catch {
      toast.error('Failed to load collections data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchCollections(); }, [fetchCollections]);

  const handleSendReminder = async (row: CustomerRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch('/api/v1/vendor/credit/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: row.customer.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed');
      toast.success(`Reminder sent to ${row.customer.fullName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reminder');
    } finally {
      setBusyId(null);
    }
  };

  const handleRecordPayment = async (row: CustomerRow) => {
    const raw = prompt(`Record offline payment for ${row.customer.fullName} (max ${formatINR(row.outstanding)}):`);
    if (!raw) return;
    const amount = parseFloat(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/v1/vendor/credit/repay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId: row.id, amount, method: 'CASH' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed');
      toast.success('Payment recorded');
      void fetchCollections();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setBusyId(null);
    }
  };

  const handleDispute = async (row: CustomerRow) => {
    const note = prompt('Dispute note (visible in ledger):');
    if (!note?.trim()) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/v1/vendor/collections/${row.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dispute', note: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed');
      toast.success('Dispute logged');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log dispute');
    } finally {
      setBusyId(null);
    }
  };

  const handleDownloadStatement = (walletId: string) => {
    window.open(`/api/v1/vendor/credit/${walletId}/statement`, '_blank');
  };

  const FILTER_TABS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'active', label: 'Active' },
    { key: 'blocked', label: 'Blocked' },
  ];

  const filtered = customers.filter((c) => {
    if (activeTab === 'overdue') return c.overdueDays > 0 && c.outstanding > 0;
    if (activeTab === 'active') return c.status === 'ACTIVE';
    if (activeTab === 'blocked') return c.status === 'BLOCKED' || c.status === 'BLACKLISTED';
    return true;
  });

  const totalOutstandingForBar = summary
    ? Math.max(1, summary.agingBuckets.current + summary.agingBuckets.d1_30 + summary.agingBuckets.d31_60 + summary.agingBuckets.d60plus)
    : 1;

  return (
    <div className="space-y-5">
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Outstanding', value: formatINR(summary.totalOutstanding), icon: IndianRupee, color: 'text-[#181725]', bg: 'bg-white' },
            { label: 'Due Today', value: formatINR(summary.dueToday), icon: Clock, color: summary.dueToday > 0 ? 'text-amber-600' : 'text-[#AEAEAE]', bg: summary.dueToday > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white' },
            { label: 'Overdue', value: formatINR(summary.overdue), icon: AlertTriangle, color: summary.overdue > 0 ? 'text-[#E74C3C]' : 'text-[#AEAEAE]', bg: summary.overdue > 0 ? 'bg-red-50 border-red-100' : 'bg-white' },
            { label: 'High Risk', value: String(summary.highRiskCount), icon: TrendingUp, color: summary.highRiskCount > 0 ? 'text-[#E74C3C]' : 'text-primary', bg: summary.highRiskCount > 0 ? 'bg-red-50 border-red-100' : 'bg-white' },
          ].map((stat) => (
            <div key={stat.label} className={cn('rounded-[14px] border border-[#EEEEEE] shadow-sm p-4 flex items-start gap-3', stat.bg)}>
              <div className="p-2 rounded-[8px] bg-[#F5F5F5] shrink-0">
                <stat.icon size={16} className={stat.color} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-[#AEAEAE] font-bold uppercase tracking-wide">{stat.label}</p>
                <p className={cn('text-[18px] font-bold mt-0.5', stat.color)}>{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {summary && (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-5">
          <p className="text-[13px] font-bold text-[#181725] mb-4">Aging Breakdown</p>
          <div className="space-y-3">
            {(
              [
                ['current', 'Current (not due)', summary.agingBuckets.current],
                ['d1_30', '1–30 days overdue', summary.agingBuckets.d1_30],
                ['d31_60', '31–60 days overdue', summary.agingBuckets.d31_60],
                ['d60plus', '60+ days overdue', summary.agingBuckets.d60plus],
              ] as [string, string, number][]
            ).map(([key, label, amount]) => (
              <div key={key} className="flex items-center gap-4">
                <span className="text-[12px] text-[#7C7C7C] w-[160px] shrink-0">{label}</span>
                <div className="flex-1 h-[8px] bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', AGING_BAR_COLOR[key])} style={{ width: `${Math.min(100, (amount / totalOutstandingForBar) * 100)}%` }} />
                </div>
                <span className={cn('text-[12px] font-bold w-[90px] text-right', AGING_COLOR[key])}>{formatINR(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex bg-[#F5F5F5] rounded-[10px] p-0.5 gap-0.5 flex-wrap w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'h-[30px] px-4 rounded-[8px] text-[12px] font-semibold transition-all',
              activeTab === tab.key ? 'bg-white text-[#181725] shadow-sm' : 'text-[#7C7C7C]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-primary" size={28} /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <CreditCard size={36} className="text-[#E5E7EB] mx-auto mb-3" />
            <p className="text-[14px] font-bold text-[#AEAEAE]">No credit customers found</p>
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-[#F5F5F5] p-3 space-y-3">
              {filtered.map((row) => (
                <div key={row.id} className="bg-[#FAFAFA] rounded-[12px] border border-[#EEEEEE] p-4 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-bold text-[#181725] text-[14px]">{row.customer.fullName}</p>
                      <p className="text-[#AEAEAE] text-[12px]">{row.customer.phone ?? row.customer.email}</p>
                    </div>
                    <span className={cn('font-bold px-2 py-1 rounded-[6px] text-[10px]', STATUS_STYLE[row.status])}>{row.status.toLowerCase()}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-[#7C7C7C]">Outstanding</span>
                    <span className="font-bold text-[#E74C3C]">{formatINR(row.outstanding)}</span>
                  </div>
                  <div className="flex justify-between text-[12px] text-[#7C7C7C]">
                    <span>Due {formatDate(row.dueDate)}</span>
                    {row.overdueDays > 0 && <span className="text-[#E74C3C] font-bold">{row.overdueDays}d overdue</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {row.outstanding > 0 && (
                      <>
                        <button type="button" disabled={busyId === row.id} onClick={() => handleSendReminder(row)} className="inline-flex items-center gap-1 h-[28px] px-2.5 rounded-[6px] bg-primary text-white text-[11px] font-bold">
                          {busyId === row.id ? <Loader2 size={10} className="animate-spin" /> : <Bell size={10} />} Remind
                        </button>
                        <button type="button" disabled={busyId === row.id} onClick={() => handleRecordPayment(row)} className="inline-flex items-center gap-1 h-[28px] px-2.5 rounded-[6px] border border-[#EEEEEE] text-[11px] font-bold">
                          <Banknote size={10} /> Pay
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => handleDownloadStatement(row.id)} className="inline-flex items-center gap-1 h-[28px] px-2.5 rounded-[6px] border border-[#EEEEEE] text-[11px] font-bold">
                      <Download size={10} /> Stmt
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
                  <th className="px-5 py-3 text-left font-bold text-[#AEAEAE] uppercase">Customer</th>
                  <th className="px-4 py-3 text-right font-bold text-[#AEAEAE] uppercase">Outstanding</th>
                  <th className="px-4 py-3 text-center font-bold text-[#AEAEAE] uppercase">Due</th>
                  <th className="px-4 py-3 text-center font-bold text-[#AEAEAE] uppercase">Status</th>
                  <th className="px-4 py-3 text-center font-bold text-[#AEAEAE] uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5]">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-[#FAFAFA]">
                    <td className="px-5 py-4">
                      <p className="font-bold text-[#181725]">{row.customer.fullName}</p>
                      <p className="text-[#AEAEAE]">{row.customer.phone ?? row.customer.email}</p>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-[#E74C3C]">{formatINR(row.outstanding)}</td>
                    <td className="px-4 py-4 text-center text-[#7C7C7C]">{formatDate(row.dueDate)}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={cn('font-bold px-2 py-1 rounded-[6px] text-[11px]', STATUS_STYLE[row.status])}>{row.status.toLowerCase()}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {row.outstanding > 0 && (
                          <>
                            <button type="button" disabled={busyId === row.id} onClick={() => handleSendReminder(row)} className="inline-flex items-center gap-1 h-[26px] px-2 rounded-[6px] bg-primary text-white text-[10px] font-bold">
                              {busyId === row.id ? <Loader2 size={10} className="animate-spin" /> : <Bell size={10} />} Remind
                            </button>
                            <button type="button" disabled={busyId === row.id} onClick={() => handleRecordPayment(row)} className="inline-flex items-center gap-1 h-[26px] px-2 rounded-[6px] border border-[#EEEEEE] text-[10px] font-bold">
                              <Banknote size={10} /> Pay
                            </button>
                          </>
                        )}
                        <button type="button" onClick={() => handleDownloadStatement(row.id)} className="inline-flex items-center gap-1 h-[26px] px-2 rounded-[6px] border border-[#EEEEEE] text-[10px] font-bold">
                          <Download size={10} /> Stmt
                        </button>
                        <button type="button" disabled={busyId === row.id} onClick={() => handleDispute(row)} className="inline-flex items-center gap-1 h-[26px] px-2 rounded-[6px] border border-[#EEEEEE] text-[10px] font-bold">
                          <MessageSquare size={10} /> Dispute
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
