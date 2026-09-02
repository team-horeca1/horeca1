'use client';

import React from 'react';

interface AdminRegistryTableShellProps {
  children: React.ReactNode;
  minWidth?: string;
}

export function AdminRegistryTableShell({ children, minWidth = '1000px' }: AdminRegistryTableShellProps) {
  return (
    <div className="w-full max-w-full overflow-x-auto rounded-[16px] border border-divider bg-white shadow-sm">
      <table className="w-full border-collapse text-left text-[13px]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function AdminRegistryTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="bg-ivory border-b border-divider text-[11px] font-semibold text-[#667085] uppercase">
        {children}
      </tr>
    </thead>
  );
}

export function AdminRegistryTableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-[#D1D5DB]">{children}</tbody>;
}
