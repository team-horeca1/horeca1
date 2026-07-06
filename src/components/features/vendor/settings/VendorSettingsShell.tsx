'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SETTINGS_TABS, type SettingsTabId } from './types';

interface Props {
  activeTab: SettingsTabId;
  children: React.ReactNode;
  userEmail?: string;
}

export function VendorSettingsShell({ activeTab, children, userEmail }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setTab = (tab: SettingsTabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/vendor/settings?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="w-full pb-10">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-[clamp(1.35rem,2.5vw,1.75rem)] font-bold text-[#181725] leading-none mb-1">Settings</h1>
          <p className="text-[13px] text-[#7C7C7C]">Manage your store configuration</p>
        </div>
        <Link
          href="/profile?from=vendor"
          className="flex items-center justify-between gap-3 rounded-[12px] border border-[#EEEEEE] bg-white px-4 py-2.5 hover:bg-[#FAFAFA] transition-colors xl:min-w-[320px] shrink-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[32px] h-[32px] rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
              <User size={15} className="text-[#666]" />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[#181725]">Personal profile</p>
              <p className="text-[10px] text-[#AEAEAE] truncate">{userEmail ?? 'Sign-in details'}</p>
            </div>
          </div>
          <ChevronRight size={14} className="text-[#AEAEAE] shrink-0" />
        </Link>
      </div>

      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-[12px] border border-[#EEEEEE] bg-white p-1">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-colors whitespace-nowrap',
              activeTab === t.id ? 'bg-[#181725] text-white' : 'text-[#666] hover:bg-[#F8F8F8]',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
        <div className="p-[clamp(1rem,2vw,1.75rem)]">{children}</div>
      </div>
    </div>
  );
}
