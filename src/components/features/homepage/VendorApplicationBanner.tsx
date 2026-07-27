'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { isVendorPortalPath } from '@/lib/vendorPortalPaths';
import { Clock, X, PartyPopper, ArrowRight } from 'lucide-react';

interface ApplicationStatus {
  hasApplication: boolean;
  status?: 'pending' | 'approved';
  businessName?: string;
}

export function VendorApplicationBanner() {
  const { data: session, status: authStatus, update: updateSession } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const userRole = (session?.user as { role?: string })?.role;
  const [appStatus, setAppStatus] = useState<ApplicationStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    fetch('/api/v1/vendor/application-status')
      .then(res => res.json())
      .then(json => {
        if (json.success) setAppStatus(json.data);
      })
      .catch(() => {});
  }, [authStatus]);

  // Check stored dismissal state
  useEffect(() => {
    if (!appStatus?.hasApplication) return;

    if (appStatus.status === 'pending') {
      // Reset approved-seen flag when back to pending (revoked then re-approved case)
      localStorage.removeItem('vendor_approved_seen');
      if (sessionStorage.getItem('vendor_banner_pending_dismissed')) queueMicrotask(() => setDismissed(true));
    } else if (appStatus.status === 'approved') {
      if (localStorage.getItem('vendor_approved_seen')) queueMicrotask(() => setDismissed(true));
    }
  }, [appStatus]);

  // Auto-refresh session when vendor is approved but session role is still 'customer'.
  // updateSession from useSession() is recreated on every render, so we keep it in a ref
  // (rather than the dep array) — otherwise the effect re-registers every render and
  // hammers /api/auth/session, which in turn cascades into refetches of cart/etc.
  // and eventually surfaces as a ClientFetchError.
  const updateSessionRef = useRef(updateSession);
  useEffect(() => { updateSessionRef.current = updateSession; }, [updateSession]);
  const refreshedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (appStatus?.status !== 'approved') return;
    if (userRole !== 'customer') return;
    // Only refresh ONCE per unique (status, role) tuple — even if the dep object
    // identity changes, we won't call updateSession again until something flips.
    const key = `${appStatus.status}:${userRole}`;
    if (refreshedForRef.current === key) return;
    refreshedForRef.current = key;
    updateSessionRef.current();
  }, [appStatus, userRole]);

  // Auto-dismiss approved banner when they visit the vendor dashboard
  useEffect(() => {
    if (appStatus?.status === 'approved' && pathname?.startsWith('/vendor/dashboard')) {
      localStorage.setItem('vendor_approved_seen', '1');
      queueMicrotask(() => setDismissed(true));
    }
  }, [pathname, appStatus]);

  const handleDismiss = () => {
    setDismissed(true);
    if (appStatus?.status === 'pending') {
      sessionStorage.setItem('vendor_banner_pending_dismissed', '1');
    } else if (appStatus?.status === 'approved') {
      localStorage.setItem('vendor_approved_seen', '1');
    }
  };

  if (dismissed || !appStatus?.hasApplication) return null;

  // Don't show on vendor portal or admin/account pages
  if (
    isVendorPortalPath(pathname) ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/account')
  ) {
    return null;
  }

  // === APPROVED BANNER ===
  if (appStatus.status === 'approved') {
    return (
      <div className="w-full bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-500 text-white relative z-40">
        <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
              <PartyPopper size={16} className="text-white" />
            </div>
            <p className="text-[clamp(12px,2vw,14px)] font-medium">
              <span className="font-bold">Congratulations!</span>
              <span className="hidden sm:inline"> Your supplier profile <span className="font-bold">{appStatus.businessName}</span> has been approved. You now have full access to the supplier dashboard.</span>
              <span className="sm:hidden"> <span className="font-bold">{appStatus.businessName}</span> is approved!</span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={async () => {
                localStorage.setItem('vendor_approved_seen', '1');
                const newSession = await updateSession();
                const activeAccountId = (newSession?.user as { activeBusinessAccountId?: string } | undefined)?.activeBusinessAccountId || (session?.user as { activeBusinessAccountId?: string } | undefined)?.activeBusinessAccountId;
                const setupKey = activeAccountId ? `vendor_setup_completed_${activeAccountId}` : 'vendor_setup_completed';
                const setupCompleted = localStorage.getItem(setupKey) || localStorage.getItem('vendor_setup_completed');
                router.push(setupCompleted ? '/vendor/dashboard' : '/vendor/setup');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold bg-white text-green-700 hover:bg-green-50 transition-colors"
            >
              Go to Dashboard
              <ArrowRight size={14} />
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === PENDING BANNER ===
  return (
    <div className="w-full bg-gradient-to-r from-amber-500 via-amber-500 to-orange-500 text-white relative z-40">
      <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] flex items-center justify-between gap-3 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
            <Clock size={14} className="text-white" />
          </div>
          <p className="text-[clamp(12px,2vw,14px)] font-medium truncate">
            <span className="font-bold">{appStatus.businessName}</span>
            <span className="hidden sm:inline"> — Your supplier application is under review. You&apos;ll get dashboard access once approved.</span>
            <span className="sm:hidden"> — Application under review</span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-white/20">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Pending
          </span>
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-white/20 rounded-full transition-colors"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
