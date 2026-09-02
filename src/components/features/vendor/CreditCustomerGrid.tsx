'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, Save, Banknote, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { TeamMemberOption } from '@/lib/teamMemberShape';

export type { TeamMemberOption } from '@/lib/teamMemberShape';

export type CreditDisplayStatus =
  | 'SANCTIONED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'SUSPENDED'
  | 'FROZEN'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'BLACKLISTED';

export type WorkflowStatus = 'SANCTIONED' | 'IN_PROGRESS' | 'COMPLETED';

export type RuntimeWalletStatus =
  | 'ACTIVE'
  | 'BLOCKED'
  | 'SUSPENDED'
  | 'FROZEN'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'BLACKLISTED';

export interface CreditGridRow {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  wallet: {
    id: string;
    creditLimit: number;
    outstandingAmount: number;
    reservedAmount?: number;
    availableCredit?: number;
    usedCredit?: number;
    creditSource?: string;
    status: RuntimeWalletStatus;
    workflowStatus: WorkflowStatus;
    assignedOwnerId: string | null;
    ownerName: string | null;
    vendorNotes: string | null;
    displayStatus: CreditDisplayStatus;
    currentDueDate: string | null;
    overdueDays?: number;
  } | null;
  displayStatus: CreditDisplayStatus;
}

type RowDraft = {
  creditLimit: string;
  workflowStatus: WorkflowStatus;
  assignedOwnerId: string;
  vendorNotes: string;
};

