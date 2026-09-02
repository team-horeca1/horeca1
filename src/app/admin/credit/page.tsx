'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CreditLinesSection } from '@/components/features/admin/credit/CreditLinesSection';
import { GlobalConfigSection } from '@/components/features/admin/credit/GlobalConfigSection';
import { ReportsSection } from '@/components/features/admin/credit/ReportsSection';
import { StatementSection } from '@/components/features/admin/credit/StatementSection';
import type { AdminCreditTabKey } from '@/components/features/admin/credit/adminCreditTypes';

const TABS: { key: AdminCreditTabKey; label: string }[] = [
  { key: 'lines', label: 'Credit Lines' },
  { key: 'reports', label: 'Reports' },
  { key: 'statement', label: 'Statement' },
  { key: 'config', label: 'Global Config' },
];

export default function AdminCreditPage() {
  const [tab, setTab] = useState<AdminCreditTabKey>('lines');

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-[24px] font-bold text-[#181725] leading-none mb-1">Credit &amp; Wallet</h1>
        <p className="text-[12px] text-[#AEAEAE]">
          Assign credit lines, monitor utilization, and tune global credit policy
        </p>
      </div>

      <div className="grid grid-cols-2 lg:flex bg-[#F5F5F5] rounded-[12px] p-1 gap-1 w-full lg:w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'min-h-12 lg:min-h-[34px] lg:h-[34px] px-3 lg:px-5 rounded-[10px] lg:rounded-[8px] text-[13px] font-semibold transition-all',
              tab === t.key ? 'bg-white text-[#181725] shadow-sm' : 'text-[#7C7C7C]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lines' && <CreditLinesSection />}
      {tab === 'reports' && <ReportsSection />}
      {tab === 'statement' && <StatementSection />}
      {tab === 'config' && <GlobalConfigSection />}
    </div>
  );
}
