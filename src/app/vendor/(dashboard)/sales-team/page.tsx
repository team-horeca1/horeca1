'use client';

// Vendor Sales Team page — orchestrates the three tabs (Salespersons,
// Rules, Commissions). Tab selection lives in the URL via ?tab= so a
// browser-refresh from the Commissions tab doesn't dump the user back
// onto Salespersons.

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { useSession } from 'next-auth/react';
import { BadgeIndianRupee, Loader2, AlertCircle } from 'lucide-react';
import { SalespersonsTab } from '@/components/features/sales-team/SalespersonsTab';
import { RulesTab } from '@/components/features/sales-team/RulesTab';
import { CommissionsTab } from '@/components/features/sales-team/CommissionsTab';

type Tab = 'salespersons' | 'rules' | 'commissions';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'salespersons', label: 'Salespersons' },
  { id: 'rules', label: 'Rules' },
  { id: 'commissions', label: 'Commissions' },
];

export default function SalesTeamPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, status } = useSession();
  const { hasAny, loading: permsLoading, permissions } = usePermissions();
  const perms = [...permissions];
  const canSeeSalespersons = hasAny('salespersons.view');
  const canSeeCommissions = hasAny('commissions.view');
  const canSeeAny = canSeeSalespersons || canSeeCommissions;

  // Default tab honours the URL; on first paint, fall back to whichever
  // tab the user actually has perm to see. Saves a click for accountants
  // who only have commissions.view.
  const requested = (params?.get('tab') as Tab | null) ?? null;
  const initialTab: Tab =
    requested && TABS.some((t) => t.id === requested)
      ? requested
      : canSeeSalespersons
        ? 'salespersons'
        : 'commissions';

  const [tab, setTab] = useState<Tab>(initialTab);

  const setTabAndUrl = useCallback(
    (next: Tab) => {
      setTab(next);
      const search = new URLSearchParams(params?.toString() ?? '');
      search.set('tab', next);
      router.replace(`/vendor/sales-team?${search.toString()}`);
    },
    [params, router],
  );

  // Salespersons cached at this level so the Rules + Commissions tabs
  // can use them in dropdowns / display names without each tab
  // re-fetching. Loaded lazily on first visit.
  const [salespersons, setSalespersons] = useState<Array<{ id: string; name: string; isActive: boolean }>>([]);
  const [loadingSalespersons, setLoadingSalespersons] = useState(false);
  const refreshSalespersons = useCallback(async () => {
    if (!canSeeSalespersons) return;
    setLoadingSalespersons(true);
    try {
      const res = await fetch('/api/v1/vendor/salespersons?includeInactive=true');
      const json = await res.json();
      if (json.success) setSalespersons(json.data);
    } finally {
      setLoadingSalespersons(false);
    }
  }, [canSeeSalespersons]);

  useEffect(() => { refreshSalespersons(); }, [refreshSalespersons]);

  // Only block on initial load — a background session revalidation keeps
  // `session` populated and must not unmount any open salesperson modal.
  if ((status === 'loading' && !session) || permsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!canSeeAny) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <AlertCircle size={28} className="mx-auto text-amber-500 mb-3" />
        <h2 className="text-[16px] font-bold text-[#181725] mb-1">Access restricted</h2>
        <p className="text-[13px] text-[#7C7C7C]">
          You need at least <code className="bg-[#F5F5F5] px-1.5 py-0.5 rounded">salespersons.view</code> or{' '}
          <code className="bg-[#F5F5F5] px-1.5 py-0.5 rounded">commissions.view</code> to manage the sales team.
          Ask a Vendor Admin for access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[12px] bg-success-light flex items-center justify-center">
            <BadgeIndianRupee size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-[#181725]">Sales Team</h1>
            <p className="text-[12px] text-[#7C7C7C]">
              Salespersons, commission rules, and accrual reports for your vendor business.
            </p>
          </div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-[#EEEEEE]">
        {TABS.map((t) => {
          const disabled =
            (t.id === 'salespersons' && !canSeeSalespersons) ||
            ((t.id === 'rules' || t.id === 'commissions') && !canSeeCommissions);
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => !disabled && setTabAndUrl(t.id)}
              disabled={disabled}
              className={`px-5 py-3 text-[13px] font-bold transition-colors relative
                ${active ? 'text-primary' : 'text-[#7C7C7C] hover:text-[#181725]'}
                ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {t.label}
              {active && <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-primary" />}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      {tab === 'salespersons' && canSeeSalespersons && (
        <SalespersonsTab
          salespersons={salespersons}
          loading={loadingSalespersons}
          perms={perms}
          onChanged={refreshSalespersons}
        />
      )}
      {tab === 'rules' && canSeeCommissions && (
        <RulesTab
          salespersons={salespersons}
          perms={perms}
        />
      )}
      {tab === 'commissions' && canSeeCommissions && (
        <CommissionsTab
          salespersons={salespersons}
          perms={perms}
        />
      )}
    </div>
  );
}
