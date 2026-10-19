'use client';

import React, { useEffect, useState } from 'react';
import { X, Share2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ShareableContent } from '@/lib/share-cards/types';
import { shareAbsoluteUrl } from '@/lib/share-cards/types';
import {
  getShareImageBlob,
  prefetchShareImage,
  shareCard,
} from '@/lib/share-cards/shareClient';

interface ShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  content: ShareableContent | null;
}

export function ShareSheet({ isOpen, onClose, content }: ShareSheetProps) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  const [ogReady, setOgReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!isOpen || !content) return;

    let cancelled = false;
    setCodeCopied(false);
    setOgReady(false);
    setBusy(false);

    // Always use the live OG route (Redis/memory cached) — never stale ImageKit PNGs.
    const imageUrl = content.ogPath;
    prefetchShareImage(imageUrl);

    void (async () => {
      const blob = await getShareImageBlob(imageUrl);
      if (!cancelled) setOgReady(!!blob);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, content]);

  if (!isOpen || !content) return null;

  const pageUrl = shareAbsoluteUrl(content.path, origin);
  const imageUrl = content.ogPath;

  const handleNativeShare = async () => {
    setBusy(true);
    try {
      const result = await shareCard({
        title: content.title,
        text: content.text,
        url: pageUrl,
        imageUrl,
        fileName: content.downloadName,
      });
      if (result === 'cancelled') return;
      if (result === 'shared') {
        onClose();
        return;
      }
      if (result === 'copied') toast.success('Link copied');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCode = async () => {
    if (!content.couponCode) return;
    try {
      await navigator.clipboard.writeText(content.couponCode);
      setCodeCopied(true);
      toast.success(`Copied ${content.couponCode} — apply at checkout`);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      toast.error('Could not copy code');
    }
  };

  return (
    <div className="fixed inset-0 z-[10020] flex items-end justify-center px-0 pt-0 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:p-6 animate-in fade-in duration-150">
      <div
        className="fixed inset-0 bg-black/45"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share"
        className="relative w-full max-w-md bg-white rounded-t-2xl lg:rounded-2xl shadow-2xl border-t lg:border border-divider z-10 px-4 pt-3 pb-4 animate-in slide-in-from-bottom-4 duration-150"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-divider sm:hidden" />

        {/* Header bar */}
        <div className="flex items-start gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-text leading-tight line-clamp-1">
              {content.title}
            </p>
            <p className="text-[12px] text-text-secondary mt-0.5 line-clamp-1">
              {ogReady ? 'Card ready' : 'Generating card…'}
              {content.priceLabel ? ` · ${content.priceLabel}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-full hover:bg-black/5 text-text-secondary flex items-center justify-center shrink-0"
            aria-label="Close share"
          >
            <X size={18} />
          </button>
        </div>

        {/* Card Preview Box */}
        <div className="flex justify-center my-3">
          <div className="relative w-[180px] h-[225px] rounded-xl overflow-hidden shadow-sm border border-divider/60 bg-[#F8FAFC] flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={content.title}
              className="w-full h-full object-contain"
              loading="eager"
              onLoad={() => setOgReady(true)}
            />
            {!ogReady && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void handleNativeShare()}
            disabled={busy}
            className="flex flex-col items-center gap-1.5 min-h-12 disabled:opacity-60"
          >
            <span className="size-12 rounded-full flex items-center justify-center bg-primary text-white">
              {busy ? <Loader2 size={22} className="animate-spin" /> : <Share2 size={22} strokeWidth={2.2} />}
            </span>
            <span className="text-[11px] font-medium text-text-secondary">Share</span>
          </button>
        </div>

        {content.couponCode ? (
          <button
            type="button"
            onClick={() => void handleCopyCode()}
            className="mt-3 w-full min-h-11 rounded-xl border border-divider bg-ivory text-[13px] font-semibold text-text"
          >
            {codeCopied ? 'Code copied' : `Copy code ${content.couponCode}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
