'use client';

import { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

type Row = {
  userId: string;
  name: string;
  phone: string | null;
  wallet: { creditLimit: number } | null;
};

export function BulkAssignCreditModal({
  customers,
  onClose,
  onDone,
}: {
  customers: Row[];
  onClose: () => void;
  onDone: () => void;
}) {
  const candidates = useMemo(
    () => customers.filter((c) => !c.wallet || c.wallet.creditLimit <= 0),
    [customers],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState('10000');
  const [tenure, setTenure] = useState('');
  const [grace, setGrace] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    const creditLimit = Number(limit);
    if (!Number.isFinite(creditLimit) || creditLimit <= 0) {
      toast.error('Enter a valid credit limit');
      return;
    }
    if (selected.size === 0) {
      toast.error('Select at least one customer');
      return;
    }
    const overrides: Record<string, number> = {};
    if (tenure.trim()) overrides.creditTenureDays = parseInt(tenure, 10);
    if (grace.trim()) overrides.gracePeriodDays = parseInt(grace, 10);

    setSaving(true);
    try {
      const res = await fetch('/api/v1/vendor/credit/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [...selected].map((userId) => ({
            userId,
            creditLimit,
            ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Bulk assign failed');
      const failed = (json.data?.failed as Array<{ userId: string; error: string }> | undefined) ?? [];
      toast.success(`Assigned credit to ${json.data?.succeeded ?? 0} customer(s)`);
      if (failed.length > 0) {
        toast.error(`${failed.length} row(s) failed — see details in console`);
        console.warn('[bulk credit]', failed);
      }
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk assign failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[520px] shadow-2xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-[#181725]">Bulk assign credit</h2>
            <p className="text-[12px] text-[#AEAEAE]">Select customers without an active credit line</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-[6px] hover:bg-[#F5F5F5]">
            <X size={16} className="text-[#AEAEAE]" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[12px] font-semibold text-[#7C7C7C] col-span-1">
              Limit (₹)
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="mt-1 w-full h-[38px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px]"
              />
            </label>
            <label className="text-[12px] font-semibold text-[#7C7C7C]">
              Tenure days
              <input
                type="number"
                value={tenure}
                onChange={(e) => setTenure(e.target.value)}
                placeholder="default"
                className="mt-1 w-full h-[38px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px]"
              />
            </label>
            <label className="text-[12px] font-semibold text-[#7C7C7C]">
              Grace days
              <input
                type="number"
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
                placeholder="default"
                className="mt-1 w-full h-[38px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px]"
              />
            </label>
          </div>
          <div className="border border-[#EEEEEE] rounded-[12px] max-h-[280px] overflow-y-auto divide-y divide-[#F3F3F3]">
            {candidates.length === 0 ? (
              <p className="p-4 text-[13px] text-[#AEAEAE]">All customers already have credit assigned.</p>
            ) : (
              candidates.map((c) => (
                <label key={c.userId} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#FAFAFA] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(c.userId)}
                    onChange={() => toggle(c.userId)}
                    className="rounded border-[#DDD]"
                  />
                  <span className="text-[13px] font-semibold text-[#181725] flex-1 truncate">{c.name}</span>
                  <span className="text-[11px] text-[#AEAEAE]">{c.phone ?? '—'}</span>
                </label>
              ))
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#EEEEEE] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-[38px] rounded-[10px] border border-[#EEEEEE] text-[13px] font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || selected.size === 0}
            className="px-4 h-[38px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Assign to {selected.size || '…'}
          </button>
        </div>
      </div>
    </div>
  );
}
