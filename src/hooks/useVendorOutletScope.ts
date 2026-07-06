'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';

const OUTLET_CHANGED_EVENT = 'vendor-outlet-changed';

export function emitVendorOutletChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OUTLET_CHANGED_EVENT));
  }
}

/** Vendor portal: active warehouse + multi-warehouse flag + refetch subscription. */
export function useVendorOutletScope() {
  const {
    activeOutletId,
    currentOutlet,
    currentAccount,
    switching,
    switchOutlet,
  } = useBusinessAccountSwitcher();

  const [multiWarehouseEnabled, setMultiWarehouseEnabled] = useState(false);
  const [scopeVersion, setScopeVersion] = useState(0);

  const bump = useCallback(() => setScopeVersion((v) => v + 1), []);

  useEffect(() => {
    fetch('/api/v1/vendor/settings')
      .then((r) => r.json())
      .then((j) => { if (j.success) setMultiWarehouseEnabled(!!j.data.multiWarehouseEnabled); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onChange = () => bump();
    window.addEventListener(OUTLET_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(OUTLET_CHANGED_EVENT, onChange);
  }, [bump]);

  useEffect(() => {
    if (activeOutletId) bump();
  }, [activeOutletId, bump]);

  const outletQuery = (all = false) => {
    const params = new URLSearchParams();
    if (all) params.set('outletId', 'all');
    else if (activeOutletId) params.set('outletId', activeOutletId);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  };

  return {
    activeOutletId,
    currentOutlet,
    currentAccount,
    switching,
    switchOutlet: async (id: string) => {
      await switchOutlet(id);
      emitVendorOutletChanged();
    },
    multiWarehouseEnabled,
    scopeVersion,
    outletQuery,
    bump,
  };
}
