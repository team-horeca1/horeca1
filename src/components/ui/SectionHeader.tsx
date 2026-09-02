import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  actionHref,
  onActionClick,
  className,
  size = 'section',
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionHref?: string;
  onActionClick?: () => void;
  className?: string;
  size?: 'hero' | 'section' | 'subsection';
}) {
  const titleClass = cn(
    'text-primary font-bold text-balance m-0',
    size === 'hero' && 'text-[clamp(1.25rem,4vw,1.5rem)] leading-tight',
    size === 'section' && 'text-[clamp(1.125rem,3vw,1.25rem)] leading-snug',
    size === 'subsection' && 'text-base leading-snug font-semibold',
  );

  const actionEl = actionLabel ? (
    actionHref ? (
      <Link
        href={actionHref}
        className="text-[13px] font-semibold text-primary shrink-0 hover:underline"
      >
        {actionLabel}
      </Link>
    ) : (
      <button
        type="button"
        onClick={onActionClick}
        className="text-[13px] font-semibold text-primary shrink-0 hover:underline bg-transparent border-0 p-0"
      >
        {actionLabel}
      </button>
    )
  ) : null;

  return (
    <div className={cn('flex items-end justify-between gap-3 mb-3', className)}>
      <div className="min-w-0">
        <h2 className={titleClass}>{title}</h2>
        {subtitle && (
          <p className="text-[13px] text-text-secondary mt-0.5 text-pretty">{subtitle}</p>
        )}
      </div>
      {actionEl}
    </div>
  );
}
