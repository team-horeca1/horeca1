'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AdminAssignCreditModal } from './AdminAssignCreditModal';
import { AdminCreditExplainer } from './AdminCreditExplainer';
import { AdminCreditKpiStrip } from './AdminCreditKpiStrip';
import { AdminCreditWalletCard } from './AdminCreditWalletCard';
import { ReactivateWalletModal } from './ReactivateWalletModal';
import {
  computeWalletStats,
  filterWalletsByStatus,
  STATUS_FILTER_OPTIONS,
  type CreditWalletRow,
  type StatusFilterKey,
} from './adminCreditTypes';

export function CreditLinesSection() {
  const [wallets, setWallets] = useState<CreditWalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [reactivateTarget, setReactivateTarget] = useState<CreditWalletRow | null>(null);

  const loadWallets = useCallback(() => {
    setLoading(true);
    const url = new URL('/api/v1/admin/credit', window.location.origin);
    if (search.trim()) url.searchParams.set('search', search.trim());
    if (statusFilter && statusFilter !== 'OVERDUE') url.searchParams.set('status', statusFilter);
    fetch(url.toString())
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setWallets(json.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(loadWallets, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadWallets, search]);

  const filtered = useMemo(() => filterWalletsByStatus(wallets, statusFilter), [wallets, statusFilter]);
  const stats = useMemo(() => computeWalletStats(wallets), [wallets]);

  const saveEdit = async (w: CreditWalletRow) => {
    const newLimit = Number(editValue);
    if (!Number.isFinite(newLimit) || newLimit < 0) {
      toast.error('Enter a valid credit limit');
      return;
    }
    const prevLimit = w.creditLimit;
    setBusyId(w.id);
    setWallets((ws) => ws.map((x) => (x.id === w.id ? { ...x, creditLimit: newLimit } : x)));
    setEditingId(null);
    try {
      const res = await fetch('/api/v1/admin/credit/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: w.userId,
          vendorId: w.vendorId,
          creditLimit: newLimit,
          remark: 'Credit limit updated by admin',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || json.message || 'Failed to update credit limit');
      toast.success('Credit limit updated');
      loadWallets();
    } catch (err) {
      setWallets((ws) => ws.map((x) => (x.id === w.id ? { ...x, creditLimit: prevLimit } : x)));
      toast.error(err instanceof Error ? err.message : 'Failed to update credit limit');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <AdminCreditKpiStrip
        lines={stats.lines}
        exposure={stats.exposure}
        outstanding={stats.outstanding}
        overdue={stats.overdue}
      />

      <AdminCreditExplainer />

      <div className="flex flex-wrap items-center gap-3">
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
              key={f.key || 'all'}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'px-3 h-[32px] rounded-full text-[12px] font-semibold transition-colors',
                statusFilter === f.key
                  ? 'bg-[#4F46E5] text-white'
                  : 'bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:border-[#4F46E5]/40',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowAssign(true)}
          className="ml-auto h-[38px] px-4 rounded-[10px] bg-[#299E60] text-white text-[12px] font-bold flex items-center gap-2 hover:bg-[#238a54] transition-colors shadow-sm"
        >
          <Plus size={14} />
          Assign Credit
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#299E60]" size={28} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] py-16 text-center shadow-sm">
          <CreditCard size={36} strokeWidth={1.5} className="text-[#E5E7EB] mx-auto mb-3" />
          <p className="text-[14px] font-bold text-[#AEAEAE]">No credit lines match</p>
          <button
            type="button"
            onClick={() => setShowAssign(true)}
            className="mt-3 text-[13px] font-semibold text-[#299E60] hover:underline"
          >
            Assign the first credit line
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((w) => (
            <AdminCreditWalletCard
              key={w.id}
              wallet={w}
              editing={editingId === w.id}
              editValue={editValue}
              busy={busyId === w.id}
              onStartEdit={() => {
                setEditingId(w.id);
                setEditValue(String(w.creditLimit));
              }}
              onEditValueChange={setEditValue}
              onSaveEdit={() => void saveEdit(w)}
              onCancelEdit={() => setEditingId(null)}
              onReactivate={() => setReactivateTarget(w)}
            />
          ))}
        </div>
      )}

      {showAssign && (
        <AdminAssignCreditModal onClose={() => setShowAssign(false)} onSuccess={loadWallets} />
      )}

      {reactivateTarget && (
        <ReactivateWalletModal
          customerName={reactivateTarget.user.fullName}
          walletId={reactivateTarget.id}
          onClose={() => setReactivateTarget(null)}
          onSuccess={() => {
            setWallets((ws) =>
              ws.map((x) => (x.id === reactivateTarget.id ? { ...x, status: 'ACTIVE' } : x)),
            );
            loadWallets();
          }}
        />
      )}
    </div>
  );
}
