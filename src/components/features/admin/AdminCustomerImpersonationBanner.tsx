'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAdminImpersonate } from '@/hooks/useAdminImpersonate';

function readCustomerImpersonationName(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)admin_impersonate_customer_name=([^;]+)/);
  if (!match?.[1]) return null;
  // Tolerate legacy double-encoded cookies (Mandar%2520Shetty → Mandar Shetty).
  let value = match[1];
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch {
      break;
    }
  }
  return value;
}

export function AdminCustomerImpersonationBanner() {
  const { exit } = useAdminImpersonate('customer');
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    setName(readCustomerImpersonationName());
  }, []);

  if (!name) return null;

  return (
    <div className="mb-4 rounded-[12px] border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
      <p className="text-[13px] font-bold text-amber-900">
        Admin View — viewing as <span className="text-amber-950">{name}</span>
      </p>
      <button
        type="button"
        onClick={() => void exit('/admin/customers')}
        className="h-[34px] px-4 rounded-[8px] bg-amber-600 text-white text-[12px] font-bold hover:bg-amber-700 transition-colors flex items-center justify-center gap-1.5 shrink-0"
      >
        <X size={14} />
        Exit Admin View
      </button>
    </div>
  );
}
