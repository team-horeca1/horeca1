'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Share2,
  Download,
  Copy,
  Check,
  MessageCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ShareableContent } from '@/lib/share-cards/types';
import { shareAbsoluteUrl } from '@/lib/share-cards/types';
import {
  downloadShareImage,
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

export function ShareSheet({ isOpen, onClose, content }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [origin, setOrigin] = useState('');
  const [ogReady, setOgReady] = useState(false);
  const [ogFailed, setOgFailed] = useState(false);
  const [ogObjectUrl, setOgObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!isOpen || !content) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    setCopied(false);
    setCodeCopied(false);
    setOgReady(false);
    setOgFailed(false);
    setOgObjectUrl(null);

    const imageUrl = content.preRenderedImageUrl || content.ogPath;
    prefetchShareImage(imageUrl);

    void (async () => {
      const blob = await getShareImageBlob(imageUrl);
      if (cancelled) return;
      if (!blob) {
        setOgFailed(true);
        return;
      }
      objectUrl = window.URL.createObjectURL(blob);
      setOgObjectUrl(objectUrl);
      setOgReady(true);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [isOpen, content]);

  if (!isOpen || !content) return null;

  const pageUrl = shareAbsoluteUrl(content.path, origin);
  const imageUrl = content.preRenderedImageUrl || content.ogPath;
  const shareText = content.text.includes(pageUrl)
    ? content.text
    : `${content.text}\n${pageUrl}`;
  const previewSrc = ogObjectUrl || content.image || null;
  const kindLabel =
    content.kind === 'article'
      ? 'Share Story'
      : content.kind === 'deal'
        ? 'Share Offer'
        : content.kind === 'collection'
          ? 'Share Collection'
          : content.kind === 'vendor'
            ? 'Share Store'
            : content.kind === 'brand'
              ? 'Share Brand'
              : 'Share Product';

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

  const handleWhatsApp = () => {
    openWhatsAppShare(shareText);
    toast.success('Opening WhatsApp...');
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const ok = await downloadShareImage(imageUrl, content.downloadName);
      if (ok) toast.success('Card image downloaded');
      else {
        setOgFailed(true);
        toast.error('Download unavailable — try Copy Link instead');
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleNativeShare = async () => {
    const result = await shareCard({
      title: content.title,
      text: content.text,
      url: pageUrl,
      imageUrl: ogReady ? imageUrl : null,
      skipFileWait: !ogReady,
    });
    if (result === 'copied') toast.success('Link copied');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={kindLabel}
        className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-divider overflow-hidden z-10 flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150 max-h-[90dvh]"
      >
        <div className="px-5 py-4 border-b border-divider flex items-center justify-between bg-cream/30">
          <div>
            <h3 className="text-[16px] font-bold text-text leading-tight">{kindLabel}</h3>
            <p className="text-[12px] text-text-secondary mt-0.5">
              WhatsApp, copy link, or save the card
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-9 rounded-full hover:bg-black/5 text-text-secondary flex items-center justify-center transition-colors"
            aria-label="Close share"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="bg-[#EFEAE2] p-3 rounded-2xl border border-divider/60 space-y-2">
            <div className="bg-white rounded-xl overflow-hidden shadow-xs">
              <div className="aspect-square bg-ivory relative overflow-hidden">
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewSrc}
                    alt={content.title}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center p-6">
                    <p className="text-[15px] font-bold text-primary text-center line-clamp-4">
                      {content.title}
                    </p>
                  </div>
                )}
                {!ogReady && !ogFailed ? (
                  <div className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 text-white text-[10px] font-semibold px-2.5 py-1">
                    <Loader2 size={11} className="animate-spin" />
                    Preparing card…
                  </div>
                ) : null}
              </div>
              <div className="p-3">
                <p className="text-[13px] font-bold text-text leading-tight line-clamp-2">
                  {content.title}
                </p>
                {content.subtitle ? (
                  <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-1">
                    {content.subtitle}
                  </p>
                ) : null}
                {content.priceLabel ? (
                  <p className="text-[13px] font-bold text-primary mt-1 tabular-nums">
                    {content.priceLabel}
                  </p>
                ) : null}
                <p className="text-[10px] text-text-muted mt-1.5 font-mono truncate">
                  {pageUrl.replace(/^https?:\/\//, '')}
                </p>
              </div>
            </div>
            {ogFailed ? (
              <p className="text-[11px] text-text-muted text-center">
                Card image unavailable — you can still copy the link or share on WhatsApp
              </p>
            ) : (
              <p className="text-[11px] text-text-muted text-center">
                Recipients see a rich preview when the link unfurls
              </p>
            )}
          </div>

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={handleWhatsApp}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-[14px] shadow-sm transition-transform active:scale-[0.98] min-h-12"
            >
              <MessageCircle size={18} className="fill-white" />
              Share to WhatsApp
            </button>

            <button
              type="button"
              onClick={() => void handleCopy()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-divider hover:border-primary/40 text-text font-semibold text-[13px] shadow-2xs transition-colors min-h-11"
            >
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              {copied ? 'Link Copied!' : 'Copy Link'}
            </button>

            {content.couponCode ? (
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ivory border border-divider hover:border-primary/40 text-text font-semibold text-[13px] transition-colors min-h-11"
              >
                {codeCopied ? (
                  <Check size={16} className="text-success" />
                ) : (
                  <Copy size={16} />
                )}
                {codeCopied ? 'Code Copied!' : `Copy code ${content.couponCode}`}
              </button>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={downloading || (!ogReady && !ogFailed)}
                onClick={() => void handleDownload()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-ivory hover:bg-cream border border-divider text-text-secondary text-[12px] font-semibold transition-colors disabled:opacity-60 min-h-11"
              >
                {downloading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                {downloading
                  ? 'Downloading…'
                  : ogFailed
                    ? 'Download unavailable'
                    : ogReady
                      ? 'Download Image'
                      : 'Preparing…'}
              </button>

              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-ivory hover:bg-cream border border-divider text-text-secondary text-[12px] font-semibold transition-colors min-h-11"
              >
                <Share2 size={14} />
                {typeof navigator !== 'undefined' && typeof navigator.share === 'function'
                  ? 'Share'
                  : 'More'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
