'use client';

import React from 'react';

interface AdminRegistryPageHeaderProps {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export function AdminRegistryPageHeader({ title, subtitle, actions }: AdminRegistryPageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[#EEEEEE] pb-5">
      <div>
        <h1 className="text-[30px] font-extrabold text-[#111827] tracking-tight mb-1">{title}</h1>
        <p className="text-[#6B7280] text-[14px] font-medium">{subtitle}</p>
      </div>
      {actions && (
        <div className="flex items-center gap-3 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
