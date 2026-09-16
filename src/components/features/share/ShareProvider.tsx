'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ShareableContent } from '@/lib/share-cards/types';
import { ShareSheet } from '@/components/features/share/ShareSheet';
import { prefetchShareImage } from '@/lib/share-cards/shareClient';

type ShareContextValue = {
  openShare: (content: ShareableContent) => void;
  prefetch: (content: ShareableContent) => void;
};

const ShareContext = createContext<ShareContextValue | null>(null);

export function ShareProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ShareableContent | null>(null);
  const [open, setOpen] = useState(false);

  const prefetch = useCallback((c: ShareableContent) => {
    const url = c.preRenderedImageUrl || c.ogPath;
    prefetchShareImage(url);
  }, []);

  const openShare = useCallback(
    (c: ShareableContent) => {
      // Open sheet synchronously — never await OG generation.
      setContent(c);
      setOpen(true);
      prefetch(c);
    },
    [prefetch],
  );

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const value = useMemo(
    () => ({ openShare, prefetch }),
    [openShare, prefetch],
  );

  return (
    <ShareContext.Provider value={value}>
      {children}
      <ShareSheet isOpen={open} onClose={close} content={content} />
    </ShareContext.Provider>
  );
}

export function useShare(): ShareContextValue {
  const ctx = useContext(ShareContext);
  if (!ctx) {
    // Graceful no-op outside storefront (should not happen for share buttons).
    return {
      openShare: () => {},
      prefetch: () => {},
    };
  }
  return ctx;
}
