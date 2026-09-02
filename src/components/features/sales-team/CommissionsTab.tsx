'use client';

// Commissions tab — filter bar + accruals table + per-row action buttons.
// Reads from /api/v1/vendor/commissions; state transitions hit the per-id
// approve / cancel / paid endpoints.

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Loader2, Check, X, AlertCircle, IndianRupee, Filter, Receipt, Download } from 'lucide-react';
import { toast } from 'sonner';

type Status = 'pending' | 'approved' | 'paid' | 'cancelled';

interface AccrualRow {
  id: string;
  status: Status;
  baseAmount: string;
  ratePercent: string | null;
  rateFixed: string | null;
  accruedAmount: string;
  period: string;
  approvedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  salesperson: { id: string; name: string };
  order: {
    id: string;
    orderNumber: string;
    totalAmount: string;
    createdAt: string;
    deliveredAt: string | null;
    status: string;
    user: { id: string; fullName: string; businessName: string | null };
  };
  approver: { id: string; fullName: string } | null;
}

interface SummaryRow {
  salespersonId: string;
  salespersonName: string;
  pending: number;
  approved: number;
  paid: number;
  cancelled: number;
  total: number;
  count: number;
}

interface Props {
  salespersons: Array<{ id: string; name: string; isActive: boolean }>;
  perms: string[];
}

// Generate the last 12 months as period options. Defaults to current.
function periodOptions(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    out.push({
      value: `${y}-${m}`,
      label: d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    });
  }
  return out;
}

