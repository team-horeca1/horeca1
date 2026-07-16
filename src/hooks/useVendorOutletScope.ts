'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';

const OUTLET_CHANGED_EVENT = 'vendor-outlet-changed';

export function emitVendorOutletChanged(outletId?: string | null) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(OUTLET_CHANGED_EVENT, { detail: { outletId: outletId ?? null } }),
    );
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

  const [multiWarehouseEnabled, setMultiWarehouseEnabled] = useState(true);
  const [scopeVersion, setScopeVersion] = useState(0);
  /** Last outlet id announced by Switch warehouse (beats stale React state for one tick). */
  const [pendingOutletId, setPendingOutletId] = useState<string | null>(null);

  const bump = useCallback(() => setScopeVersion((v) => v + 1), []);

  useEffect(() => {
    fetch('/api/v1/vendor/settings')
      .then((r) => r.json())
      .then((j) => { if (j.success) setMultiWarehouseEnabled(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onChange = (e: Event) => {
      const id = (e as CustomEvent<{ outletId?: string | null }>).detail?.outletId;
      if (id) setPendingOutletId(id);
      bump();
    };
    window.addEventListener(OUTLET_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(OUTLET_CHANGED_EVENT, onChange);
  }, [bump]);

  // Once React state catches up to the switched outlet, drop the pending override.
  useEffect(() => {
    if (pendingOutletId && activeOutletId === pendingOutletId) {
      setPendingOutletId(null);
    }
  }, [activeOutletId, pendingOutletId]);

  useEffect(() => {
    if (activeOutletId) bump();
  }, [activeOutletId, bump]);

  const scopedOutletId = pendingOutletId ?? activeOutletId;

  const outletQuery = useCallback((all = false) => {
    const params = new URLSearchParams();
    if (all) params.set('outletId', 'all');
    else if (scopedOutletId) params.set('outletId', scopedOutletId);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [scopedOutletId]);

  return {
    activeOutletId: scopedOutletId,
    currentOutlet: pendingOutletId
      ? (currentAccount?.outlets.find((o) => o.id === pendingOutletId) ?? currentOutlet)
      : currentOutlet,
    currentAccount,
    switching,
    switchOutlet: async (id: string) => {
      await switchOutlet(id);
      emitVendorOutletChanged(id);
    },
    multiWarehouseEnabled,
    scopeVersion,
    outletQuery,
    bump,
  };
}
