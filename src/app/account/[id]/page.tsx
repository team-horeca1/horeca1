'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { AccountOverviewPanel } from '@/components/account/AccountOverviewPanel';

export default function AccountOverviewPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const fromPortal = searchParams.get('from');

  return <AccountOverviewPanel accountId={params.id} fromPortal={fromPortal} />;
}
