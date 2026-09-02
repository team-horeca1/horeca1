'use client';

import React from 'react';

export interface AdminEntityStat {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
}

interface AdminEntityStatsRowProps {
  stats: AdminEntityStat[];
}

export function AdminEntityStatsRow({ stats }: AdminEntityStatsRowProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <div
            key={idx}
            className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm overflow-hidden hover:shadow-md transition-all group flex flex-col justify-between"
          >
            <div className="p-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                  {stat.label}
                </p>
                <p className="text-[20px] lg:text-[22px] font-bold text-[#111827] mt-1 leading-none tabular-nums">
                  {stat.value}
                </p>
              </div>
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: `${stat.color}18`, color: stat.color }}
              >
                <Icon size={18} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
