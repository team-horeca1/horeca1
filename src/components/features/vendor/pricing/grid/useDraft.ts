'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DraftCell } from '../types';

const storageKey = (vendorKey: string) => `h1-pricing-draft:${vendorKey}`;

export function useDraft(vendorKey: string | null, baseVersion: string | null) {
  const [dirty, setDirty] = useState<Record<string, DraftCell>>({});
  const [draftBaseVersion, setDraftBaseVersion] = useState<string | null>(null);
  const [restorePrompt, setRestorePrompt] = useState<{
    dirty: Record<string, DraftCell>;
    baseVersion: string | null;
  } | null>(null);

  useEffect(() => {
    if (!vendorKey) return;
    try {
      const raw = localStorage.getItem(storageKey(vendorKey));
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        dirty: Record<string, DraftCell>;
        baseVersion: string | null;
      };
      if (parsed?.dirty && Object.keys(parsed.dirty).length > 0) {
        setRestorePrompt(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [vendorKey]);

  useEffect(() => {
    if (!vendorKey) return;
    if (Object.keys(dirty).length === 0) {
      try { localStorage.removeItem(storageKey(vendorKey)); } catch { /* ignore */ }
      return;
    }
    try {
      localStorage.setItem(
        storageKey(vendorKey),
        JSON.stringify({ dirty, baseVersion: draftBaseVersion ?? baseVersion }),
      );
    } catch { /* ignore */ }
  }, [dirty, vendorKey, draftBaseVersion, baseVersion]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(dirty).length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const setCell = useCallback((key: string, value: DraftCell) => {
    setDirty((prev) => {
      if (draftBaseVersion == null && baseVersion != null) {
        setDraftBaseVersion(baseVersion);
      }
      return { ...prev, [key]: value };
    });
  }, [baseVersion, draftBaseVersion]);

  const clearDirty = useCallback(() => {
    setDirty({});
    setDraftBaseVersion(null);
    if (vendorKey) {
      try { localStorage.removeItem(storageKey(vendorKey)); } catch { /* ignore */ }
    }
  }, [vendorKey]);

  const restoreDraft = useCallback(() => {
    if (!restorePrompt) return;
    setDirty(restorePrompt.dirty);
    setDraftBaseVersion(restorePrompt.baseVersion);
    setRestorePrompt(null);
  }, [restorePrompt]);

  const discardRestore = useCallback(() => {
    setRestorePrompt(null);
    if (vendorKey) {
      try { localStorage.removeItem(storageKey(vendorKey)); } catch { /* ignore */ }
    }
  }, [vendorKey]);

  const changeCount = Object.keys(dirty).length;
  const isStale = changeCount > 0
    && draftBaseVersion != null
    && baseVersion != null
    && draftBaseVersion !== baseVersion;

  return {
    dirty,
    setDirty,
    setCell,
    clearDirty,
    changeCount,
    draftBaseVersion: draftBaseVersion ?? baseVersion,
    isStale,
    restorePrompt,
    restoreDraft,
    discardRestore,
  };
}
