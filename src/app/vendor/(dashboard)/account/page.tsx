'use client';

import { Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AccountOverviewPanel } from '@/components/account/AccountOverviewPanel';
import { VendorOutletsManager } from '@/components/features/vendor/VendorOutletsManager';
import { VendorTeamPanel } from '@/components/features/vendor/VendorTeamPanel';
import { VendorAccountShell, parseVendorAccountTab, type VendorAccountTabId } from '@/components/features/vendor/account/VendorAccountShell';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';

function VendorAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseVendorAccountTab(searchParams.get('tab'));
  const { data: session } = useSession();
  const { currentAccount } = useBusinessAccountSwitcher();
  const accountId = (session?.user as { activeBusinessAccountId?: string } | undefined)?.activeBusinessAccountId;

  const goTab = (tab: VendorAccountTabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/vendor/account?${params.toString()}`, { scroll: false });
  };

  if (!accountId) {
    return (
      <div className="py-16 text-center text-[14px] text-[#7C7C7C]">
        No business account selected. Use the account switcher in the top bar.
      </div>
    );
  }

  return (
    <VendorAccountShell
      activeTab={activeTab}
      businessName={currentAccount?.displayName ?? currentAccount?.legalName}
    >
      {activeTab === 'overview' && (
        <AccountOverviewPanel
          accountId={accountId}
          fromPortal="vendor"
          onSelectTab={(t) => goTab(t === 'outlets' ? 'outlets' : 'team')}
        />
      )}
      {activeTab === 'outlets' && <VendorOutletsManager embedded />}
      {activeTab === 'team' && <VendorTeamPanel embedded />}
    </VendorAccountShell>
  );
}

export default function VendorAccountPage() {
  return (
    <Suspense fallback={(
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#299E60]" size={28} />
      </div>
    )}>
      <VendorAccountContent />
    </Suspense>
  );
}