const DISPLAY_STATUS: Record<CreditDisplayStatus, { label: string; cls: string }> = {
  SANCTIONED: { label: 'Sanctioned', cls: 'bg-blue-50 text-blue-700 border border-blue-100' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-amber-50 text-amber-800 border border-amber-100' },
  COMPLETED: { label: 'Completed', cls: 'bg-primary-light text-primary border border-primary/20' },
  BLOCKED: { label: 'Blocked', cls: 'bg-orange-50 text-orange-700 border border-orange-100' },
  SUSPENDED: { label: 'Suspended', cls: 'bg-slate-100 text-slate-700 border border-slate-200' },
  FROZEN: { label: 'Frozen', cls: 'bg-cyan-50 text-cyan-800 border border-cyan-100' },
  EXPIRED: { label: 'Expired', cls: 'bg-stone-100 text-stone-600 border border-stone-200' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-zinc-100 text-zinc-600 border border-zinc-200' },
  BLACKLISTED: { label: 'Blacklisted', cls: 'bg-red-50 text-red-600 border border-red-100' },
};

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(v);

function formatDue(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function draftFromRow(row: CreditGridRow): RowDraft {
  return {
    creditLimit: row.wallet ? String(row.wallet.creditLimit) : '',
    workflowStatus: row.wallet?.workflowStatus ?? 'IN_PROGRESS',
    assignedOwnerId: row.wallet?.assignedOwnerId ?? '',
    vendorNotes: row.wallet?.vendorNotes ?? '',
  };
}

function isSystemLocked(row: CreditGridRow): boolean {
  const s = row.wallet?.status;
  return s === 'BLOCKED' || s === 'BLACKLISTED' || s === 'FROZEN' || s === 'SUSPENDED' || s === 'EXPIRED' || s === 'CANCELLED';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ensure the selected owner always has a human-readable option label. */
function ownerOptionsForRow(
  row: CreditGridRow,
  teamMembers: TeamMemberOption[],
  assignedOwnerId: string,
): TeamMemberOption[] {
  const opts = teamMembers.map((m) => ({ ...m }));
  const ownerId = assignedOwnerId.trim();
  if (!ownerId) return opts;

  const label =
    row.wallet?.ownerName?.trim()
    || opts.find((m) => m.id === ownerId)?.name
    || 'Assigned owner';

  const idx = opts.findIndex((m) => m.id === ownerId);
  if (idx >= 0) {
    if (!opts[idx].name || opts[idx].name === ownerId || UUID_RE.test(opts[idx].name)) {
      opts[idx] = { ...opts[idx], name: label };
    }
    return opts;
  }

  opts.unshift({ id: ownerId, name: label });
  return opts;
}

import { matchesCreditFilter, type CreditFilterKey } from '@/modules/credit/creditMath';

export type CreditStatusFilter = CreditDisplayStatus | CreditFilterKey;

interface CreditCustomerGridProps {
  rows: CreditGridRow[];
  teamMembers: TeamMemberOption[];
  canEdit: boolean;
  statusFilter: CreditStatusFilter;
  onRefresh: () => void;
  onAdvancedTerms: (row: CreditGridRow) => void;
}

export function CreditCustomerGrid({
  rows,
  teamMembers,
  canEdit,
  statusFilter,
  onRefresh,
  onAdvancedTerms,
}: CreditCustomerGridProps) {
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [repayRow, setRepayRow] = useState<CreditGridRow | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<'CASH' | 'NEFT' | 'CHEQUE'>('CASH');
  const [repaying, setRepaying] = useState(false);

  const filtered = useMemo(() => {
    if (statusFilter === 'ALL') return rows;
    const special: CreditFilterKey[] = [
      'FULLY_UTILIZED', 'NO_CREDIT', 'OVERDUE', 'HIGH_RISK',
      'ACTIVE', 'SUSPENDED', 'FROZEN', 'EXPIRED', 'CANCELLED', 'BLACKLISTED', 'BLOCKED',
    ];
    if (special.includes(statusFilter as CreditFilterKey)) {
      return rows.filter((r) => matchesCreditFilter({
        hasWallet: !!r.wallet && r.wallet.creditLimit > 0,
        status: r.wallet?.status,
        creditLimit: r.wallet?.creditLimit,
        availableCredit: r.wallet?.availableCredit,
        outstandingAmount: r.wallet?.outstandingAmount,
        overdueDays: r.wallet?.overdueDays,
      }, statusFilter as CreditFilterKey));
    }
    return rows.filter((r) => (r.wallet?.displayStatus ?? r.displayStatus) === statusFilter);
  }, [rows, statusFilter]);

  const getDraft = useCallback(
    (row: CreditGridRow): RowDraft => drafts[row.userId] ?? draftFromRow(row),
    [drafts],
  );

  const patchDraft = (userId: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => {
      const row = rows.find((r) => r.userId === userId);
      if (!row) return prev;
      const base = prev[userId] ?? draftFromRow(row);
      return { ...prev, [userId]: { ...base, ...patch } };
    });
  };

  const isDirty = (row: CreditGridRow) => {
    const d = getDraft(row);
    const base = draftFromRow(row);
    return (
      d.creditLimit !== base.creditLimit ||
      d.workflowStatus !== base.workflowStatus ||
      d.assignedOwnerId !== base.assignedOwnerId ||
      d.vendorNotes !== base.vendorNotes
    );
  };

  const saveRow = async (row: CreditGridRow) => {
    const d = getDraft(row);
    const limitNum = d.creditLimit.trim() === '' ? NaN : parseFloat(d.creditLimit);
    if (!Number.isFinite(limitNum) || limitNum < 0) {
      toast.error('Enter a valid credit limit');
      return;
    }

    setSavingId(row.userId);
    try {
      if (!row.wallet) {
        const res = await fetch('/api/v1/vendor/credit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: row.userId,
            creditLimit: limitNum,
            remark: 'Assigned from credit grid',
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to assign credit');
        const walletId = json.data?.id as string | undefined;
        if (walletId && (d.workflowStatus !== 'IN_PROGRESS' || d.assignedOwnerId || d.vendorNotes.trim())) {
          const patchRes = await fetch(`/api/v1/vendor/credit/${walletId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workflowStatus: d.workflowStatus,
              assignedOwnerId: d.assignedOwnerId || null,
              vendorNotes: d.vendorNotes.trim() || null,
            }),
          });
          const patchJson = await patchRes.json();
          if (!patchRes.ok || !patchJson.success) {
            throw new Error(patchJson.error?.message || 'Credit assigned but CRM fields failed to save');
          }
        }
      } else {
        const res = await fetch(`/api/v1/vendor/credit/${row.wallet.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creditLimit: limitNum,
            ...(!isSystemLocked(row) ? { workflowStatus: d.workflowStatus } : {}),
            assignedOwnerId: d.assignedOwnerId || null,
            vendorNotes: d.vendorNotes.trim() || null,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to save row');
      }

      toast.success('Saved');
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.userId];
        return next;
      });
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  const submitRepay = async () => {
    if (!repayRow?.wallet) return;
    const amount = parseFloat(repayAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setRepaying(true);
    try {
      const res = await fetch('/api/v1/vendor/credit/repay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: repayRow.wallet.id,
          amount,
          method: repayMethod,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Repayment failed');
      toast.success(`Recorded ${inr(amount)} repayment`);
      setRepayRow(null);
      setRepayAmount('');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Repayment failed');
    } finally {
      setRepaying(false);
    }
  };

  const inputCls =
    'w-full min-w-0 h-[34px] px-2.5 rounded-[8px] border border-[#EEEEEE] text-[12.5px] outline-none focus:border-primary/50 bg-white';

  return (
    <>
      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr className="bg-[#4F46E5] text-white">
              {['Customer Name', 'Status', 'Owner', 'Due date', 'Notes', 'Credit Limit', 'Outstanding', ''].map((h) => (
                <th
                  key={h}
                  className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide whitespace-nowrap first:pl-4 last:pr-4"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {filtered.map((row) => {
              const d = getDraft(row);
              const display = row.wallet?.displayStatus ?? row.displayStatus;
              const locked = isSystemLocked(row);
              const dirty = isDirty(row);
              const saving = savingId === row.userId;

              return (
                <tr key={row.userId} className={cn('hover:bg-[#FAFAFA]', dirty && 'bg-[#FFFBEB]/40')}>
                  <td className="px-4 py-2.5 align-top">
                    <p className="text-[13px] font-semibold text-[#181725]">{row.name}</p>
                    <p className="text-[11px] text-[#AEAEAE]">{row.phone ?? row.email ?? ''}</p>
                  </td>
                  <td className="px-3 py-2.5 align-top min-w-[130px]">
                    {locked ? (
                      <span className={cn('inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold', DISPLAY_STATUS[display].cls)}>
                        {DISPLAY_STATUS[display].label}
                      </span>
                    ) : canEdit ? (
                      <select
                        value={d.workflowStatus}
                        onChange={(e) => patchDraft(row.userId, { workflowStatus: e.target.value as WorkflowStatus })}
                        className={cn(inputCls, 'font-semibold')}
                      >
                        <option value="IN_PROGRESS">In progress</option>
                        <option value="SANCTIONED">Sanctioned</option>
                        <option value="COMPLETED">Completed</option>
                      </select>
                    ) : (
                      <span className={cn('inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold', DISPLAY_STATUS[display].cls)}>
                        {DISPLAY_STATUS[display].label}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top min-w-[140px]">
                    {canEdit ? (
                      <select
                        value={d.assignedOwnerId}
                        onChange={(e) => patchDraft(row.userId, { assignedOwnerId: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">Unassigned</option>
                        {ownerOptionsForRow(row, teamMembers, d.assignedOwnerId).map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[12.5px] text-[#7C7C7C]">{row.wallet?.ownerName ?? 'Unassigned'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top text-[12.5px] text-[#7C7C7C] whitespace-nowrap">
                    {formatDue(row.wallet?.currentDueDate)}
                  </td>
                  <td className="px-3 py-2.5 align-top min-w-[160px]">
                    {canEdit ? (
                      <input
                        type="text"
                        value={d.vendorNotes}
                        onChange={(e) => patchDraft(row.userId, { vendorNotes: e.target.value })}
                        placeholder="Notes"
                        className={inputCls}
                      />
                    ) : (
                      <span className="text-[12.5px] text-[#7C7C7C]">{row.wallet?.vendorNotes || '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top min-w-[110px]">
                    {canEdit ? (
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={d.creditLimit}
                        onChange={(e) => patchDraft(row.userId, { creditLimit: e.target.value })}
                        placeholder="0"
                        className={cn(inputCls, 'text-right font-semibold')}
                      />
                    ) : (
                      <span className="text-[12.5px] font-semibold">{row.wallet ? inr(row.wallet.creditLimit) : '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right text-[12.5px] font-semibold text-amber-700 whitespace-nowrap">
                    {row.wallet ? inr(row.wallet.outstandingAmount) : '—'}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex items-center gap-1.5 justify-end flex-wrap">
                      {canEdit && dirty && (
                        <button
                          type="button"
                          onClick={() => void saveRow(row)}
                          disabled={saving}
                          className="flex items-center gap-1 px-2.5 h-[30px] rounded-[8px] bg-primary text-white text-[11px] font-bold hover:bg-primary-dark disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Save
                        </button>
                      )}
                      {row.wallet && row.wallet.outstandingAmount > 0 && canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setRepayRow(row);
                            setRepayAmount(String(row.wallet!.outstandingAmount));
                          }}
                          className="flex items-center gap-1 px-2.5 h-[30px] rounded-[8px] border border-[#EEEEEE] text-[11px] font-semibold hover:border-primary/40"
                        >
                          <Banknote size={12} />
                          Pay
                        </button>
                      )}
                      {row.wallet && (
                        <button
                          type="button"
                          onClick={() => onAdvancedTerms(row)}
                          className="flex items-center gap-1 px-2.5 h-[30px] rounded-[8px] border border-[#EEEEEE] text-[11px] font-semibold hover:border-primary/40"
                          title="Advanced payment terms"
                        >
                          <Settings2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {repayRow?.wallet && (
        <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-[16px] w-full max-w-[400px] shadow-2xl p-6">
            <h3 className="text-[16px] font-bold text-[#181725] mb-1">Record payment</h3>
            <p className="text-[12px] text-[#AEAEAE] mb-4">{repayRow.name} · Outstanding {inr(repayRow.wallet.outstandingAmount)}</p>
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-semibold text-[#7C7C7C]">Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  className={cn(inputCls, 'mt-1 h-[40px]')}
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-[#7C7C7C]">Method</label>
                <select
                  value={repayMethod}
                  onChange={(e) => setRepayMethod(e.target.value as typeof repayMethod)}
                  className={cn(inputCls, 'mt-1 h-[40px]')}
                >
                  <option value="CASH">Cash</option>
                  <option value="NEFT">NEFT</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setRepayRow(null)}
                className="px-4 h-[38px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRepay()}
                disabled={repaying}
                className="px-4 h-[38px] rounded-[10px] bg-primary text-white text-[13px] font-bold disabled:opacity-50 flex items-center gap-2"
              >
                {repaying && <Loader2 size={14} className="animate-spin" />}
                Record
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const STATUS_FILTER_OPTIONS: Array<{ key: CreditDisplayStatus | 'ALL' | 'FULLY_UTILIZED' | 'NO_CREDIT' | 'OVERDUE' | 'HIGH_RISK'; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'SANCTIONED', label: 'Active / Sanctioned' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'FROZEN', label: 'Frozen' },
  { key: 'BLOCKED', label: 'Blocked' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'BLACKLISTED', label: 'Blacklisted' },
  { key: 'FULLY_UTILIZED', label: 'Fully utilized' },
  { key: 'NO_CREDIT', label: 'No credit assigned' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'HIGH_RISK', label: 'High risk' },
  { key: 'COMPLETED', label: 'Completed' },
];