export function CommissionsTab({ salespersons, perms }: Props) {
  const canApprove = perms.includes('commissions.approve');
  const periods = useMemo(periodOptions, []);
  const [period, setPeriod] = useState(periods[0]?.value ?? '');
  const [salespersonId, setSalespersonId] = useState('');
  const [status, setStatus] = useState<Status | ''>('');

  const [accruals, setAccruals] = useState<AccrualRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [paidDialog, setPaidDialog] = useState<AccrualRow | null>(null);
  const [cancelDialog, setCancelDialog] = useState<AccrualRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (period) qs.set('period', period);
      if (salespersonId) qs.set('salespersonId', salespersonId);
      if (status) qs.set('status', status);
      const [listRes, sumRes] = await Promise.all([
        fetch(`/api/v1/vendor/commissions?${qs.toString()}`).then((r) => r.json()),
        fetch(`/api/v1/vendor/commissions/summary?${period ? `period=${period}` : ''}`).then((r) => r.json()),
      ]);
      if (listRes.success) setAccruals(listRes.data);
      if (sumRes.success) setSummary(sumRes.data);
    } finally {
      setLoading(false);
    }
  }, [period, salespersonId, status]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleApprove = async (acc: AccrualRow) => {
    try {
      const res = await fetch(`/api/v1/vendor/commissions/${acc.id}/approve`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed');
      toast.success(`Approved ${acc.salesperson.name}'s commission`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const exportCsv = () => {
    if (accruals.length === 0) {
      toast.error('No accruals to export');
      return;
    }
    const rows = [
      ['Order', 'Customer', 'Salesperson', 'Order value (₹)', 'Commission (₹)', 'Rate', 'Status', 'Period', 'Created'],
      ...accruals.map((a) => [
        a.order.orderNumber,
        a.order.user.businessName ?? a.order.user.fullName,
        a.salesperson.name,
        String(Number(a.order.totalAmount)),
        String(Number(a.accruedAmount)),
        a.ratePercent != null ? `${a.ratePercent}%` : `₹${a.rateFixed} flat`,
        a.status,
        a.period,
        new Date(a.createdAt).toLocaleDateString('en-IN'),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commissions-${period || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {summary.slice(0, 6).map((s) => (
            <div key={s.salespersonId} className="bg-white border border-[#EEEEEE] rounded-[12px] p-4">
              <p className="text-[12px] font-bold text-[#7C7C7C] truncate">{s.salespersonName}</p>
              <p className="text-[22px] font-bold text-[#181725] mt-1">₹{s.total.toLocaleString('en-IN')}</p>
              <p className="text-[10.5px] text-[#AEAEAE] mt-0.5">{s.count} accrual{s.count !== 1 ? 's' : ''} this period</p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {s.pending > 0 && <Pill tone="amber">₹{s.pending.toLocaleString('en-IN')} pending</Pill>}
                {s.approved > 0 && <Pill tone="blue">₹{s.approved.toLocaleString('en-IN')} approved</Pill>}
                {s.paid > 0 && <Pill tone="green">₹{s.paid.toLocaleString('en-IN')} paid</Pill>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white border border-[#EEEEEE] rounded-[12px] p-3 flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-[#7C7C7C] ml-1" />
        <select
          value={period} onChange={(e) => setPeriod(e.target.value)}
          className="h-[36px] border border-[#EEEEEE] rounded-[10px] px-3 text-[12.5px] bg-white"
        >
          {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select
          value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}
          className="h-[36px] border border-[#EEEEEE] rounded-[10px] px-3 text-[12.5px] bg-white"
        >
          <option value="">All salespersons</option>
          {salespersons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={status} onChange={(e) => setStatus(e.target.value as Status | '')}
          className="h-[36px] border border-[#EEEEEE] rounded-[10px] px-3 text-[12.5px] bg-white"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={loading || accruals.length === 0}
          className="ml-auto h-[36px] px-3 rounded-[10px] border border-[#EEEEEE] bg-white text-[12px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] flex items-center gap-1.5 disabled:opacity-50"
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {/* Accrual list */}
      <div className="bg-white border border-[#EEEEEE] rounded-[12px] overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : accruals.length === 0 ? (
          <div className="py-12 text-center">
            <Receipt size={20} className="mx-auto text-[#AEAEAE] mb-2" />
            <p className="text-[13px] font-bold text-[#181725]">No accruals for this filter</p>
            <p className="text-[12px] text-[#7C7C7C]">
              Accruals are auto-generated when an order is delivered AND the customer has a salesperson assigned.
            </p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-[#FAFAFA]">
              <tr>
                <th className="text-left px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Order</th>
                <th className="text-left px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Customer</th>
                <th className="text-left px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Salesperson</th>
                <th className="text-right px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Order Value</th>
                <th className="text-right px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Commission</th>
                <th className="text-center px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Status</th>
                <th className="text-right px-4 py-3 font-bold text-[#7C7C7C] uppercase tracking-wider text-[10.5px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accruals.map((a) => (
                <tr key={a.id} className="border-t border-[#F5F5F5] hover:bg-[#FAFAFA]/60">
                  <td className="px-4 py-3 font-mono text-[11.5px] text-[#181725]">{a.order.orderNumber}</td>
                  <td className="px-4 py-3 text-[#7C7C7C] max-w-[160px] truncate">{a.order.user.businessName ?? a.order.user.fullName}</td>
                  <td className="px-4 py-3 font-bold text-[#181725]">{a.salesperson.name}</td>
                  <td className="px-4 py-3 text-right text-[#7C7C7C]">₹{Number(a.order.totalAmount).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-[#181725]">₹{Number(a.accruedAmount).toLocaleString('en-IN')}</span>
                    <span className="block text-[10.5px] text-[#AEAEAE]">
                      {a.ratePercent != null ? `${a.ratePercent}%` : `₹${a.rateFixed} flat`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center"><StatusPill status={a.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {canApprove && (
                      <div className="flex items-center justify-end gap-1">
                        {a.status === 'pending' && (
                          <button
                            onClick={() => handleApprove(a)}
                            className="px-2 py-1 text-[11px] font-bold bg-success-light hover:bg-[#D1FAE5] text-primary rounded-[6px]"
                          >
                            Approve
                          </button>
                        )}
                        {a.status === 'approved' && (
                          <button
                            onClick={() => setPaidDialog(a)}
                            className="px-2 py-1 text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-[6px]"
                          >
                            Mark Paid
                          </button>
                        )}
                        {(a.status === 'pending' || a.status === 'approved') && (
                          <button
                            onClick={() => setCancelDialog(a)}
                            className="px-2 py-1 text-[11px] font-bold bg-red-50 hover:bg-red-100 text-red-600 rounded-[6px]"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {paidDialog && (
        <PaidDialog
          accrual={paidDialog}
          onClose={() => setPaidDialog(null)}
          onDone={() => { setPaidDialog(null); refresh(); }}
        />
      )}
      {cancelDialog && (
        <CancelDialog
          accrual={cancelDialog}
          onClose={() => setCancelDialog(null)}
          onDone={() => { setCancelDialog(null); refresh(); }}
        />
      )}
    </div>
  );
}

function Pill({ tone, children }: { tone: 'amber' | 'blue' | 'green'; children: React.ReactNode }) {
  const map = {
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-success-light text-success',
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${map[tone]}`}>{children}</span>;
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    pending: 'bg-amber-50 text-amber-700',
    approved: 'bg-blue-50 text-blue-700',
    paid: 'bg-success-light text-success',
    cancelled: 'bg-gray-50 text-gray-500',
  };
  return <span className={`text-[10.5px] font-bold capitalize px-2 py-0.5 rounded-full ${map[status]}`}>{status}</span>;
}

function PaidDialog({
  accrual,
  onClose,
  onDone,
}: {
  accrual: AccrualRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/vendor/commissions/${accrual.id}/paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: reference.trim() }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error?.message || 'Failed'); return; }
      toast.success('Marked paid');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[15000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[420px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
          <h3 className="text-[15px] font-bold text-[#181725]">Mark commission paid</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={16} className="text-[#7C7C7C]" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="p-3 bg-[#F8FAFC] rounded-[10px] border border-[#EEEEEE]">
            <p className="text-[12px] text-[#7C7C7C]">
              Marking <strong>₹{Number(accrual.accruedAmount).toLocaleString('en-IN')}</strong> as paid to{' '}
              <strong>{accrual.salesperson.name}</strong> for order {accrual.order.orderNumber}.
            </p>
            <p className="text-[11px] text-[#AEAEAE] mt-1">
              Horeca1 does not move money; this records that you disbursed it offline.
            </p>
          </div>
          <div>
            <label className="block text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">
              Reference <span className="text-red-400">*</span>
            </label>
            <input
              type="text" autoFocus
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UPI txn ID, NEFT ref, cheque no…"
              className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 bg-[#FAFAFA] focus:bg-white transition-all"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-[10px]">
              <AlertCircle size={13} className="text-red-500 shrink-0" />
              <p className="text-[12px] text-red-700">{error}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#F0F0F0] bg-[#FAFAFA] rounded-b-[16px]">
          <button onClick={onClose} disabled={saving} className="h-[38px] px-4 text-[#7C7C7C] hover:text-[#181725] text-[12.5px] font-bold">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !reference.trim()}
            className="h-[38px] px-5 bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-white rounded-[10px] text-[12.5px] font-bold flex items-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <IndianRupee size={13} />}
            Mark paid
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelDialog({
  accrual,
  onClose,
  onDone,
}: {
  accrual: AccrualRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/vendor/commissions/${accrual.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error?.message || 'Failed'); return; }
      toast.success('Accrual cancelled');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[15000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[420px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
          <h3 className="text-[15px] font-bold text-[#181725]">Cancel commission</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={16} className="text-[#7C7C7C]" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="p-3 bg-red-50 rounded-[10px] border border-red-100">
            <p className="text-[12px] text-red-700">
              Cancelling ₹{Number(accrual.accruedAmount).toLocaleString('en-IN')} to {accrual.salesperson.name}.
              This is a terminal state — accrual cannot be revived.
            </p>
          </div>
          <div>
            <label className="block text-[10.5px] font-bold text-[#AEAEAE] uppercase tracking-wider mb-1">
              Reason (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Order returned, duplicate accrual, etc."
              rows={3}
              className="w-full border border-[#EEEEEE] rounded-[10px] px-3 py-2 text-[13px] outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 bg-[#FAFAFA] focus:bg-white transition-all resize-none"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-[10px]">
              <AlertCircle size={13} className="text-red-500 shrink-0" />
              <p className="text-[12px] text-red-700">{error}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#F0F0F0] bg-[#FAFAFA] rounded-b-[16px]">
          <button onClick={onClose} disabled={saving} className="h-[38px] px-4 text-[#7C7C7C] hover:text-[#181725] text-[12.5px] font-bold">
            Keep
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="h-[38px] px-5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-[10px] text-[12.5px] font-bold flex items-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Cancel commission
          </button>
        </div>
      </div>
    </div>
  );
}
