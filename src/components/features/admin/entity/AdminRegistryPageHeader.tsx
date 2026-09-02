'use client';

import React from 'react';

interface AdminRegistryPageHeaderProps {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export function AdminRegistryPageHeader({ title, subtitle, actions }: AdminRegistryPageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-divider pb-4 lg:pb-5">
      <div className="min-w-0">
        <h1 className="text-[clamp(1.25rem,4vw,1.875rem)] font-semibold text-[#111827] text-balance mb-1">{title}</h1>
        <p className="text-[#667085] text-[13px] lg:text-[14px] font-medium text-pretty">{subtitle}</p>
      </div>
      {actions && (
        <div className="flex items-center gap-2 lg:gap-3 flex-wrap [&>a]:min-h-12 [&>button]:min-h-12">{actions}</div>
      )}
    </div>
  );
}
