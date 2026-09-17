'use client';

import React from 'react';
import { Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useShare } from '@/components/features/share/ShareProvider';
import type { ShareableContent } from '@/lib/share-cards/types';

type ShareButtonVariant = 'overlay' | 'icon' | 'labeled' | 'outline' | 'chip';

const VARIANT_CLASS: Record<ShareButtonVariant, string> = {
  overlay:
    'size-9 sm:size-8 rounded-full backdrop-blur-md bg-white/90 border border-white/60 shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:bg-primary/10 hover:text-primary text-text-muted',
  icon:
    'size-10 rounded-full border border-divider/80 bg-white hover:bg-ivory hover:border-primary/40 text-primary shadow-xs',
  labeled:
    'inline-flex items-center gap-2 text-[13px] font-bold text-white bg-primary hover:bg-primary-dark px-4 py-2.5 rounded-xl shadow-xs active:scale-95',
  outline:
    'inline-flex items-center gap-2 text-[13px] font-semibold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/40 px-3.5 py-2 rounded-xl',
  chip:
    'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-ivory border border-divider text-xs font-semibold text-text hover:bg-primary-light hover:border-primary/40 hover:text-primary',
};

export function ShareButton({
  content,
  variant = 'overlay',
  className,
  label,
  stopPropagation = true,
  showLabel,
}: {
  content: ShareableContent;
  variant?: ShareButtonVariant;
  className?: string;
  label?: string;
  stopPropagation?: boolean;
  /** Force showing text label (defaults true for labeled/outline/chip). */
  showLabel?: boolean;
}) {
  const { openShare, prefetch } = useShare();
  const aria = `Share ${content.title}`;
  const withLabel =
    showLabel ?? (variant === 'labeled' || variant === 'outline' || variant === 'chip');
  const text = label ?? (variant === 'labeled' ? 'Share' : 'Share');

  return (
    <button
      type="button"
      aria-label={aria}
      title={aria}
      className={cn(
        'flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 min-h-9 min-w-9',
        VARIANT_CLASS[variant],
        className,
      )}
      onPointerDown={() => prefetch(content)}
      onTouchStart={() => prefetch(content)}
      onClick={(e) => {
        if (stopPropagation) {
          e.preventDefault();
          e.stopPropagation();
        }
        openShare(content);
      }}
      onMouseEnter={() => prefetch(content)}
      onFocus={() => prefetch(content)}
    >
      <Share2
        size={variant === 'labeled' || variant === 'outline' ? 15 : 14}
        strokeWidth={2}
        className={cn(withLabel ? '' : 'shrink-0')}
      />
      {withLabel ? <span>{text}</span> : null}
    </button>
  );
}
