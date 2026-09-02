'use client';

import React from 'react';
import { Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminRegistryFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  leftSlot?: React.ReactNode;
  trailingSlot?: React.ReactNode;
  searching?: boolean;
}

/** Shared pill classes for status / filter chips in the left slot. */
export function registryFilterPillClass(active: boolean): string {
  return cn(
    'min-h-12 lg:min-h-[34px] lg:h-[34px] px-3.5 rounded-[12px] lg:rounded-[8px] text-[13px] lg:text-[12px] font-semibold transition-all whitespace-nowrap border',
    active ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20' : 'bg-[#F9FAFB] text-[#6B7280] border-[#D1D5DB] hover:text-[#111827] hover:bg-[#F3F4F6]',
  );
}

export function AdminRegistryFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  leftSlot,
  trailingSlot,
  searching,
}: AdminRegistryFilterBarProps) {
  return (
    <div className="bg-white p-3 lg:p-4 rounded-[16px] border border-divider shadow-sm flex flex-col lg:flex-row lg:items-center gap-3">
      {/* Left: filters / pills — always present as flex spacer so search stays right-aligned */}
      <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0 w-full lg:w-auto">
        {leftSlot}
      </div>

      {/* Right: search + trailing tools */}
      <div className="flex items-center gap-3 w-full lg:w-auto shrink-0">
        <div className="relative group flex-1 sm:flex-none sm:w-[320px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={16} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-12 lg:h-[42px] w-full bg-ivory border border-divider rounded-[12px] pl-10 pr-10 text-[13px] outline-none placeholder:text-[#9CA3AF] font-medium focus:border-primary focus:bg-white"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary" size={16} />
          )}
        </div>
        {trailingSlot}
      </div>
    </div>
  );
}
