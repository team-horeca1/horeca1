'use client';

import { useEffect, useState } from 'react';
import { useStableSession } from '@/hooks/useStableSession';

export interface CustomerCreditSummary {
  availableCredit: number;
  outstandingAmount: number;
  currentDueDate: string | null;
  hasWallet: boolean;
}

/**
 * Aggregates the logged-in customer's DiSCCO credit wallets.
 * Used by CreditStatusStrip (show) and CreditPromoBanner (hide when wallet exists).
 */
export function useCustomerCreditSummary() {
  const { isAuthenticated } = useStableSession();
  const [summary, setSummary] = useState<CustomerCreditSummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      queueMicrotask(() => {
        setSummary(null);
        setLoaded(true);
      });
      return;
    }

    let cancelled = false;
    fetch('/api/v1/wallet', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const wallets = Array.isArray(json?.data) ? json.data : [];
        if (wallets.length === 0) {
          setSummary({ availableCredit: 0, outstandingAmount: 0, currentDueDate: null, hasWallet: false });
          setLoaded(true);
          return;
        }

        let available = 0;
        let outstanding = 0;
        let nearestDue: string | null = null;

        for (const w of wallets) {
          available += Number(w.availableCredit) || 0;
          outstanding += Number(w.outstandingAmount) || 0;
          const due = w.currentDueDate as string | null | undefined;
          if (due && outstanding > 0) {
            if (!nearestDue || new Date(due).getTime() < new Date(nearestDue).getTime()) {
              nearestDue = due;
            }
          }
        }

        setSummary({
          availableCredit: available,
          outstandingAmount: outstanding,
          currentDueDate: nearestDue,
          hasWallet: true,
        });
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return { summary, loaded, isAuthenticated };
}
