'use client';

/**
 * Vendor portal layout — Supplier Foundation
 * -----------------------------------------
 * Context bar shows active Business + Online Store from session.
 * Multi-warehouse outlet strip retired — Online Stores replace warehouses.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
    LayoutDashboard,
    ShoppingBag,
    Package,
    Warehouse,
    BarChart3,
    Building2,
    Settings,
    GitMerge,
    Bell,
    ChevronDown,
    Menu,
    X,
    ChevronLeft,
    ChevronRight,
    Loader2,
    ShieldAlert,
    Home,
    Eye,
    LogOut,
    Users,
    UserCircle,
    RotateCcw,
    Wallet,
    BookOpen,
    Tag,
    Gift,
    CreditCard,
    BadgeIndianRupee,
    Clock,
    Container,
    MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { defaultPortalPath } from '@/lib/portalRouting';
import { SUPPLIER_HUB_PATH, supplierDashboardPath } from '@/lib/businessCapability';
import { consumePickedAccount, isPickerInFlight, isPickerPending, peekPickedAccount } from '@/lib/postLoginPicker';
import { clearAllAdminImpersonation } from '@/lib/clearImpersonation';
import { BusinessAccountSwitcherDropdown } from '@/components/account-switcher/BusinessAccountSwitcherDropdown';
import { VendorNotificationBell } from '@/components/features/vendor/VendorNotificationBell';
import { VendorGlobalSearch } from '@/components/vendor/VendorGlobalSearch';
import { usePermissions } from '@/hooks/usePermissions';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { VENDOR_NAV_GROUPS, SUPPLIER_NAV_GROUPS, filterNavLinks, type PortalNavGroup, type PortalNavLink } from '@/lib/permissions/portalNav';
import { getFirstAllowedRoute } from '@/lib/permissions/routePermissions';
import { PortalPageGuard } from '@/components/auth/PortalPageGuard';
import { PortalNoAccess } from '@/components/auth/PortalNoAccess';
import { Suspense } from 'react';
import {
  isStoreOpsPath,
  isSupplierLevelPath,
  readEnteredStore,
  setEnteredStore,
  resolvePortalLevel,
  needsStorePicker,
} from '@/lib/supplierPortalLevel';

function findVendorNavLink(groups: PortalNavGroup[], href: string): PortalNavLink | undefined {
    for (const group of groups) {
        const found = group.links.find((l) => l.href === href);
        if (found) return found;
    }
    return undefined;
}

function VendorNavBody({
    groups,
    pathname,
    isCollapsed,
    adminVendorName,
    onExitAdminView,
    isAdmin,
    onNavigate,
}: {
    groups: PortalNavGroup[];
    pathname: string;
    isCollapsed: boolean;
    adminVendorName: string | null;
    onExitAdminView: () => void;
    isAdmin: boolean;
    onNavigate?: () => void;
}) {
    return (
        <>
            <nav className="flex-1 px-3 lg:px-4 py-5 space-y-2 overflow-y-auto">
                {adminVendorName && (
                    <div className={cn(
                        'mb-3 bg-amber-50 border border-amber-200 rounded-[10px] overflow-hidden',
                        isCollapsed ? 'flex justify-center py-2' : 'p-3',
                    )}>
                        {isCollapsed ? (
                            <Eye size={18} className="text-amber-500" />
                        ) : (
                            <>
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Eye size={13} className="text-amber-500 shrink-0" />
                                    <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wide">Admin View</span>
                                </div>
                                <p className="text-[12px] font-semibold text-amber-800 truncate mb-2">{adminVendorName}</p>
                                <button
                                    type="button"
                                    onClick={onExitAdminView}
                                    className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-1.5 rounded-[6px]"
                                >
                                    <LogOut size={11} />
                                    Exit Admin View
                                </button>
                            </>
                        )}
                    </div>
                )}
                {groups.map((group) => (
                    <div key={group.label} className="mb-4">
                        {!isCollapsed && (
                            <p className="px-3 mb-2 text-[10px] font-bold uppercase text-[#AEAEAE]">{group.label}</p>
                        )}
                        <div className="space-y-1">
                            {group.links.map((link) => {
                                const hrefPath = link.href.split('?')[0];
                                const isActive = pathname === hrefPath
                                  || (hrefPath !== '/vendor' && hrefPath !== '/businesses' && pathname.startsWith(`${hrefPath}/`));
                                return (
                                    <Link
                                        key={link.name}
                                        href={link.href}
                                        title={isCollapsed ? link.name : undefined}
                                        onClick={onNavigate}
                                        className={cn(
                                            'flex items-center rounded-[10px] text-[14px] overflow-hidden leading-none min-h-12',
                                            isCollapsed ? 'justify-center px-0' : 'gap-3.5 px-4',
                                            isActive
                                                ? 'bg-primary text-white shadow-md shadow-primary/20'
                                                : 'text-[#191919] hover:bg-[#F8F9FB]',
                                        )}
                                    >
                                        <link.icon size={22} className={cn(
                                            'shrink-0',
                                            isActive ? 'text-white' : 'text-[#000000]',
                                        )} />
                                        {!isCollapsed && (
                                            <span className="font-semibold whitespace-nowrap">{link.name}</span>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>
            <div className="px-3 lg:px-4 pb-3">
                <Link
                    href="/"
                    onClick={onNavigate}
                    title={isCollapsed ? (isAdmin ? 'Shop as this supplier' : 'View Storefront') : undefined}
                    className={cn(
                        'flex items-center rounded-[10px] text-[14px] overflow-hidden leading-none text-primary hover:bg-primary-light font-semibold min-h-12',
                        isCollapsed ? 'justify-center px-0' : 'gap-3.5 px-4',
                    )}
                >
                    <Home size={22} className="shrink-0" />
                    {!isCollapsed && (
                        <span className="whitespace-nowrap">
                            {isAdmin ? 'Shop as this supplier' : 'View Storefront'}
                        </span>
                    )}
                </Link>
            </div>
        </>
    );
}

export default function VendorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session, status } = useSession();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [adminVendorName, setAdminVendorName] = useState<string | null>(null);
    const [isApplicationPending, setIsApplicationPending] = useState(false);
    const [checkingApplication, setCheckingApplication] = useState(true);
    const [enteredStore, setEnteredStoreState] = useState(() => {
        if (typeof window === 'undefined') return false;
        return readEnteredStore();
    });

    const sessionUser = session?.user;
    const userRole = sessionUser?.role;
    const activeAccountType = sessionUser?.activeBusinessAccountType;
    const isActiveVendor = activeAccountType?.isVendor === true;
    const isAdmin = userRole === 'admin';
    const {
      currentAccount,
      accounts: switcherAccounts,
      switchAccount,
      switching: switchingAccount,
      loading: accountsLoading,
      availableStores: switcherStores,
      activeVendorId: switcherVendorId,
      isStoreScopedOnly: switcherStoreScoped,
    } = useBusinessAccountSwitcher();
    const vendorAutoSwitchAttempted = React.useRef(false);
    const isStoreScopedOnly = switcherStoreScoped || sessionUser?.isStoreScopedOnly === true;
    const availableStores = switcherStores.length > 0
      ? switcherStores
      : (sessionUser?.availableStores ?? []);
    const allowStorePicker = needsStorePicker({ isStoreScopedOnly });
    const activeVendorId = switcherVendorId ?? sessionUser?.activeVendorId ?? null;
    const activeStoreName =
        availableStores.find((s) => s.id === activeVendorId)?.displayName
        ?? availableStores.find((s) => s.isPrimaryStore)?.displayName
        ?? availableStores[0]?.displayName
        ?? null;
    const activeBusinessName =
        currentAccount?.displayName
        ?? currentAccount?.legalName
        ?? sessionUser?.availableAccounts?.find((a) => a.id === sessionUser.activeBusinessAccountId)?.displayName
        ?? null;
    // Supplier's personal name (User.fullName) — shown as the root crumb instead of the account name
    const supplierPersonName = sessionUser?.name?.trim() || null;
    const onBusinessesList = pathname === '/vendor/businesses' || pathname === '/businesses';

    // Sync enter-store UI from sessionStorage. Do not clear sessionStorage here —
    // supplier/business pages reset on mount; clearing here races with Enter Store
    // (switchOnlineStore → router.refresh while still on /vendor/businesses/…).
    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        if (isSupplierLevelPath(pathname)) {
            setEnteredStoreState(false);
            return;
        }
        setEnteredStoreState(readEnteredStore());
    }, [pathname]);

    const portalLevel = resolvePortalLevel(pathname, {
        isStoreScopedOnly,
        // Trust sessionStorage on store-ops routes immediately after Enter Store hard nav
        enteredStore:
            enteredStore
            || (typeof window !== 'undefined'
                && isStoreOpsPath(pathname)
                && readEnteredStore()),
        allowStorePicker,
    });
    const showStoreNav = portalLevel === 'store';

    const { can } = usePermissions();
    const firstAllowedRoute = getFirstAllowedRoute('vendor', can, {
        vendorLevel: showStoreNav ? 'store' : 'supplier',
    });
    const navSource = showStoreNav ? VENDOR_NAV_GROUPS : SUPPLIER_NAV_GROUPS;
    const visibleGroups = navSource.map((g) => ({
      ...g,
      links: filterNavLinks(g.links, can, 'vendor', (link) =>
        // Store-scoped picker: Businesses only (no team / supplier overview)
        allowStorePicker && !showStoreNav && (
          link.href === '/vendor/overview'
          || link.href === SUPPLIER_HUB_PATH
          || link.href === '/vendor/team'
          || link.href === '/vendor/account'
          || link.href === '/vendor/all-orders'
          || link.href === '/vendor/reports'
          || link.href === '/vendor/ledger'
        ),
      ),
    })).filter((g) => g.links.length > 0);

    const vendorAccountIds = (
      switcherAccounts.length > 0
        ? switcherAccounts
        : (sessionUser?.availableAccounts ?? [])
    )
      .filter((a) => a.isVendor)
      .map((a) => a.id);
    const supplierHome = supplierDashboardPath(vendorAccountIds);
    const remappedGroups = visibleGroups.map((g) => ({
      ...g,
      links: g.links.map((l) => (
        l.href === '/vendor/overview' || l.href === SUPPLIER_HUB_PATH
          ? { ...l, href: supplierHome }
          : l
      )),
    }));

    // Hierarchy routing:
    // - store-scoped team → Businesses picker until Enter Store
    // - business-wide → businesses / store list until Enter Store
    React.useEffect(() => {
        if (status !== 'authenticated') return;
        if (isApplicationPending) return;
        if (!isAdmin && !isActiveVendor) return;
        if (pathname === '/vendor/setup') return;

        if (allowStorePicker) {
            if (isStoreOpsPath(pathname) && !readEnteredStore()) {
                router.replace(supplierHome);
            } else if (pathname === '/vendor/overview') {
                router.replace(supplierHome);
            }
            return;
        }

        if (pathname === '/vendor/overview' && !accountsLoading) {
            router.replace(supplierHome);
            return;
        }

        if (isStoreOpsPath(pathname) && !readEnteredStore()) {
            router.replace(supplierHome);
        }
    }, [status, isApplicationPending, isAdmin, isActiveVendor, allowStorePicker, pathname, router, supplierHome, accountsLoading]);

    React.useEffect(() => {
        if (status !== 'authenticated') return;
        if (isApplicationPending) return;
        if (!isAdmin && !isActiveVendor) return;
        if (visibleGroups.length === 0) return;
        if (!firstAllowedRoute) return;
        // Allow businesses list + detail under supplier nav (avoid store-nav race → dashboard)
        if (pathname === '/businesses' || pathname.startsWith('/vendor/businesses')) return;
        if (pathname === '/vendor/setup') return;
        // Enter Store sets sessionStorage before hard nav — do not bounce to overview
        if (isStoreOpsPath(pathname) && readEnteredStore()) return;
        const allHrefs = visibleGroups.flatMap((g) => g.links.map((l) => l.href));
        if (!allHrefs.some((h) => pathname === h || pathname.startsWith(`${h}/`))) {
            router.replace(firstAllowedRoute);
        }
    }, [status, isApplicationPending, isAdmin, isActiveVendor, visibleGroups, firstAllowedRoute, pathname, router]);

    // Only treat the impersonation cookie as authoritative when the current
    // session is actually an admin. A vendor logging in fresh would otherwise
    // see an "Admin View" banner for whichever vendor an admin previously
    // impersonated on the same browser. When the cookie is found on a
    // non-admin session we also DELETE the impersonation server-side so the
    // stale cookie doesn't keep poisoning future requests.
    const sessionRole = (session?.user as { role?: string } | undefined)?.role;
    React.useEffect(() => {
        if (status !== 'authenticated') return;
        const match = document.cookie.match(/(?:^|;\s*)admin_impersonate_vendor_name=([^;]+)/);
        if (sessionRole === 'admin' && match) {
            setAdminVendorName(decodeURIComponent(match[1]));
        } else {
            setAdminVendorName(null);
            if (match) {
                // Stale impersonation cookie from a previous admin session — clear it.
                fetch('/api/v1/admin/impersonate', { method: 'DELETE' }).catch(() => {});
            }
        }
    }, [status, sessionRole]);

    // Check application status when the active business account is a vendor
    React.useEffect(() => {
        if (status !== 'authenticated') return;
        if (isAdmin) {
            setCheckingApplication(false);
            setIsApplicationPending(false);
            return;
        }
        if (!isActiveVendor) {
            setCheckingApplication(false);
            return;
        }

        let isMounted = true;
        fetch('/api/v1/vendor/application-status')
            .then((res) => res.json())
            .then((res) => {
                if (isMounted) {
                    if (res.success && res.data?.hasApplication && res.data?.status === 'pending') {
                        setIsApplicationPending(true);
                    } else {
                        setIsApplicationPending(false);
                    }
                }
            })
            .catch((err) => {
                console.error('Failed to check application status:', err);
            })
            .finally(() => {
                if (isMounted) {
                    setCheckingApplication(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [status, isAdmin, isActiveVendor]);

    // Redirect to setup wizard until complete — verified vendors only (pending apps stay out)
    React.useEffect(() => {
        if (status !== 'authenticated' || isAdmin || !isActiveVendor) return;
        if (isApplicationPending) return;
        if (pathname === '/vendor/setup') return;
        fetch('/api/v1/vendor/setup')
            .then((r) => r.json())
            .then((j) => {
                if (!j.success) return;
                if (j.data?.isVerified === true || j.data?.wizardComplete === true) return;
                if (pathname === '/vendor/dashboard') {
                    router.replace('/vendor/setup');
                }
            })
            .catch(() => {});
    }, [status, isAdmin, isActiveVendor, isApplicationPending, pathname, router]);

    const handleExitAdminView = async () => {
        await clearAllAdminImpersonation();
        router.push('/admin/vendors');
        router.refresh();
    };

    React.useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    React.useEffect(() => {
        if (!mobileOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMobileOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener('keydown', onKey);
        };
    }, [mobileOpen]);

    React.useEffect(() => {
        if (status !== 'authenticated' || isAdmin || isActiveVendor) return;
        if (accountsLoading || switchingAccount) return;
        if (!activeAccountType) {
            router.replace('/login');
            return;
        }
        // Wait for the fresh-login picker: auto-switching here would fight the
        // account the user is choosing and re-arm the picker.
        if (isPickerPending(session?.user)) return;
        const preferredId = peekPickedAccount();
        const vendorAccount =
          (preferredId ? switcherAccounts.find((a) => a.id === preferredId && a.isVendor) : undefined)
          ?? switcherAccounts.find((a) => a.isVendor);
        if (vendorAccount) {
            if (vendorAutoSwitchAttempted.current) return;
            vendorAutoSwitchAttempted.current = true;
            consumePickedAccount();
            void switchAccount(vendorAccount.id).catch(() => {
                vendorAutoSwitchAttempted.current = false;
            });
            return;
        }
        if (preferredId || isPickerInFlight()) return;
        router.replace(defaultPortalPath(activeAccountType));
    }, [
        status,
        isAdmin,
        isActiveVendor,
        activeAccountType,
        accountsLoading,
        switchingAccount,
        switcherAccounts,
        switchAccount,
        router,
        session?.user,
    ]);

    // Show loading while checking auth or application status.
    // IMPORTANT: only gate on the *initial* load (no session yet). A background
    // session revalidation — e.g. the 60s updateSession() interval below or a
    // window-focus refetch — momentarily flips `status` to 'loading' while the
    // existing `session` stays populated. Gating on bare `status === 'loading'`
    // would unmount this whole children subtree on every revalidation, closing
    // any open modal/sidebar and wiping in-progress form state. The `!session`
    // guard keeps children mounted through background refreshes.
    if ((status === 'loading' && !session) || (status === 'authenticated' && isActiveVendor && !isAdmin && checkingApplication)) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#F8F9FB]">
                <Loader2 className="animate-spin text-primary" size={40} />
            </div>
        );
    }

    // Block unauthenticated users
    if (status === 'unauthenticated') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8F9FB] gap-4">
                <ShieldAlert size={48} className="text-[#E74C3C]" />
                <h1 className="text-[24px] font-bold text-[#181725]">Access Denied</h1>
                <p className="text-[14px] text-[#7C7C7C]">You need to sign in to access the vendor portal.</p>
                <button
                    onClick={() => router.push('/login')}
                    className="mt-4 px-6 py-3 bg-primary text-white rounded-[10px] font-bold hover:bg-primary-dark transition-colors"
                >
                    Sign In
                </button>
            </div>
        );
    }

    if (!isAdmin && !isActiveVendor) {
        // Redirect is handled in the useEffect above — never call router during render.
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] bg-[#F8F9FB] gap-4">
                <Loader2 className="animate-spin text-primary" size={36} />
                <p className="text-[14px] text-[#7C7C7C]">Redirecting…</p>
            </div>
        );
    }

    // Pending first application: block the whole supplier panel until admin
    // Approve & Verify. Homepage VendorApplicationBanner is the waiting UX.
    if (!isAdmin && isApplicationPending) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8F9FB] gap-5 px-6">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                    <Clock size={28} className="text-[#F59E0B]" />
                </div>
                <div className="text-center max-w-md space-y-2">
                    <h1 className="text-[22px] font-bold text-[#181725]">Application under review</h1>
                    <p className="text-[14px] text-[#7C7C7C] leading-relaxed">
                        Thanks for applying. Your Online Store is waiting for super-admin Approve &amp; Verify.
                        You&apos;ll get full supplier dashboard access once approved — this is normal for new suppliers.
                    </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 h-[42px] px-5 rounded-[10px] bg-primary text-white text-[13px] font-bold hover:bg-primary-dark transition-colors"
                    >
                        <Home size={16} />
                        Back to marketplace
                    </Link>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-2 h-[42px] px-5 rounded-[10px] border border-[#EEEEEE] text-[#7C7C7C] text-[13px] font-bold hover:bg-white transition-colors"
                    >
                        Check again
                    </button>
                </div>
            </div>
        );
    }

    if (visibleGroups.length === 0) {
        return (
            <div className="flex flex-col min-h-screen bg-[#F8F9FB]">
                <PortalNoAccess />
            </div>
        );
    }

    const dockHrefs = showStoreNav
        ? ['/vendor/dashboard', '/vendor/orders', '/vendor/products']
        : [supplierHome, '/vendor/all-orders', '/businesses'];
    const dockLinks = dockHrefs
        .map((href) => findVendorNavLink(remappedGroups, href))
        .filter((link): link is PortalNavLink => Boolean(link));

    return (
        <div className="flex flex-col min-h-dvh bg-[#F8F9FB]">

            <header className="sticky top-0 z-50 shrink-0 bg-white border-b border-[#EEEEEE] pt-[env(safe-area-inset-top)]">
                <div className="h-14 lg:h-20 flex items-center gap-2 px-3 lg:px-8">
                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        className="lg:hidden size-12 flex items-center justify-center rounded-[12px] text-[#181725] hover:bg-ivory active:scale-[0.97] transition-transform"
                        aria-label="Open supplier menu"
                    >
                        <Menu size={22} />
                    </button>

                    <div className={cn(
                        'shrink-0 flex items-center gap-2.5 min-w-0',
                        isCollapsed ? 'lg:w-[60px]' : 'lg:w-[220px]',
                    )}>
                        <Link
                            href={showStoreNav ? (firstAllowedRoute ?? '/vendor/dashboard') : supplierHome}
                            className="flex items-center gap-2.5 min-w-0 overflow-hidden"
                        >
                            <div className="size-9 lg:size-[42px] shrink-0">
                                <img src="/images/admin/Ellipse 2.svg" alt="" className="w-full h-full object-contain" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-[18px] lg:text-[22px] font-extrabold leading-tight truncate">
                                    <span className="text-[#E74C3C]">Horeca</span><span className="text-primary">1</span>
                                </h1>
                                <p className="hidden sm:block text-[10px] text-[#AEAEAE] font-semibold uppercase -mt-0.5">
                                    {showStoreNav ? 'Store Ops' : 'Supplier Panel'}
                                </p>
                            </div>
                        </Link>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="hidden lg:flex size-11 items-center justify-center hover:bg-ivory rounded-[12px] text-[#181725] active:scale-[0.97] transition-transform"
                        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <Menu size={22} />
                    </button>

                    <div className="hidden lg:flex flex-1 justify-center px-10">
                        <VendorGlobalSearch />
                    </div>

                    <div className="ml-auto flex items-center gap-1 lg:gap-5 shrink-0">
                        <VendorNotificationBell />
                        <BusinessAccountSwitcherDropdown />
                    </div>
                </div>
            </header>

            {mobileOpen && (
                <div className="lg:hidden fixed inset-0 z-[60]">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/45"
                        aria-label="Close supplier menu"
                        onClick={() => setMobileOpen(false)}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Supplier navigation"
                        className="absolute inset-y-0 left-0 w-[min(86vw,20rem)] bg-white shadow-[0_12px_24px_rgba(31,34,51,0.12)] flex flex-col pt-[env(safe-area-inset-top)]"
                    >
                        <div className="flex items-center justify-between px-4 h-14 border-b border-[#EEEEEE]">
                            <p className="text-[16px] font-bold text-primary">Menu</p>
                            <button
                                type="button"
                                onClick={() => setMobileOpen(false)}
                                className="size-12 flex items-center justify-center rounded-[12px] text-[#667085] hover:bg-ivory active:scale-[0.97] transition-transform"
                                aria-label="Close menu"
                            >
                                <X size={22} />
                            </button>
                        </div>
                        <VendorNavBody
                            groups={remappedGroups}
                            pathname={pathname}
                            isCollapsed={false}
                            adminVendorName={adminVendorName}
                            onExitAdminView={() => void handleExitAdminView()}
                            isAdmin={isAdmin}
                            onNavigate={() => setMobileOpen(false)}
                        />
                    </div>
                </div>
            )}

            <div className="w-full bg-cream border-b border-divider px-3 lg:px-[clamp(1rem,2.5vw,2rem)] py-2 flex items-center gap-2 text-[12px] lg:text-[13px] min-w-0">
                <Building2 size={14} className="text-primary shrink-0" />
                <nav className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden" aria-label="Portal level">
                    <>
                        {!allowStorePicker && (
                          <Link
                              href={supplierHome}
                              className={cn(
                                  'font-semibold shrink-0',
                                  portalLevel === 'supplier' && !supplierPersonName
                                    ? 'text-[#181725]'
                                    : 'text-primary hover:text-primary-dark',
                              )}
                          >
                              Supplier
                          </Link>
                        )}
                        {(supplierPersonName || allowStorePicker) && (
                            <>
                                {!allowStorePicker && <span className="text-[#AEAEAE]">›</span>}
                                <Link
                                    href="/businesses"
                                    className={cn(
                                        'font-semibold truncate max-w-[180px]',
                                        onBusinessesList || (!showStoreNav && allowStorePicker)
                                          ? 'text-[#181725]'
                                          : 'text-primary hover:text-primary-dark',
                                    )}
                                    title={supplierPersonName ?? 'Businesses'}
                                >
                                    {allowStorePicker ? 'My businesses' : (supplierPersonName ?? 'Businesses')}
                                </Link>
                            </>
                        )}
                        {(portalLevel === 'business' || portalLevel === 'store') && !onBusinessesList && (
                            <>
                                <span className="text-[#AEAEAE]">›</span>
                                <Link
                                    href={currentAccount?.id
                                      ? `/vendor/businesses/${currentAccount.id}`
                                      : '/businesses'}
                                    className={cn(
                                        'font-semibold truncate max-w-[160px]',
                                        portalLevel === 'business' ? 'text-[#181725]' : 'text-primary hover:text-primary-dark',
                                    )}
                                    title={activeBusinessName ?? 'Business'}
                                >
                                    {activeBusinessName ?? 'Business'}
                                </Link>
                            </>
                        )}
                        {portalLevel === 'store' && activeStoreName && (
                            <>
                                <span className="text-[#AEAEAE]">›</span>
                                <span className="text-[#181725] font-semibold truncate max-w-[160px]" title={activeStoreName}>
                                    {activeStoreName}
                                </span>
                            </>
                        )}
                    </>
                </nav>
                {showStoreNav && (
                    <Link
                        href={supplierHome}
                        onClick={() => setEnteredStore(false)}
                        className="hidden sm:inline ml-auto text-[12px] font-bold text-primary hover:text-primary-dark shrink-0"
                    >
                        {allowStorePicker ? 'Switch store' : 'Back to Supplier'}
                    </Link>
                )}
                {!showStoreNav && (
                    <Link
                        href="/businesses"
                        className="hidden sm:inline ml-auto text-[12px] font-bold text-primary hover:text-primary-dark shrink-0"
                    >
                        View businesses
                    </Link>
                )}
            </div>

            <div className="flex flex-1 min-h-0">
                <aside className={cn(
                    'hidden lg:block shrink-0',
                    isCollapsed ? 'w-20' : 'w-[240px]',
                )}>
                    <div
                        className={cn(
                            'bg-white border-r border-[#EEEEEE] flex flex-col sticky top-20 h-[calc(100dvh-5rem)] overflow-hidden z-40',
                            isCollapsed ? 'w-20' : 'w-[240px]',
                        )}
                    >
                        <VendorNavBody
                            groups={remappedGroups}
                            pathname={pathname}
                            isCollapsed={isCollapsed}
                            adminVendorName={adminVendorName}
                            onExitAdminView={() => void handleExitAdminView()}
                            isAdmin={isAdmin}
                        />
                        <div className="p-3 border-t border-[#EEEEEE]">
                            <button
                                type="button"
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                className="w-full flex items-center justify-center min-h-12 hover:bg-ivory rounded-[12px] text-[#AEAEAE] hover:text-[#181725] active:scale-[0.97] transition-transform"
                            >
                                {isCollapsed ? (
                                    <ChevronRight size={20} />
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <ChevronLeft size={20} />
                                        <span className="text-[13px] font-medium">Collapse</span>
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>
                </aside>

                <main className="flex-1 px-4 py-4 lg:px-8 lg:py-8 min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8">
                    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>}>
                        <PortalPageGuard scope="vendor">{children}</PortalPageGuard>
                    </Suspense>
                </main>
            </div>

            <nav
                className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-[#EEEEEE] pb-[env(safe-area-inset-bottom)]"
                aria-label="Supplier shortcuts"
            >
                <div className="grid grid-cols-4 h-16">
                    {dockLinks.slice(0, 3).map((link) => {
                        const active = pathname === link.href
                          || (link.href !== '/vendor' && pathname.startsWith(`${link.href}/`));
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
                                    active ? 'text-primary' : 'text-[#6B7280]',
                                )}
                            >
                                <link.icon size={22} />
                                <span className="truncate max-w-[4.5rem]">{link.name}</span>
                            </Link>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[#6B7280] active:scale-[0.97] transition-transform"
                    >
                        <Menu size={22} />
                        Menu
                    </button>
                </div>
            </nav>
        </div>
    );
}
