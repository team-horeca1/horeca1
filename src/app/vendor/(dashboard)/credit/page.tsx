'use client';

/**
 * Vendor → DiSCCO Credit — excel-style customer grid for credit assignment + CRM fields.
 */

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Loader2, CreditCard, Search, X, IndianRupee,
  AlertTriangle, ShieldOff,
} from 'lucide-react';
import { CreditCollectionsPanel } from '@/components/features/vendor/CreditCollectionsPanel';
import { BulkAssignCreditModal } from '@/components/features/vendor/BulkAssignCreditModal';
import { VendorCreditDefaultsPanel } from '@/components/features/vendor/VendorCreditDefaultsPanel';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  CreditCustomerGrid,
  STATUS_FILTER_OPTIONS,
  type CreditDisplayStatus,
  type CreditGridRow,
} from '@/components/features/vendor/CreditCustomerGrid';
import { teamDtoListToOptions, type TeamMemberOption } from '@/lib/teamMemberShape';

type RepaymentMode = 'REPAY_BEFORE_NEXT_USE' | 'ALLOW_USAGE_TILL_DUE';
type BillingModel = 'BILL_TO_BILL' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';

interface WalletInfo {
  id: string;
  creditLimit: number;
  usedCredit: number;
  availableCredit: number;
  outstandingAmount: number;
  reservedAmount?: number;
  creditSource?: string;
  status: 'ACTIVE' | 'BLOCKED' | 'SUSPENDED' | 'FROZEN' | 'EXPIRED' | 'CANCELLED' | 'BLACKLISTED';
  workflowStatus: 'SANCTIONED' | 'IN_PROGRESS' | 'COMPLETED';
  assignedOwnerId: string | null;
  ownerName: string | null;
  vendorNotes: string | null;
  displayStatus: CreditDisplayStatus;
  currentDueDate: string | null;
  overdueDays: number;
  repaymentMode: RepaymentMode | null;
  billingModel: BillingModel | null;
  creditTenureDays: number | null;
  gracePeriodDays: number | null;
  blacklistDays: number | null;
  interestRatePct: number | null;
  interestFrequencyDays: number | null;
  penaltyAmount: number | null;
  penaltyFrequencyDays: number | null;
}

interface CustomerRow {
  userId: string;
  name: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  orderCount: number;
  lastOrderAt: string | null;
  displayStatus: CreditDisplayStatus;
  wallet: WalletInfo | null;
}

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(v);

