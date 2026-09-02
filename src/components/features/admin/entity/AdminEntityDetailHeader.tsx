'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AdminEntityDetailHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  onBack?: () => void;
  actions?: React.ReactNode;
}

export function AdminEntityDetailHeader({
  breadcrumbs,
  onBack,
  actions,
}: AdminEntityDetailHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EEEEEE] pb-4">
      <div className="flex items-center gap-2 text-[13px] text-[#6B7280] flex-wrap min-w-0">
        {onBack && (
          <>
            <button
              type="button"
              onClick={onBack}
              className="hover:text-primary flex items-center gap-1 font-semibold text-[12px] uppercase shrink-0 min-h-12 px-1"
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <span className="text-gray-300">|</span>
          </>
        )}
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && <span className="text-gray-300">{'>'}</span>}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="hover:text-primary transition-colors font-semibold truncate"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="font-extrabold text-[#111827] truncate">{crumb.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>
      {actions && (
        <div className="flex items-center gap-3 shrink-0 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
