'use client';

import React from 'react';
import Link from 'next/link';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminRegistryRowActionsProps {
  detailsHref: string;
  onDetailsClick?: (e: React.MouseEvent) => void;
  impersonateButton?: React.ReactNode;
  extraActions?: React.ReactNode;
  menuOpen?: boolean;
  onMenuToggle?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  showMenu?: boolean;
}

export function AdminRegistryRowActions({
  detailsHref,
  onDetailsClick,
  impersonateButton,
  extraActions,
  menuOpen,
  onMenuToggle,
  showMenu = true,
}: AdminRegistryRowActionsProps) {
  return (
    <div className="flex items-center justify-start gap-2">
      {impersonateButton}
      <Link
        href={detailsHref}
        onClick={onDetailsClick}
        className="h-[34px] px-3 bg-white border border-[#E5E7EB] text-[#374151] rounded-[8px] text-[12px] font-bold hover:bg-[#F9FAFB] transition-all flex items-center justify-center whitespace-nowrap"
      >
        Details
      </Link>
      {extraActions}
      {showMenu && onMenuToggle && (
        <button
          type="button"
          onClick={onMenuToggle}
          className={cn(
            'w-[34px] h-[34px] flex items-center justify-center rounded-[10px] transition-all shadow-sm',
            menuOpen
              ? 'bg-gray-100 text-gray-900 border border-gray-200'
              : 'bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:bg-gray-50',
          )}
        >
          <MoreVertical size={16} />
        </button>
      )}
    </div>
  );
}
