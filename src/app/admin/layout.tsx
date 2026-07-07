'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
    LayoutDashboard,
    ShoppingBag,
    Users,
    Store,
    CheckSquare,
    Wallet,
    BarChart3,
    Settings,
    Search,
    Menu,
    ChevronLeft,
    ChevronRight,
    Loader2,
    ShieldAlert,
    Package,
    Tag,
    Home,
    Sparkles,
    BookOpen,
    RotateCcw,
    CreditCard,
    Gift,
    FileWarning,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BusinessAccountSwitcherDropdown } from '@/components/account-switcher/BusinessAccountSwitcherDropdown';
import { NotificationBell } from '@/components/features/NotificationBell';
import { usePermissions } from '@/hooks/usePermissions';
import { ADMIN_NAV_GROUPS, filterNavLinks } from '@/lib/permissions/portalNav';
import { getFirstAllowedRoute } from '@/lib/permissions/routePermissions';
import { PortalPageGuard } from '@/components/auth/PortalPageGuard';
import { PortalNoAccess } from '@/components/auth/PortalNoAccess';
import { Suspense } from 'react';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session, status } = useSession();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [pendingApprovals, setPendingApprovals] = useState(0);

    const { can, hasAny } = usePermissions();
    const userRole = (session?.user as { role?: string })?.role;
    const firstAllowedRoute = getFirstAllowedRoute('admin', can);
    const visibleGroups = ADMIN_NAV_GROUPS.map((g) => ({
        ...g,
        links: filterNavLinks(g.links, can, 'admin'),
    })).filter((g) => g.links.length > 0);

    useEffect(() => {
        if (status !== 'authenticated' || userRole !== 'admin') return;
        if (visibleGroups.length === 0) return;
        if (!firstAllowedRoute) return;
        const allHrefs = visibleGroups.flatMap((g) => g.links.map((l) => l.href));
        if (!allHrefs.some((h) => pathname === h || pathname.startsWith(`${h}/`))) {
            router.replace(firstAllowedRoute);
        }
    }, [status, userRole, visibleGroups, firstAllowedRoute, pathname, router]);

    // Poll the pending-approvals count
    // without a full page reload. 60s cadence is friendly to the DB and good
    // enough for admins — the Approvals page itself shows live numbers.
    useEffect(() => {
        if (status !== 'authenticated') return;
        if (!hasAny('vendors.approve', 'brands.approve', 'products.approve')) return;
        let cancelled = false;
        const fetchCount = () => {
            fetch('/api/v1/admin/approvals/summary', { credentials: 'include' })
                .then((r) => (r.ok ? r.json() : null))
                .then((j) => {
                    if (cancelled || !j?.success) return;
                    const { pendingVendors = 0, pendingProducts = 0, pendingCategories = 0, pendingBrands = 0 } = j.data ?? {};
                    Promise.resolve().then(() => setPendingApprovals(pendingVendors + pendingProducts + pendingCategories + pendingBrands));
                })
                .catch(() => {});
        };
        fetchCount();
        const id = setInterval(fetchCount, 60_000);
        return () => { cancelled = true; clearInterval(id); };
    }, [status, pathname, hasAny]);

    // Show loading only on the genuine initial load (no session yet). A
    // background session revalidation (window-focus refetch) briefly flips
    // `status` to 'loading' while `session` stays populated; gating on bare
    // 'loading' would unmount this subtree and close any open modal mid-edit.
    if (status === 'loading' && !session) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#F8F9FB]">
                <Loader2 className="animate-spin text-[#299E60]" size={40} />
            </div>
        );
    }

    // Block non-admin users
    if (status === 'unauthenticated' || userRole !== 'admin') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8F9FB] gap-4">
                <ShieldAlert size={48} className="text-[#E74C3C]" />
                <h1 className="text-[24px] font-bold text-[#181725]">Access Denied</h1>
                <p className="text-[14px] text-[#7C7C7C]">You need admin privileges to access this area.</p>
                <button
                    onClick={() => router.push('/')}
                    className="mt-4 px-6 py-3 bg-[#299E60] text-white rounded-[10px] font-bold hover:bg-[#238a54] transition-colors"
                >
                    Go to Homepage
                </button>
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

    return (
        <div className="flex flex-col min-h-screen bg-[#F8F9FB]">
            {/* Full-width Top Header */}
            <header className="h-[80px] bg-white border-b border-[#EEEEEE] flex items-center px-8 sticky top-0 z-50 shrink-0">
                {/* Logo Section - same width as sidebar */}
                <div className={cn(
                    "shrink-0 flex items-center gap-3 transition-all duration-300 ease-in-out",
                    isCollapsed ? "w-[60px]" : "w-[220px]"
                )}>
                    <Link href={firstAllowedRoute ?? '/admin/dashboard'} className="flex items-center gap-3 overflow-hidden">
                        <div className="w-[42px] h-[42px] shrink-0">
                            <img src="/images/admin/Ellipse 2.svg" alt="" className="w-full h-full object-contain" />
                        </div>
                        {!isCollapsed && (
                            <div className="whitespace-nowrap">
                                <h1 className="text-[22px] font-extrabold leading-tight">
                                    <span className="text-[#E74C3C]">Horeca</span><span className="text-[#299E60]">1</span>
                                </h1>
                                <p className="text-[10px] text-[#AEAEAE] font-semibold uppercase tracking-[0.15em] -mt-0.5">Admin Panel</p>
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
                    <div className="relative group w-full max-w-[520px]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={18} />
                        <input
                            type="text"
                            placeholder="search"
                            className="w-full bg-[#F5F5F5] border border-[#EEEEEE] rounded-[14px] py-3 pl-11 pr-4 text-[14px] outline-none transition-all placeholder:text-[#AEAEAE] font-medium focus:border-[#299E60]/40 focus:bg-white focus:shadow-sm"
                        />
                    </div>
                </div>

                {/* Right Side - Bell + Admin */}
                <div className="flex items-center gap-5 shrink-0">
                    <NotificationBell />

                    <BusinessAccountSwitcherDropdown isAdminMode={true} />
                </div>
            </header>

            {/* Body: Sidebar + Content */}
            <div className="flex flex-1">
                {/* Sidebar Column Spacer (maintains width in flex flow) */}
                <aside className={cn(
                    "shrink-0 transition-all duration-300 ease-in-out",
                    isCollapsed ? "w-[80px]" : "w-[240px]"
                )}>
                    {/* Sticky Sidebar Container */}
                    <div className={cn(
                        "bg-white border-r border-[#EEEEEE] flex flex-col sticky top-[80px] h-[calc(100vh-80px)] overflow-y-auto z-40 transition-all duration-300 ease-in-out",
                        isCollapsed ? "w-[80px]" : "w-[240px]"
                    )}>
                        <nav className="flex-1 px-4 py-6 space-y-2">
                            {visibleGroups.map((group) => (
                                <div key={group.label} className="mb-4">
                                    {!isCollapsed && (
                                        <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-[#AEAEAE]">{group.label}</p>
                                    )}
                                    <div className="space-y-1">
                                        {group.links.map((link) => {
                                            const isActive = pathname === link.href;
                                            const badge = link.name === 'Approvals' ? pendingApprovals : 0;
                                            const badgeLabel = badge > 99 ? '99+' : String(badge);
                                            return (
                                                <Link
                                                    key={link.name}
                                                    href={link.href}
                                                    title={isCollapsed ? (badge > 0 ? `${link.name} (${badgeLabel} pending)` : link.name) : ''}
                                                    className={cn(
                                                        'relative flex items-center rounded-[10px] transition-all group text-[14px] overflow-hidden leading-none',
                                                        isCollapsed ? 'justify-center h-[48px] px-0' : 'gap-3.5 px-5 py-3.5',
                                                        isActive
                                                            ? 'bg-[#299E60] text-white shadow-md shadow-[#299E60]/20'
                                                            : 'text-[#191919] hover:bg-[#F8F9FB]',
                                                    )}
                                                >
                                                    <span className="relative shrink-0">
                                                        <link.icon size={22} className={cn(
                                                            'transition-colors',
                                                            isActive ? 'text-white' : 'text-[#000000] group-hover:text-[#000000]',
                                                        )} />
                                                        {isCollapsed && badge > 0 && (
                                                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                                                <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                                                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500 border border-white" />
                                                            </span>
                                                        )}
                                                    </span>
                                                    {!isCollapsed && (
                                                        <>
                                                            <span className="font-semibold whitespace-nowrap flex-1">{link.name}</span>
                                                            {badge > 0 && (
                                                                <span className="relative inline-flex items-center justify-center">
                                                                    <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60 animate-ping" />
                                                                    <span className={cn(
                                                                        'relative inline-flex min-w-[22px] h-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold border',
                                                                        isActive ? 'bg-white text-red-600 border-white' : 'bg-red-500 text-white border-white',
                                                                    )}>
                                                                        {badgeLabel}
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </>
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

                        {/* Collapse Toggle Footer (Optional extra toggle) */}
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
                        <PortalPageGuard scope="admin">{children}</PortalPageGuard>
                    </Suspense>
                </main>
            </div>
        </div>
    );
}
