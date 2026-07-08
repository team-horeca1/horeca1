'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface AdminRegistryOverflowMenuProps {
  active: { top: number; right: number } | null;
  children: React.ReactNode;
}

export function AdminRegistryOverflowMenu({ active, children }: AdminRegistryOverflowMenuProps) {
  if (!active || typeof window === 'undefined') return null;

  return createPortal(
    <div
      style={{ position: 'fixed', top: active.top, right: active.right, zIndex: 12000 }}
      className="w-44 bg-white rounded-[8px] shadow-xl border border-gray-100 py-1 overflow-hidden animate-in fade-in zoom-in duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function AdminRegistryOverflowMenuItem({
  onClick,
  icon,
  label,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2 text-[13px] font-semibold transition-colors text-left',
        danger ? 'text-red-500 hover:bg-red-50' : 'text-[#4B4B4B] hover:bg-gray-50',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
