'use client';

import React from 'react';

type IconComponent = React.ComponentType<{ size?: number; className?: string }>;

interface AdminRegistryEmptyStateProps {
  icon: IconComponent;
  title: string;
  subtitle: string;
}

export function AdminRegistryEmptyState({ icon: Icon, title, subtitle }: AdminRegistryEmptyStateProps) {
  return (
    <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-24 text-center text-[#6B7280] font-medium shadow-sm">
      <Icon className="mx-auto text-[#D1D5DB] mb-3" size={40} />
      <h4 className="text-[15px] font-bold text-[#374151]">{title}</h4>
      <p className="text-[13px] text-[#9CA3AF] mt-1">{subtitle}</p>
    </div>
  );
}