function CreditModal({ row, onClose, onSaved }: {
  row: CustomerRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const w = row.wallet;
  const [limit, setLimit] = useState(w ? String(w.creditLimit) : '');
  const [terms, setTerms] = useState<'default' | RepaymentMode>(w?.repaymentMode ?? 'default');
  const [tenure, setTenure] = useState(w?.creditTenureDays != null ? String(w.creditTenureDays) : '');
  const [cycle, setCycle] = useState<BillingModel>(w?.billingModel && w.billingModel !== 'BILL_TO_BILL' ? w.billingModel : 'MONTHLY');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [grace, setGrace] = useState(w?.gracePeriodDays != null ? String(w.gracePeriodDays) : '');
  const [interest, setInterest] = useState(w?.interestRatePct != null ? String(w.interestRatePct) : '');
  const [interestFreq, setInterestFreq] = useState(w?.interestFrequencyDays != null ? String(w.interestFrequencyDays) : '');
  const [penalty, setPenalty] = useState(w?.penaltyAmount != null ? String(w.penaltyAmount) : '');
  const [penaltyFreq, setPenaltyFreq] = useState(w?.penaltyFrequencyDays != null ? String(w.penaltyFrequencyDays) : '');
  const [blacklist, setBlacklist] = useState(w?.blacklistDays != null ? String(w.blacklistDays) : '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const limitNum = parseFloat(limit);
    if (!Number.isFinite(limitNum) || limitNum < 0) {
      toast.error('Enter a valid credit limit');
      return;
    }
    const overrides: Record<string, unknown> = {};
    if (terms !== 'default') {
      overrides.repaymentMode = terms;
      if (terms === 'REPAY_BEFORE_NEXT_USE') {
        overrides.billingModel = 'BILL_TO_BILL';
        if (tenure.trim()) overrides.creditTenureDays = parseInt(tenure, 10);
      } else {
        overrides.billingModel = cycle;
      }
    }
    if (grace.trim()) overrides.gracePeriodDays = parseInt(grace, 10);
    if (interest.trim()) overrides.interestRatePct = parseFloat(interest);
    if (interestFreq.trim()) overrides.interestFrequencyDays = parseInt(interestFreq, 10);
    if (penalty.trim()) overrides.penaltyAmount = parseFloat(penalty);
    if (penaltyFreq.trim()) overrides.penaltyFrequencyDays = parseInt(penaltyFreq, 10);
    if (blacklist.trim()) overrides.blacklistDays = parseInt(blacklist, 10);

    setSaving(true);
    try {
      const res = await fetch('/api/v1/vendor/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: row.userId,
          creditLimit: limitNum,
          ...(Object.keys(overrides).length > 0 && { overrides }),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to save credit line');
      toast.success('Payment terms updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save credit line');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#299E60]/50 bg-white';
  const labelCls = 'block text-[12px] font-semibold text-[#7C7C7C] mb-1';

  return (
    <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-[16px] w-full max-w-[460px] shadow-2xl my-8">
        <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-[#181725]">Advanced payment terms</h2>
            <p className="text-[12px] text-[#AEAEAE]">{row.name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-[6px] hover:bg-[#F5F5F5]">
            <X size={16} strokeWidth={1.5} className="text-[#AEAEAE]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
          <div>
            <label className={labelCls}>Credit limit (₹)</label>
            <div className="relative">
              <IndianRupee size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
              <input
                type="number" min="0" step="100"
                value={limit} onChange={(e) => setLimit(e.target.value)}
                className={cn(inputCls, 'pl-8')}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Payment terms</label>
            <div className="space-y-2">
              {([
                { v: 'default', title: 'Platform default', desc: 'Use the standard Horeca1 credit terms' },
                { v: 'REPAY_BEFORE_NEXT_USE', title: 'Pay before next use', desc: 'Customer must clear dues before buying on credit again' },
                { v: 'ALLOW_USAGE_TILL_DUE', title: 'Use until a due date', desc: 'Customer keeps ordering; consolidated dues by cycle date' },
              ] as const).map((opt) => (
                <label
                  key={opt.v}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-[12px] border cursor-pointer transition-colors',
                    terms === opt.v ? 'border-[#299E60] bg-[#EEF8F1]/50' : 'border-[#EEEEEE] hover:border-[#299E60]/40',
                  )}
                >
                  <input
                    type="radio" name="terms" checked={terms === opt.v}
                    onChange={() => setTerms(opt.v)}
                    className="mt-0.5 accent-[#299E60]"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-[#181725]">{opt.title}</span>
                    <span className="block text-[11.5px] text-[#AEAEAE]">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>

            {terms === 'REPAY_BEFORE_NEXT_USE' && (
              <div className="mt-3">
                <label className={labelCls}>Credit tenure (days after each bill)</label>
                <input type="number" min="0" max="365" value={tenure} onChange={(e) => setTenure(e.target.value)} placeholder="Platform default" className={inputCls} />
              </div>
            )}
            {terms === 'ALLOW_USAGE_TILL_DUE' && (
              <div className="mt-3">
                <label className={labelCls}>Billing cycle</label>
                <select value={cycle} onChange={(e) => setCycle(e.target.value as BillingModel)} className={inputCls}>
                  <option value="WEEKLY">Weekly</option>
                  <option value="FORTNIGHTLY">Fortnightly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="text-[12.5px] font-semibold text-[#299E60] hover:underline">
              {showAdvanced ? 'Hide' : 'Show'} interest, penalty &amp; grace
            </button>
            {showAdvanced && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Grace (days)</label><input type="number" min="0" value={grace} onChange={(e) => setGrace(e.target.value)} placeholder="Default" className={inputCls} /></div>
                <div><label className={labelCls}>Blacklist after (days)</label><input type="number" min="0" value={blacklist} onChange={(e) => setBlacklist(e.target.value)} placeholder="Default" className={inputCls} /></div>
                <div><label className={labelCls}>Interest (%)</label><input type="number" min="0" step="0.1" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="Default" className={inputCls} /></div>
                <div><label className={labelCls}>…per days</label><input type="number" min="1" value={interestFreq} onChange={(e) => setInterestFreq(e.target.value)} placeholder="Default" className={inputCls} /></div>
                <div><label className={labelCls}>Late fee (₹)</label><input type="number" min="0" value={penalty} onChange={(e) => setPenalty(e.target.value)} placeholder="Default" className={inputCls} /></div>
                <div><label className={labelCls}>…per days</label><input type="number" min="1" value={penaltyFreq} onChange={(e) => setPenaltyFreq(e.target.value)} placeholder="Default" className={inputCls} /></div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#EEEEEE] flex justify-end gap-3">
          <button onClick={onClose} className="px-5 h-[38px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-semibold text-[#7C7C7C]">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 h-[38px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            Save terms
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VendorCreditPageWrapper() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#299E60]" /></div>}>
      <VendorCreditPage />
    </Suspense>
  );
}

function VendorCreditPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const pageTab =
    tabParam === 'collections'
      ? 'collections'
      : tabParam === 'defaults'
        ? 'defaults'
        : 'customers';
  const [mainTab, setMainTab] = useState<'customers' | 'collections' | 'defaults'>(pageTab);

  useEffect(() => {
    setMainTab(pageTab);
  }, [pageTab]);
  const { data: session } = useSession();
  const canApprove = useMemo(() => {
    const perms = ((session?.user as Record<string, unknown> | undefined)?.permissions as string[] | undefined) ?? [];
    return perms.includes('creditLine.approve');
  }, [session]);

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CreditDisplayStatus | 'ALL' | 'FULLY_UTILIZED' | 'NO_CREDIT' | 'OVERDUE' | 'HIGH_RISK'>('ALL');
  const [advancedRow, setAdvancedRow] = useState<CustomerRow | null>(null);
  const [showBulk, setShowBulk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [custRes, teamRes] = await Promise.all([
        fetch('/api/v1/vendor/credit/customers'),
        fetch('/api/v1/vendor/team'),
      ]);
      const custJson = await custRes.json();
      const teamJson = await teamRes.json();
      if (custJson.success) setRows(custJson.data.customers);
      else toast.error(custJson.error?.message || 'Failed to load customers');
      if (teamJson.success) {
        const list = Array.isArray(teamJson.data) ? teamJson.data : (teamJson.data?.members ?? []);
        setTeamMembers(teamDtoListToOptions(list));
      }
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.name} ${r.fullName ?? ''} ${r.email ?? ''} ${r.phone ?? ''}`.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const gridRows: CreditGridRow[] = useMemo(
    () => searchFiltered.map((r) => ({
      userId: r.userId,
      name: r.name,
      phone: r.phone,
      email: r.email,
      displayStatus: r.displayStatus,
      wallet: r.wallet
        ? {
            id: r.wallet.id,
            creditLimit: r.wallet.creditLimit,
            outstandingAmount: r.wallet.outstandingAmount,
            reservedAmount: r.wallet.reservedAmount,
            availableCredit: r.wallet.availableCredit,
            usedCredit: r.wallet.usedCredit,
            creditSource: r.wallet.creditSource,
            status: r.wallet.status,
            workflowStatus: r.wallet.workflowStatus,
            assignedOwnerId: r.wallet.assignedOwnerId,
            ownerName: r.wallet.ownerName,
            vendorNotes: r.wallet.vendorNotes,
            displayStatus: r.wallet.displayStatus,
            currentDueDate: r.wallet.currentDueDate,
            overdueDays: r.wallet.overdueDays,
          }
        : null,
    })),
    [searchFiltered],
  );

  const stats = useMemo(() => {
    const withCredit = rows.filter((r) => r.wallet);
    return {
      lines: withCredit.length,
      exposure: withCredit.reduce((s, r) => s + (r.wallet?.creditLimit ?? 0), 0),
      outstanding: withCredit.reduce((s, r) => s + (r.wallet?.outstandingAmount ?? 0), 0),
      overdue: withCredit.filter((r) => (r.wallet?.overdueDays ?? 0) > 0 && (r.wallet?.outstandingAmount ?? 0) > 0).length,
    };
  }, [rows]);

  const findCustomerRow = (userId: string) => rows.find((r) => r.userId === userId) ?? null;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold text-[#181725]">Credit &amp; Collections</h1>
          <p className="text-[12px] text-[#AEAEAE]">Assign credit lines, track outstanding balances, and manage recovery</p>
        </div>
        {canApprove && mainTab === 'customers' && (
          <button
            type="button"
            onClick={() => setShowBulk(true)}
            className="h-[38px] px-4 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold"
          >
            Bulk assign credit
          </button>
        )}
      </div>

      <div className="flex bg-[#F5F5F5] rounded-[10px] p-0.5 gap-0.5 w-fit flex-wrap">
        {([
          { id: 'customers' as const, label: 'Customers' },
          { id: 'collections' as const, label: 'Collections & Recovery' },
          { id: 'defaults' as const, label: 'Credit defaults' },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMainTab(t.id)}
            className={cn(
              'h-[34px] px-5 rounded-[8px] text-[13px] font-semibold transition-all',
              mainTab === t.id ? 'bg-white text-[#181725] shadow-sm' : 'text-[#7C7C7C]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === 'collections' ? (
        <CreditCollectionsPanel />
      ) : mainTab === 'defaults' ? (
        <VendorCreditDefaultsPanel canEdit={canApprove} />
      ) : (
        <>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Credit lines', value: String(stats.lines), Icon: CreditCard, tint: 'text-[#299E60] bg-[#EEF8F1]' },
          { label: 'Total limit', value: inr(stats.exposure), Icon: IndianRupee, tint: 'text-blue-600 bg-blue-50' },
          { label: 'Outstanding', value: inr(stats.outstanding), Icon: AlertTriangle, tint: 'text-amber-600 bg-amber-50' },
          { label: 'Overdue', value: String(stats.overdue), Icon: ShieldOff, tint: 'text-red-500 bg-red-50' },
        ].map(({ label, value, Icon, tint }) => (
          <div key={label} className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-4 flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0', tint)}>
              <Icon size={16} strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-[#181725] truncate">{value}</p>
              <p className="text-[11px] text-[#AEAEAE]">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEAE]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, phone, email…"
            className="w-full h-[38px] pl-8 pr-3 rounded-[10px] border border-[#EEEEEE] text-[12.5px] outline-none focus:border-[#299E60]/40 bg-white"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'px-3 h-[32px] rounded-full text-[12px] font-semibold transition-colors',
                statusFilter === f.key ? 'bg-[#4F46E5] text-white' : 'bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:border-[#4F46E5]/40',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#299E60]" size={28} />
        </div>
      ) : gridRows.length === 0 ? (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] py-16 text-center shadow-sm">
          <CreditCard size={36} strokeWidth={1.5} className="text-[#E5E7EB] mx-auto mb-3" />
          <p className="text-[14px] font-bold text-[#AEAEAE]">No customers match</p>
        </div>
      ) : (
        <CreditCustomerGrid
          rows={gridRows}
          teamMembers={teamMembers}
          canEdit={canApprove}
          statusFilter={statusFilter}
          onRefresh={load}
          onAdvancedTerms={(row) => {
            const full = findCustomerRow(row.userId);
            if (full) setAdvancedRow(full);
          }}
        />
      )}

      {!canApprove && !loading && rows.length > 0 && (
        <p className="text-[12px] text-[#AEAEAE]">
          View-only — ask the account owner for &ldquo;Approve Credit&rdquo; permission to edit the grid.
        </p>
      )}

      {advancedRow && (
        <CreditModal
          row={advancedRow}
          onClose={() => setAdvancedRow(null)}
          onSaved={load}
        />
      )}
      {showBulk && (
        <BulkAssignCreditModal
          customers={rows}
          onClose={() => setShowBulk(false)}
          onDone={load}
        />
      )}
        </>
      )}
    </div>
  );
}
