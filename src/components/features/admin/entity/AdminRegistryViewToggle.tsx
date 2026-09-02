'use client';

import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminRegistryViewToggleProps {
  viewMode: 'grid' | 'table';
  onChange: (mode: 'grid' | 'table') => void;
}

/** Desktop-only cards/table switcher. Mobile always uses cards. */
export function AdminRegistryViewToggle({ viewMode, onChange }: AdminRegistryViewToggleProps) {
  return (
    <div className="hidden lg:flex items-center gap-2 self-auto justify-end">
      <span className="text-[12px] font-semibold text-[#9CA3AF] uppercase mr-1">View</span>
      <div className="flex items-center bg-[#F3F4F6] border border-[#D1D5DB] rounded-[12px] p-1">
        <button
          type="button"
          onClick={() => onChange('grid')}
          aria-pressed={viewMode === 'grid'}
          className={cn(
            'min-h-10 min-w-10 px-3 rounded-[8px] transition-all flex items-center gap-1.5 text-[12px] font-semibold',
            viewMode === 'grid' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#111827]',
          )}
        >
          <LayoutGrid size={15} />
          Cards
        </button>
        <button
          type="button"
          onClick={() => onChange('table')}
          aria-pressed={viewMode === 'table'}
          className={cn(
            'min-h-10 min-w-10 px-3 rounded-[8px] transition-all flex items-center gap-1.5 text-[12px] font-semibold',
            viewMode === 'table' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#111827]',
          )}
        >
          <List size={15} />
          Table
        </button>
      </div>
    </div>
  );
}
