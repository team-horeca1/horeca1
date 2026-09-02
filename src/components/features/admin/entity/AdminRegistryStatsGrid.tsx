'use client';

import React from 'react';

type IconComponent = React.ComponentType<{ size?: number; className?: string }>;

export interface AdminRegistryStat {
  label: string;
  value: string | number;
  icon: IconComponent;
  iconBg: string;
  iconColor: string;
}

interface AdminRegistryStatsGridProps {
  stats: AdminRegistryStat[];
}

export function AdminRegistryStatsGrid({ stats }: AdminRegistryStatsGridProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="bg-white rounded-[16px] border border-divider p-3 lg:p-5 shadow-sm flex items-center gap-3 lg:gap-4"
          >
            <div className={`size-10 lg:size-12 rounded-[12px] ${stat.iconBg} flex items-center justify-center ${stat.iconColor} shrink-0`}>
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] lg:text-[12px] font-semibold text-[#6B7280] uppercase block truncate">{stat.label}</span>
              <span className="text-[18px] lg:text-[22px] font-bold text-[#111827] leading-none mt-1 inline-block tabular-nums">{stat.value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
