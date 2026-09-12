'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { SUPPLIER_HUB_PATH, supplierDashboardPath } from '@/lib/businessCapability';
import { setEnteredStore } from '@/lib/supplierPortalLevel';

type AccountRow = { id: string; isVendor?: boolean };

/** Dashboard is the business picker — never land on KPI tiles. */
export default function SupplierOverviewRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    setEnteredStore(false);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/account', { cache: 'no-store' });
        const json = await res.json();
        const ids = (json.success ? (json.data as AccountRow[]) : [])
          .filter((a) => a.isVendor)
          .map((a) => a.id);
        if (!cancelled) router.replace(supplierDashboardPath(ids));
      } catch {
        if (!cancelled) router.replace(SUPPLIER_HUB_PATH);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex justify-center py-20" data-testid="supplier-overview-redirect">
      <Loader2 className="animate-spin text-primary" size={32} />
      <span className="sr-only">Opening your supplier businesses</span>
    </div>
  );
}
