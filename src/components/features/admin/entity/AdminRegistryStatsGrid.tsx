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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
          >
            <div className={`w-12 h-12 rounded-[12px] ${stat.iconBg} flex items-center justify-center ${stat.iconColor}`}>
              <Icon size={22} />
            </div>
            <div>
              <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">{stat.label}</span>
              <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{stat.value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
