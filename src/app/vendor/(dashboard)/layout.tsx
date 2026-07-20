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
import { useSession, signOut } from 'next-auth/react';
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
    Search,
    ChevronDown,
    Menu,
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
import { clearAllAdminImpersonation } from '@/lib/clearImpersonation';
import { BusinessAccountSwitcherDropdown } from '@/components/account-switcher/BusinessAccountSwitcherDropdown';
import { VendorNotificationBell } from '@/components/features/vendor/VendorNotificationBell';
import { VendorGlobalSearch } from '@/components/vendor/VendorGlobalSearch';
import { usePermissions } from '@/hooks/usePermissions';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { VENDOR_NAV_GROUPS, SUPPLIER_NAV_GROUPS, filterNavLinks } from '@/lib/permissions/portalNav';
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
} from '@/lib/supplierPortalLevel';

export default function VendorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session, status } = useSession();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [adminVendorName, setAdminVendorName] = useState<string | null>(null);
    const [isApplicationPending, setIsApplicationPending] = useState(false);
    const [checkingApplication, setCheckingApplication] = useState(true);
    // null = brands fetch in flight — do not hide Brand Mappings (avoids false redirect to dashboard/setup)
    const [hasBrandMappings, setHasBrandMappings] = useState<boolean | null>(null);
    const [enteredStore, setEnteredStoreState] = useState(false);

    const sessionUser = session?.user;
    const userRole = sessionUser?.role;
    const activeAccountType = sessionUser?.activeBusinessAccountType;
    const isActiveVendor = activeAccountType?.isVendor === true;
    const isActiveBrand = activeAccountType?.isBrand === true;
    const isAdmin = userRole === 'admin';
    const canUseVendorPortal = isAdmin || isActiveVendor || userRole === 'vendor';
    const {
      currentAccount,
      availableStores: switcherStores,
      activeVendorId: switcherVendorId,
      isStoreScopedOnly: switcherStoreScoped,
    } = useBusinessAccountSwitcher();
    const isStoreScopedOnly = switcherStoreScoped || sessionUser?.isStoreScopedOnly === true;
    const availableStores = switcherStores.length > 0
      ? switcherStores
      : (sessionUser?.availableStores ?? []);
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

    const fetchBrandMappingAccess = React.useCallback(() => {
        if (status !== 'authenticated' || !canUseVendorPortal) return;
        fetch('/api/v1/vendor/brand-mappings/brands')
            .then((res) => res.json())
            .then((res) => {
                if (res.success) setHasBrandMappings(res.data?.hasAuthorizedBrands === true);
                else setHasBrandMappings(false);
            })
            .catch(() => setHasBrandMappings(false));
    }, [status, canUseVendorPortal]);

    React.useEffect(() => {
        fetchBrandMappingAccess();
    }, [fetchBrandMappingAccess, pathname]);

    React.useEffect(() => {
        if (status !== 'authenticated' || !canUseVendorPortal) return;
        const onFocus = () => fetchBrandMappingAccess();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [status, canUseVendorPortal, fetchBrandMappingAccess]);

    // Sync enter-store flag from sessionStorage (and clear when on supplier/business panels)
    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        if (isSupplierLevelPath(pathname)) {
            setEnteredStore(false);
            setEnteredStoreState(false);
            return;
        }
        setEnteredStoreState(readEnteredStore());
    }, [pathname]);

    const portalLevel = resolvePortalLevel(pathname, {
        isStoreScopedOnly,
        enteredStore: isStoreScopedOnly ? true : enteredStore,
    });
    const showStoreNav = portalLevel === 'store' || isStoreScopedOnly;

    const { can } = usePermissions();
    const firstAllowedRoute = getFirstAllowedRoute('vendor', can, {
        vendorLevel: showStoreNav ? 'store' : 'supplier',
    });
    const navSource = showStoreNav ? VENDOR_NAV_GROUPS : SUPPLIER_NAV_GROUPS;
    const visibleGroups = navSource.map((g) => ({
      ...g,
      links: filterNavLinks(g.links, can, 'vendor', (link) =>
        // Hide only after we know there are no authorized brands (null = still loading)
        (link.href === '/vendor/brand-mappings' && hasBrandMappings === false)
        // Store-scoped staff: no supplier hierarchy links
        || (isStoreScopedOnly && (
          link.href === '/vendor/businesses'
          || link.href === '/vendor/overview'
          || link.name === 'Back to Supplier'
        )),
      ),
    })).filter((g) => g.links.length > 0);

    // Hierarchy routing: store-scoped stay in ops; business-wide need Enter Store for ops
    React.useEffect(() => {
        if (status !== 'authenticated') return;
        if (isApplicationPending) return;
        if (!isAdmin && !isActiveVendor) return;
        if (pathname === '/vendor/setup') return;

        if (isStoreScopedOnly) {
            if (pathname === '/vendor/overview' || pathname.startsWith('/vendor/businesses')) {
                router.replace('/vendor/dashboard');
            }
            return;
        }

        if (isStoreOpsPath(pathname) && !readEnteredStore()) {
            router.replace('/vendor/overview');
        }
    }, [status, isApplicationPending, isAdmin, isActiveVendor, isStoreScopedOnly, pathname, router]);

    React.useEffect(() => {
        if (status !== 'authenticated') return;
        if (isApplicationPending) return;
        if (!isAdmin && !isActiveVendor) return;
        if (visibleGroups.length === 0) return;
        if (!firstAllowedRoute) return;
        // Wait until brand-mapping access is known so we don't bounce /brand-mappings → dashboard → setup
        if (hasBrandMappings === null && pathname.startsWith('/vendor/brand-mappings')) return;
        // Allow business detail dynamic routes under supplier nav
        if (pathname.startsWith('/vendor/businesses/')) return;
        if (pathname === '/vendor/setup') return;
        const allHrefs = visibleGroups.flatMap((g) => g.links.map((l) => l.href));
        if (!allHrefs.some((h) => pathname === h || pathname.startsWith(`${h}/`))) {
            router.replace(firstAllowedRoute);
        }
    }, [status, isApplicationPending, isAdmin, isActiveVendor, visibleGroups, firstAllowedRoute, pathname, router, hasBrandMappings]);

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

    // Redirect to setup wizard until complete — verified vendors are never forced (AUD-005)
    React.useEffect(() => {
        if (status !== 'authenticated' || isAdmin || !isActiveVendor) return;
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
    }, [status, isAdmin, isActiveVendor, pathname, router]);

    const handleExitAdminView = async () => {
        await clearAllAdminImpersonation();
        router.push('/admin/vendors');
        router.refresh();
    };

    React.useEffect(() => {
        if (status !== 'authenticated' || isAdmin || isActiveVendor) return;
        if (!activeAccountType) return;
        router.replace(defaultPortalPath(activeAccountType));
    }, [status, isAdmin, isActiveVendor, activeAccountType, router]);

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
                <Loader2 className="animate-spin text-[#299E60]" size={40} />
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
                    className="mt-4 px-6 py-3 bg-[#299E60] text-white rounded-[10px] font-bold hover:bg-[#238a54] transition-colors"
                >
                    Sign In
                </button>
            </div>
        );
    }

    if (!isAdmin && !isActiveVendor) {
        return (
            <div className="flex items-center justify-center min-h-[50vh] bg-[#F8F9FB]">
                <Loader2 className="animate-spin text-[#299E60]" size={36} />
            </div>
        );
    }

    // Block pending vendor application from accessing dashboard
    if (isApplicationPending) {
        return (
            <div className="flex flex-col min-h-screen bg-[#F8F9FB]">
                {/* Clean Header */}
                <header className="h-[80px] bg-white border-b border-[#EEEEEE] flex items-center px-8 shrink-0 justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-[42px] h-[42px] shrink-0">
                            <img src="/images/admin/Ellipse 2.svg" alt="" className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <h1 className="text-[22px] font-extrabold leading-tight">
                                <span className="text-[#E74C3C]">Horeca</span><span className="text-[#299E60]">1</span>
                            </h1>
                            <p className="text-[10px] text-[#AEAEAE] font-semibold uppercase tracking-[0.15em] -mt-0.5">Vendor Panel</p>
                        </div>
                    </div>
                    <div>
                        <button
                            onClick={() => signOut({ callbackUrl: '/' })}
                            className="flex items-center gap-2 px-4 py-2 text-[14px] font-semibold text-[#7C7C7C] hover:text-[#E74C3C] border border-[#EEEEEE] hover:border-[#E74C3C]/20 rounded-[10px] bg-white hover:bg-[#FFF5F5] transition-all"
                        >
                            <LogOut size={16} />
                            Sign Out
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="bg-white border border-[#EEEEEE] rounded-[24px] p-10 max-w-[500px] w-full text-center shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all">
                        {/* Clock / Pending Illustration */}
                        <div className="w-[80px] h-[80px] bg-[#FFF5E6] rounded-full flex items-center justify-center mx-auto mb-6 text-[#F39C12] animate-pulse">
                            <Clock size={40} className="stroke-[2.5]" />
                        </div>

                        <h2 className="text-[24px] font-bold text-[#181725] mb-3">Application Under Review</h2>
                        
                        <p className="text-[14px] text-[#7C7C7C] leading-relaxed mb-8">
                            Thank you for partnering with <span className="font-semibold text-[#181725]">Horeca1</span>. 
                            Your vendor application for <span className="font-semibold text-[#299E60]">{(session?.user as Record<string, any>)?.businessName || 'your business'}</span> is currently being verified by our onboarding team.
                        </p>

                        <div className="bg-[#F8F9FB] rounded-[16px] p-5 mb-8 border border-[#EEEEEE] text-left">
                            <h4 className="text-[12px] font-bold text-[#181725] uppercase tracking-wider mb-2">What happens next?</h4>
                            <ul className="text-[13px] text-[#7C7C7C] space-y-2.5">
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#F39C12] mt-1.5 shrink-0" />
                                    <span>We are verifying your GSTIN, PAN, and address details.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#F39C12] mt-1.5 shrink-0" />
                                    <span>Once approved, you will receive an email notification.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#F39C12] mt-1.5 shrink-0" />
                                    <span>Upon approval, full dashboard access will be unlocked instantly.</span>
                                </li>
                            </ul>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                onClick={() => router.push('/')}
                                className="px-6 py-3 bg-[#299E60] hover:bg-[#238a54] text-white font-bold text-[14px] rounded-[12px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#299E60]/10"
                            >
                                <Home size={18} />
                                Go to Homepage
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-6 py-3 bg-white hover:bg-[#F8F9FB] text-[#181725] font-bold text-[14px] border border-[#EEEEEE] rounded-[12px] transition-all"
                            >
                                Refresh Status
                            </button>
                        </div>
                    </div>
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

    const bannerHeight = 0; // Banner is now fixed/floating — no layout space needed

    return (
        <div className="flex flex-col min-h-screen bg-[#F8F9FB]">

            {/* Full-width Top Header */}
            <header className="h-[80px] bg-white border-b border-[#EEEEEE] flex items-center px-8 shrink-0 sticky top-0 z-50">
                {/* Logo Section - same width as sidebar */}
                <div className={cn(
                    "shrink-0 flex items-center gap-3 transition-all duration-300 ease-in-out",
                    isCollapsed ? "w-[60px]" : "w-[220px]"
                )}>
                    <Link
                        href={firstAllowedRoute ?? (showStoreNav ? '/vendor/dashboard' : '/vendor/overview')}
                        className="flex items-center gap-3 overflow-hidden"
                        onClick={() => {
                            if (!showStoreNav || isStoreScopedOnly) return;
                            setEnteredStore(false);
                            setEnteredStoreState(false);
                        }}
                    >
                        <div className="w-[42px] h-[42px] shrink-0">
                            <img src="/images/admin/Ellipse 2.svg" alt="" className="w-full h-full object-contain" />
                        </div>
                        {!isCollapsed && (
                            <div className="whitespace-nowrap">
                                <h1 className="text-[22px] font-extrabold leading-tight">
                                    <span className="text-[#E74C3C]">Horeca</span><span className="text-[#299E60]">1</span>
                                </h1>
                                <p className="text-[10px] text-[#AEAEAE] font-semibold uppercase tracking-[0.15em] -mt-0.5">
                                    {showStoreNav ? 'Store Ops' : 'Supplier Panel'}
                                </p>
                            </div>
                        )}
                    </Link>
                </div>

                {/* Sidebar Toggle Button */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="ml-4 p-2 hover:bg-gray-100 rounded-lg transition-colors text-[#181725]"
                >
                    <Menu size={22} />
                </button>

                {/* Search Bar - centered */}
                <div className="flex-1 flex justify-center px-10">
                    <VendorGlobalSearch />
                </div>

                {/* Right Side - Bell + User */}
                <div className="flex items-center gap-5 shrink-0">
                    <VendorNotificationBell />

                    <BusinessAccountSwitcherDropdown />
                </div>
            </header>

            {/* Hierarchy breadcrumbs + context */}
            <div className="w-full bg-emerald-50/70 border-b border-emerald-100 px-[clamp(1rem,2.5vw,2rem)] py-2.5 flex items-center gap-3 text-[13px]">
                <Building2 size={14} className="text-[#299E60] shrink-0" />
                <nav className="flex items-center gap-1.5 min-w-0 flex-wrap" aria-label="Portal level">
                    {!isStoreScopedOnly && (
                        <>
                            <Link
                                href="/vendor/overview"
                                onClick={() => {
                                    setEnteredStore(false);
                                    setEnteredStoreState(false);
                                }}
                                className={cn(
                                    'font-semibold truncate',
                                    portalLevel === 'supplier' ? 'text-[#181725]' : 'text-[#299E60] hover:text-[#238a54]',
                                )}
                            >
                                Supplier
                            </Link>
                            {(portalLevel === 'business' || portalLevel === 'store') && (
                                <>
                                    <span className="text-[#AEAEAE]">›</span>
                                    <Link
                                        href="/vendor/businesses"
                                        onClick={() => {
                                            setEnteredStore(false);
                                            setEnteredStoreState(false);
                                        }}
                                        className={cn(
                                            'font-semibold truncate max-w-[160px]',
                                            portalLevel === 'business' ? 'text-[#181725]' : 'text-[#299E60] hover:text-[#238a54]',
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
                                    <span className="text-[#181725] font-semibold truncate max-w-[160px]">
                                        {activeStoreName}
                                    </span>
                                </>
                            )}
                        </>
                    )}
                    {isStoreScopedOnly && (
                        <span className="font-semibold text-[#181725] truncate">
                            {activeStoreName ?? activeBusinessName ?? 'Store'}
                        </span>
                    )}
                </nav>
                {showStoreNav && !isStoreScopedOnly && (
                    <Link
                        href="/vendor/overview"
                        onClick={() => {
                            setEnteredStore(false);
                            setEnteredStoreState(false);
                        }}
                        className="ml-auto text-[12px] font-bold text-[#299E60] hover:text-[#238a54] shrink-0"
                    >
                        Back to Supplier
                    </Link>
                )}
                {!showStoreNav && !isStoreScopedOnly && (
                    <Link
                        href="/vendor/businesses"
                        className="ml-auto text-[12px] font-bold text-[#299E60] hover:text-[#238a54] shrink-0"
                    >
                        View businesses
                    </Link>
                )}
            </div>

            {/* Body: Sidebar + Content */}
            <div className="flex flex-1">
                {/* Sidebar Column Spacer (maintains width in flex flow) */}
                <aside className={cn(
                    "shrink-0 transition-all duration-300 ease-in-out",
                    isCollapsed ? "w-[80px]" : "w-[240px]"
                )}>
                    {/* Sticky Sidebar Container */}
                    <div
                        style={{ top: 80, height: 'calc(100vh - 80px)' }}
                        className={cn(
                        "bg-white border-r border-[#EEEEEE] flex flex-col sticky overflow-y-auto transition-all duration-300 ease-in-out z-40",
                        isCollapsed ? "w-[80px]" : "w-[240px]"
                    )}>
                        <nav className="flex-1 px-4 py-6 space-y-2">
                            {/* Admin View Indicator */}
                            {adminVendorName && (
                                <div className={cn(
                                    "mb-3 bg-amber-50 border border-amber-200 rounded-[10px] overflow-hidden",
                                    isCollapsed ? "flex justify-center py-2" : "p-3"
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
                                                onClick={handleExitAdminView}
                                                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-1.5 rounded-[6px] transition-colors"
                                            >
                                                <LogOut size={11} />
                                                Exit Admin View
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                            {visibleGroups.map((group) => (
                                <div key={group.label} className="mb-4">
                                    {!isCollapsed && (
                                        <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-[#AEAEAE]">{group.label}</p>
                                    )}
                                    <div className="space-y-1">
                                        {group.links.map((link) => {
                                const isActive = pathname === link.href
                                  || (link.href !== '/vendor' && pathname.startsWith(`${link.href}/`));
                                const isBackToSupplier = link.href === '/vendor/overview' && showStoreNav;
                                return (
                                    <Link
                                        key={link.name}
                                        href={link.href}
                                        title={isCollapsed ? link.name : ""}
                                        onClick={() => {
                                            if (isBackToSupplier) {
                                                setEnteredStore(false);
                                                setEnteredStoreState(false);
                                            }
                                        }}
                                        className={cn(
                                            "flex items-center rounded-[10px] transition-all group text-[14px] overflow-hidden leading-none",
                                            isCollapsed ? "justify-center h-[48px] px-0" : "gap-3.5 px-5 py-3.5",
                                            isActive
                                                ? "bg-[#299E60] text-white shadow-md shadow-[#299E60]/20"
                                                : "text-[#191919] hover:bg-[#F8F9FB]"
                                        )}
                                    >
                                        <link.icon size={22} className={cn(
                                            "transition-colors shrink-0",
                                            isActive ? "text-white" : "text-[#000000] group-hover:text-[#000000]"
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

                        {/* View Storefront */}
                        <div className="px-4 pb-3">
                            <Link
                                href="/"
                                title={isCollapsed ? 'View Storefront' : ''}
                                className={cn(
                                    'flex items-center rounded-[10px] transition-all text-[14px] overflow-hidden leading-none text-[#299E60] hover:bg-[#E8F7EF] font-semibold',
                                    isCollapsed ? 'justify-center h-[48px] px-0' : 'gap-3.5 px-5 py-3.5'
                                )}
                            >
                                <Home size={22} className="shrink-0" />
                                {!isCollapsed && <span className="whitespace-nowrap">View Storefront</span>}
                            </Link>
                        </div>

                        {/* Collapse Toggle Footer */}
                        <div className="p-4 border-t border-[#EEEEEE] flex justify-center">
                            <button
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                className="w-full flex items-center justify-center p-2 hover:bg-gray-50 rounded-lg transition-colors text-[#AEAEAE] hover:text-[#181725]"
                            >
                                {isCollapsed ? <ChevronRight size={20} /> : <div className="flex items-center gap-2"><ChevronLeft size={20} /><span className="text-[13px] font-medium">Collapse Menu</span></div>}
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 px-8 py-8 min-w-0">
                    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#299E60]" size={32} /></div>}>
                        <PortalPageGuard scope="vendor">{children}</PortalPageGuard>
                    </Suspense>
                </main>
            </div>

        </div>
    );
}
