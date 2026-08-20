'use client';

/**
 * OutletCompletionBanner
 *
 * Warm orange banner nudging logged-in customers whose active outlet still
 * has `requiresAddressUpdate: true` to add a delivery address. Without a
 * proper outlet address, vendor serviceability and checkout can't work.
 *
 * Renders nothing when:
 *   - the user is not authenticated
 *   - there is no active outlet
 *   - the active outlet already has a real address (requiresAddressUpdate === false)
 *
 * Mounted in `src/app/layout.tsx` between <Navbar /> and the main content,
 * above <VendorApplicationBanner />.
 */

import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { usePathname } from 'next/navigation';

export function OutletCompletionBanner() {
  const { data: session, status } = useSession();
  const { currentOutlet, activeBusinessAccountId } = useBusinessAccountSwitcher();
  // B-2: hooks must run unconditionally on every render — call usePathname()
  // before any early return, not after.
  const pathname = usePathname();

  if (status !== 'authenticated') return null;
  // Admin staff are intentionally outside the customer BusinessAccount system
  // (see multi-account-rbac-implementation-plan.md §2). Their account is an
  // auto-provisioned artifact whose primary outlet has no real address, which
  // would otherwise show this "add a delivery address" nag on every storefront
  // page. Operators don't need it — they add addresses via the location picker.
  if ((session?.user as { role?: string } | undefined)?.role === 'admin') return null;
  if (!currentOutlet) return null;
  if (!currentOutlet.requiresAddressUpdate) return null;
  if (
    pathname?.startsWith('/account') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/vendor') ||
    pathname?.startsWith('/brand/portal') ||
    pathname?.startsWith('/d/') ||
    pathname?.startsWith('/r/') ||
    pathname?.startsWith('/payout/')
  ) {
    return null;
  }

  const editHref = activeBusinessAccountId
    ? '/profile?open=outlets'
    : '/profile';

  return (
    <div className="w-full bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 text-white relative z-40">
      <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] flex items-center justify-between gap-3 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
            <AlertCircle size={14} className="text-white" />
          </div>
          <p className="text-[clamp(12px,2vw,14px)] font-medium truncate">
            <span className="font-bold">{currentOutlet.name}</span>
            <span className="hidden sm:inline"> — Add a delivery address to start ordering.</span>
            <span className="sm:hidden"> — Add a delivery address</span>
          </p>
        </div>

        <Link
          href={editHref}
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold bg-white text-orange-700 hover:bg-orange-50 transition-colors"
        >
          Add Address
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
