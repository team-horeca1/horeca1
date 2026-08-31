'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useAdminImpersonate } from '@/hooks/useAdminImpersonate';
import {
  isAdminVendorImpersonationActive,
  readImpersonationBuyerName,
  readImpersonationMode,
  type ImpersonationMode,
} from '@/lib/clearImpersonation';

function exitHref(mode: ImpersonationMode | null): string {
  if (mode === 'brand') return '/admin/brands';
  if (mode === 'vendor') return '/admin/vendors';
  return '/admin/customers';
}

export function AdminImpersonationBanner() {
  const { exit } = useAdminImpersonate('customer');
  const [name, setName] = useState<string | null>(null);
  const [mode, setMode] = useState<ImpersonationMode | null>(null);
  const [vendorPortalOnly, setVendorPortalOnly] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      const buyerName = readImpersonationBuyerName();
      const nextMode = readImpersonationMode();
      setName(buyerName);
      setMode(nextMode);
      setVendorPortalOnly(!buyerName && isAdminVendorImpersonationActive());
    });
  }, []);

  if (!name && !vendorPortalOnly) return null;

  return (
    <div className="mb-4 rounded-[12px] border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
      <p className="text-[13px] font-bold text-amber-900">
        {name ? (
          <>
            Admin View — shopping as <span className="text-amber-950">{name}</span>
          </>
        ) : (
          <>Admin View — this supplier has no customer account; storefront is your own admin session</>
        )}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        {mode === 'vendor' && (
          <Link
            href="/vendor/overview"
            className="h-[34px] px-4 rounded-[8px] border border-amber-400 bg-white text-amber-900 text-[12px] font-bold hover:bg-amber-100 transition-colors flex items-center justify-center"
          >
            Back to supplier portal
          </Link>
        )}
        {mode === 'brand' && (
          <Link
            href="/brand/portal"
            className="h-[34px] px-4 rounded-[8px] border border-amber-400 bg-white text-amber-900 text-[12px] font-bold hover:bg-amber-100 transition-colors flex items-center justify-center"
          >
            Back to brand portal
          </Link>
        )}
        <button
          type="button"
          onClick={() => void exit(exitHref(mode))}
          className="h-[34px] px-4 rounded-[8px] bg-amber-600 text-white text-[12px] font-bold hover:bg-amber-700 transition-colors flex items-center justify-center gap-1.5"
        >
          <X size={14} />
          Exit Admin View
        </button>
      </div>
    </div>
  );
}

/** @deprecated Use AdminImpersonationBanner. */
export const AdminCustomerImpersonationBanner = AdminImpersonationBanner;
