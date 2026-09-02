'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, Loader2, Plus, Search } from 'lucide-react';
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
  const [showAssign, setShowAssign] = useState(false);
  const [editingWallet, setEditingWallet] = useState<CreditWalletRow | null>(null);
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

  const closeAssign = () => {
    setShowAssign(false);
    setEditingWallet(null);
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
            className="w-full h-12 pl-8 pr-3 rounded-[12px] border border-[#EEEEEE] text-[13px] outline-none focus:border-[#6B1D2E]/40 bg-white"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((f) => (
            <button
              key={f.key || 'all'}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'min-h-12 lg:h-[32px] lg:min-h-0 px-3.5 rounded-full text-[13px] lg:text-[12px] font-semibold transition-colors',
                statusFilter === f.key
                  ? 'bg-primary text-white'
                  : 'bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:border-primary/40',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingWallet(null);
            setShowAssign(true);
          }}
          className="w-full sm:w-auto sm:ml-auto min-h-12 px-4 rounded-[12px] bg-[#6B1D2E] text-white text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-[#5A1926] transition-colors shadow-sm"
        >
          <Plus size={14} />
          Assign Credit
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#6B1D2E]" size={28} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] py-16 text-center shadow-sm">
          <CreditCard size={36} strokeWidth={1.5} className="text-[#E5E7EB] mx-auto mb-3" />
          <p className="text-[14px] font-bold text-[#AEAEAE]">No credit lines match</p>
          <button
            type="button"
            onClick={() => {
              setEditingWallet(null);
              setShowAssign(true);
            }}
            className="mt-3 text-[13px] font-semibold text-[#6B1D2E] hover:underline"
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
              busy={false}
              onEdit={() => {
                setShowAssign(false);
                setEditingWallet(w);
              }}
              onReactivate={() => setReactivateTarget(w)}
            />
          ))}
        </div>
      )}

      {(showAssign || editingWallet) && (
        <AdminAssignCreditModal
          editing={editingWallet}
          onClose={closeAssign}
          onSuccess={loadWallets}
        />
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
