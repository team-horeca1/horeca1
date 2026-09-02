'use client';

import React from 'react';
import { cn } from '@/lib/utils';

type IconComponent = React.ComponentType<{ size?: number; className?: string }>;

export interface AdminEntityTab {
  id: string;
  label: string;
  icon?: IconComponent;
  badge?: React.ReactNode;
}

interface AdminEntityTabBarProps {
  tabs: AdminEntityTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function AdminEntityTabBar({ tabs, activeTab, onTabChange }: AdminEntityTabBarProps) {
  return (
    <div className="flex border-b border-divider overflow-x-auto bg-ivory">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-2 min-h-12 px-4 lg:px-6 border-b-2 font-semibold text-[12px] whitespace-nowrap outline-none',
              activeTab === tab.id
                ? 'border-primary text-primary bg-white shadow-sm'
                : 'border-transparent text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6]/50',
            )}
          >
            {Icon && <Icon size={14} />}
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

interface AdminEntityTabPanelProps {
  children: React.ReactNode;
}

export function AdminEntityTabPanel({ children }: AdminEntityTabPanelProps) {
  return (
    <div className="bg-white rounded-[16px] border border-divider shadow-sm overflow-hidden">
      {children}
    </div>
  );
}

export function AdminEntityTabContent({ children }: { children: React.ReactNode }) {
  return <div className="p-4 md:p-8">{children}</div>;
}
