'use client';

import React from 'react';

interface AdminRegistryTableShellProps {
  children: React.ReactNode;
  minWidth?: string;
}

export function AdminRegistryTableShell({ children, minWidth = '1000px' }: AdminRegistryTableShellProps) {
  return (
    <div className="w-full overflow-x-auto rounded-[16px] border border-[#D1D5DB] bg-white shadow-sm">
      <table className="w-full border-collapse text-left text-[13px]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function AdminRegistryTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="bg-[#F9FAFB] border-b border-[#D1D5DB] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
        {children}
      </tr>
    </thead>
  );
}

export function AdminRegistryTableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-[#D1D5DB]">{children}</tbody>;
}
