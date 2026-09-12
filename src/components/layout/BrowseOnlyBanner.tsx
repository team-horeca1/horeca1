'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { describePurchaseAccess } from '@/lib/businessCapability';

export function BrowseOnlyBanner() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  if (status !== 'authenticated') return null;

  const role = session?.user?.role;
  const active = session?.user?.activeBusinessAccountType;
  const accounts = session?.user?.availableAccounts;
  const access = describePurchaseAccess({
    isLoggedIn: true,
    role,
    active,
    accounts: accounts?.map((a) => ({
      isCustomer: a.isCustomer ?? (a.isVendor !== true && a.isBrand !== true),
      isVendor: a.isVendor,
      isBrand: a.isBrand,
    })),
  });
  if (access.allowed) return null;

  const onBusinesses = pathname === '/businesses' || pathname.startsWith('/businesses/');
  const href = onBusinesses ? '#buyer-businesses' : access.href;

  return (
    <div className="border-b border-primary/12 bg-primary-light">
      <div className="fluid-container py-3 lg:py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="size-10 rounded-[10px] bg-white border border-primary/15 flex items-center justify-center shrink-0">
              <ShoppingBag size={18} className="text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] sm:text-[14px] font-semibold text-text text-pretty leading-snug">
                {onBusinesses
                  ? 'You are browsing as a supplier or brand. Open a restaurant or retail business below to place orders.'
                  : access.message}
              </p>
              <p className="text-[12px] text-text-secondary mt-0.5 hidden sm:block text-pretty">
                Catalogue stays open. Buying is only available on a restaurant or retail account.
              </p>
            </div>
          </div>
          <Link
            href={href}
            className="shrink-0 inline-flex items-center justify-center min-h-12 px-5 rounded-[12px] bg-primary hover:bg-primary-dark active:bg-primary-pressed text-white text-[13px] font-bold w-full sm:w-auto active:scale-[0.97] transition-transform"
          >
            {access.ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
