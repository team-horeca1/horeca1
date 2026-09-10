'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Download,
  Copy,
  Check,
  MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';

export type VoiceShareData = {
  slug: string;
  name: string;
  role?: string | null;
  venue?: string | null;
  quote: string;
  badge?: string;
  photoUrl?: string | null;
  category?: string;
};

// Also keep InshortsShareData alias for backward compatibility
export type InshortsShareData = VoiceShareData;

interface VoiceShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: VoiceShareData;
}

export function VoiceShareModal({ isOpen, onClose, story }: VoiceShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  if (!isOpen) return null;

  const articleUrl = `${origin || ''}/voices/${story.slug}`;
  const ogImageUrl = `/api/og/voices/${encodeURIComponent(story.slug)}?format=square`;
  const titleLine = [story.role, story.venue].filter(Boolean).join(' · ');

  const shareText = `🌟 *${story.name}*${titleLine ? ` (${titleLine})` : ''}
"${story.quote}"

📖 Read the full story on Horeca1 Voices:
${articleUrl}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      toast.success('Story link & quote copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleWhatsAppShare = () => {
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    toast.success('Opening WhatsApp...');
  };

  const handleDownloadImage = async () => {
    setDownloading(true);
    try {
      const res = await fetch(ogImageUrl);
      if (!res.ok) throw new Error('Could not fetch card image');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `horeca1-voices-${story.slug}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Card image downloaded!');
    } catch (err) {
      toast.error('Download failed');
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator === 'undefined' || !navigator.share) {
      void handleCopy();
      return;
    }
    try {
      await navigator.share({
        title: `${story.name} | Horeca1 Voices`,
        text: shareText,
        url: articleUrl,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      void handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-divider overflow-hidden z-10 flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-divider flex items-center justify-between bg-cream/30">
          <div>
            <h3 className="text-[16px] font-bold text-text leading-tight">Share Story</h3>
            <p className="text-[12px] text-text-secondary mt-0.5">Share with peers on WhatsApp or copy link</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-full hover:bg-black/5 text-text-secondary flex items-center justify-center transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: WhatsApp Link Unfurl Preview */}
        <div className="p-5 space-y-4">
          <div className="bg-[#EFEAE2] p-3 rounded-2xl border border-divider/60 space-y-2">
            <div className="bg-white rounded-xl overflow-hidden shadow-xs">
              <div className="aspect-[16/10] bg-ivory relative overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ogImageUrl}
                  alt={story.name}
                  className="size-full object-cover"
                />
              </div>
              <div className="p-3">
                <p className="text-[13px] font-bold text-text leading-tight">{story.name}</p>
                {titleLine && <p className="text-[11px] text-text-secondary mt-0.5">{titleLine}</p>}
                <p className="text-[12px] text-text-secondary line-clamp-2 mt-1.5 italic">&ldquo;{story.quote}&rdquo;</p>
                <p className="text-[10px] text-text-muted mt-1.5 font-mono truncate">horeca1.com/voices/{story.slug}</p>
              </div>
            </div>
            <p className="text-[11px] text-text-muted text-center">
              Recipients will see this rich preview when shared on WhatsApp
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-1">
            {/* WhatsApp Share Button */}
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-[14px] shadow-sm transition-transform active:scale-[0.98]"
            >
              <MessageCircle size={18} className="fill-white" />
              Share to WhatsApp
            </button>

            {/* Copy Link & Quote */}
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-divider hover:border-primary/40 text-text font-semibold text-[13px] shadow-2xs transition-colors"
            >
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              {copied ? 'Link Copied!' : 'Copy Link & Quote'}
            </button>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={downloading}
                onClick={() => void handleDownloadImage()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-ivory hover:bg-cream border border-divider text-text-secondary text-[12px] font-semibold transition-colors disabled:opacity-60"
              >
                <Download size={14} />
                {downloading ? 'Downloading...' : 'Save Card Image'}
              </button>

              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-ivory hover:bg-cream border border-divider text-text-secondary text-[12px] font-semibold transition-colors"
              >
                <Share2 size={14} />
                More Options
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Keep InshortsShareModal as an alias so no existing imports break
export const InshortsShareModal = VoiceShareModal;
