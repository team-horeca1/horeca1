'use client';

import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormErrorBannerProps {
  message?: string | null;
  className?: string;
  /** Pin banner while scrolling long forms/pages. */
  sticky?: boolean;
}

/**
 * Sticky form-level error — place OUTSIDE scrollable modal body (between tabs and content).
 */
export function FormErrorBanner({ message, className, sticky }: FormErrorBannerProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={cn(
        'shrink-0 flex items-start gap-2 text-[13px] text-red-600 font-medium',
        'bg-red-50 border border-red-200 rounded-[10px] px-4 py-2.5',
        sticky && 'sticky top-0 z-20',
        className,
      )}
    >
      <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
