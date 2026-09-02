'use client';

import React from 'react';

type IconComponent = React.ComponentType<{ size?: number; className?: string }>;

export interface AdminEntityContactItem {
  icon: IconComponent;
  label: string;
  value: React.ReactNode;
}

interface AdminEntityContactGridProps {
  items: AdminEntityContactItem[];
  accent?: string;
  accentBg?: string;
  className?: string;
}

export function AdminEntityContactGrid({
  items,
  accent = '#6B1D2E',
  accentBg = '#F8E8EC',
  className,
}: AdminEntityContactGridProps) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 border-t border-[#F3F4F6] pt-4 text-left ${className ?? ''}`}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="flex items-center gap-2.5">
            <div
              className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shrink-0"
              style={{ backgroundColor: accentBg, color: accent }}
            >
              <Icon size={13} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-[#9CA3AF] uppercase block leading-none font-bold">{item.label}</span>
              <span className="text-[12px] font-bold text-[#374151] truncate block">{item.value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
