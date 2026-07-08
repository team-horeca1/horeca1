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
  sidebar: React.ReactNode;
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
    <div className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm overflow-hidden p-6 md:p-8 flex flex-col lg:flex-row items-center lg:items-stretch gap-6 md:gap-8">
      <div className="flex flex-col items-center justify-center shrink-0 w-[180px]">
        {avatar}
        {avatarFooter && <div className="mt-3">{avatarFooter}</div>}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between text-center lg:text-left">
        <div>
          <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 justify-center lg:justify-start">
            {typeof title === 'string' ? (
              <h2 className="text-[24px] font-black text-[#111827] leading-tight">{title}</h2>
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

      <div className="w-full lg:w-[260px] border-t lg:border-t-0 lg:border-l border-[#F3F4F6] pt-6 lg:pt-0 lg:pl-6 flex flex-col justify-center gap-4">
        {sidebarTitle && (
          <span className="text-[11px] font-bold text-[#9CA3AF] uppercase text-center lg:text-left">{sidebarTitle}</span>
        )}
        {sidebar}
      </div>
    </div>
  );
}
