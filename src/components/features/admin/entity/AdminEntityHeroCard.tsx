'use client';

import React from 'react';

interface AdminEntityHeroCardProps {
  avatar: React.ReactNode;
  avatarFooter?: React.ReactNode;
  title: React.ReactNode;
  badges?: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  contact?: React.ReactNode;
  sidebar?: React.ReactNode;
  sidebarTitle?: string;
}

export function AdminEntityHeroCard({
  avatar,
  avatarFooter,
  title,
  badges,
  subtitle,
  meta,
  contact,
  sidebar,
  sidebarTitle,
}: AdminEntityHeroCardProps) {
  return (
    <div className="bg-white rounded-[16px] lg:rounded-[20px] border border-divider shadow-sm overflow-hidden p-4 md:p-8 flex flex-col lg:flex-row items-center lg:items-stretch gap-4 md:gap-8">
      <div className="flex flex-col items-center justify-center shrink-0 w-[180px]">
        {avatar}
        {avatarFooter && <div className="mt-3.5">{avatarFooter}</div>}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between text-center lg:text-left py-1">
        <div>
          <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 justify-center lg:justify-start">
            {typeof title === 'string' ? (
              <h2 className="text-[24px] font-black text-[#181725] tracking-tight leading-tight">{title}</h2>
            ) : (
              title
            )}
            {badges}
          </div>
          {subtitle}
          {meta}
        </div>
        {contact}
      </div>

      {sidebar && (
        <div className="w-full lg:w-[280px] border-t lg:border-t-0 lg:border-l border-[#D1D5DB] pt-6 lg:pt-0 lg:pl-6 flex flex-col justify-center gap-4">
          {sidebarTitle && (
            <span className="text-[11px] font-bold text-[#9CA3AF] uppercase text-center lg:text-left">{sidebarTitle}</span>
          )}
          {sidebar}
        </div>
      )}
    </div>
  );
}
