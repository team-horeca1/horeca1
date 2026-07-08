'use client';

import React from 'react';
import { Search, Loader2 } from 'lucide-react';

interface AdminRegistryFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  leftSlot?: React.ReactNode;
  trailingSlot?: React.ReactNode;
  searching?: boolean;
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
    <div className="bg-white p-4 rounded-[16px] border border-[#EEEEEE] shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
      {leftSlot && (
        <div className="flex items-center gap-1 flex-wrap w-full lg:w-auto">{leftSlot}</div>
      )}
      <div className="flex items-center gap-3 w-full lg:w-auto lg:ml-auto">
        <div className="relative group flex-1 sm:flex-none sm:w-[320px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={16} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-[42px] w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] pl-10 pr-10 text-[13px] outline-none transition-all placeholder:text-[#9CA3AF] font-medium focus:border-[#299E60]/50 focus:bg-white focus:shadow-sm"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#299E60]" size={16} />
          )}
        </div>
        {trailingSlot}
      </div>
    </div>
  );
}
