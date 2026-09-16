'use client';

import React, { useEffect, useState } from 'react';
import { X, Share2, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ShareableContent } from '@/lib/share-cards/types';
import { shareAbsoluteUrl } from '@/lib/share-cards/types';
import {
  getShareImageBlob,
  openWhatsAppShare,
  prefetchShareImage,
  shareCard,
} from '@/lib/share-cards/shareClient';

interface ShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  content: ShareableContent | null;
}

type BusyKey = 'whatsapp' | 'instagram' | 'share' | null;

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.74.46 3.44 1.33 4.94L2 22l5.37-1.4a10.1 10.1 0 0 0 4.67 1.14h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.76 14.16c-.24.68-1.4 1.25-1.94 1.33-.5.07-1.13.1-1.83-.11-.42-.14-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.93-4.36-.14-.2-1.16-1.54-1.16-2.94 0-1.4.73-2.08.99-2.36.26-.28.57-.35.76-.35h.55c.18 0 .42-.07.65.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.2-.14.31-.28.48-.14.16-.3.37-.42.5-.14.14-.29.29-.12.56.16.28.73 1.2 1.56 1.95 1.08.96 1.98 1.26 2.26 1.4.28.14.44.12.6-.07.16-.2.7-.81.88-1.09.18-.28.37-.23.61-.14.24.1 1.54.73 1.8.86.26.14.44.2.5.31.07.12.07.68-.17 1.36z"
      />
    </svg>
  );
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9A4.5 4.5 0 0 1 16.5 21h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3zm0 1.8A2.7 2.7 0 0 0 4.8 7.5v9a2.7 2.7 0 0 0 2.7 2.7h9a2.7 2.7 0 0 0 2.7-2.7v-9a2.7 2.7 0 0 0-2.7-2.7h-9zM17.1 6.2a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1zM12 7.4A4.6 4.6 0 1 1 7.4 12 4.6 4.6 0 0 1 12 7.4zm0 1.8A2.8 2.8 0 1 0 14.8 12 2.8 2.8 0 0 0 12 9.2z"
      />
    </svg>
  );
}

export function ShareSheet({ isOpen, onClose, content }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  const [ogReady, setOgReady] = useState(false);
  const [busy, setBusy] = useState<BusyKey>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!isOpen || !content) return;

    let cancelled = false;
    setCopied(false);
    setCodeCopied(false);
    setOgReady(false);
    setBusy(null);

    const imageUrl = content.preRenderedImageUrl || content.ogPath;
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
  const imageUrl = content.preRenderedImageUrl || content.ogPath;
  const shareText = content.text.includes(pageUrl)
    ? content.text
    : `${content.text}\n${pageUrl}`;

  const nativeShare = async (key: Exclude<BusyKey, null>) => {
    setBusy(key);
    try {
      const result = await shareCard({
        title: content.title,
        text: content.text,
        url: pageUrl,
        imageUrl,
        fileName: content.downloadName,
      });
      if (result === 'cancelled') return 'cancelled';
      if (result === 'shared') {
        onClose();
        return 'shared';
      }
      return result;
    } finally {
      setBusy(null);
    }
  };

  const handleWhatsApp = async () => {
    const result = await nativeShare('whatsapp');
    if (result === 'cancelled' || result === 'shared') return;
    openWhatsAppShare(shareText);
  };

  const handleInstagram = async () => {
    const result = await nativeShare('instagram');
    if (result === 'cancelled' || result === 'shared') return;
    toast.error('Instagram needs the card image — tap Share and pick Instagram');
  };

  const handleNativeShare = async () => {
    const result = await nativeShare('share');
    if (result === 'copied') {
      toast.success('Link copied');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
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

  const actions = [
    {
      key: 'whatsapp' as const,
      label: 'WhatsApp',
      onClick: () => void handleWhatsApp(),
      className: 'bg-[#25D366] text-white',
      icon: <WhatsAppGlyph className="size-6" />,
    },
    {
      key: 'instagram' as const,
      label: 'Instagram',
      onClick: () => void handleInstagram(),
      className: 'bg-[linear-gradient(45deg,#f58529,#dd2a7b,#8134af)] text-white',
      icon: <InstagramGlyph className="size-6" />,
    },
    {
      key: 'copy' as const,
      label: copied ? 'Copied' : 'Copy link',
      onClick: () => void handleCopy(),
      className: 'bg-ivory text-primary border border-divider',
      icon: copied ? <Check size={22} strokeWidth={2.4} /> : <Copy size={22} strokeWidth={2.2} />,
    },
    {
      key: 'share' as const,
      label: 'Share',
      onClick: () => void handleNativeShare(),
      className: 'bg-primary text-white',
      icon: <Share2 size={22} strokeWidth={2.2} />,
    },
  ];

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

        <div className="flex items-start gap-3 mb-4">
          {content.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={content.image}
              alt=""
              className="size-11 rounded-lg object-contain bg-ivory border border-divider shrink-0"
            />
          ) : (
            <div className="size-11 rounded-lg bg-primary-light shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-text leading-tight line-clamp-2">
              {content.title}
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-1">
              {ogReady ? 'Card ready' : 'Preparing card…'}
              {content.priceLabel ? ` · ${content.priceLabel}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 rounded-full hover:bg-black/5 text-text-secondary flex items-center justify-center shrink-0"
            aria-label="Close share"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {actions.map((action) => {
            const isBusy = busy === action.key;
            return (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                disabled={busy !== null}
                className="flex flex-col items-center gap-1.5 min-h-12 disabled:opacity-60"
              >
                <span
                  className={`size-12 rounded-full flex items-center justify-center ${action.className}`}
                >
                  {isBusy ? <Loader2 size={22} className="animate-spin" /> : action.icon}
                </span>
                <span className="text-[11px] font-medium text-text-secondary">{action.label}</span>
              </button>
            );
          })}
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
