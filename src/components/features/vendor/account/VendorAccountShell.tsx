'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { getVendorAccountTabPermission } from '@/lib/permissions/routePermissions';

export type VendorAccountTabId = 'overview' | 'outlets' | 'team';

const TABS: { id: VendorAccountTabId; label: string; icon: typeof Building2 }[] = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'outlets', label: 'Outlets', icon: MapPin },
  { id: 'team', label: 'Team & roles', icon: Users },
];

interface Props {
  activeTab: VendorAccountTabId;
  businessName?: string;
  children: React.ReactNode;
}

export function VendorAccountShell({ activeTab, businessName, children }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();

  const visibleTabs = TABS.filter((t) => {
    const need = getVendorAccountTabPermission(t.id);
    return need ? can(need) : false;
  });

  const setTab = (tab: VendorAccountTabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/vendor/account?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="w-full pb-10">
      <div className="mb-4">
        <h1 className="text-[clamp(1.35rem,2.5vw,1.75rem)] font-bold text-[#181725] leading-none mb-1">
          Business account
        </h1>
        <p className="text-[13px] text-[#7C7C7C]">
          {businessName ? `${businessName} · ` : ''}GST, outlets, team &amp; permissions
        </p>
      </div>

      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-[12px] border border-[#EEEEEE] bg-white p-1">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'shrink-0 flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-colors whitespace-nowrap',
                activeTab === t.id ? 'bg-[#181725] text-white' : 'text-[#666] hover:bg-[#F8F8F8]',
              )}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        <div className="p-[clamp(1rem,2vw,1.5rem)]">{children}</div>
      </div>
    </div>
  );
}

export function parseVendorAccountTab(raw: string | null): VendorAccountTabId {
  if (raw === 'outlets' || raw === 'team') return raw;
  return 'overview';
}
