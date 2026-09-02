'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
    LayoutDashboard,
    ShoppingBag,
    CheckSquare,
    Search,
    Menu,
    ChevronLeft,
    ChevronRight,
    Loader2,
    ShieldAlert,
    Home,
    X,
    Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BusinessAccountSwitcherDropdown } from '@/components/account-switcher/BusinessAccountSwitcherDropdown';
import { NotificationBell } from '@/components/features/NotificationBell';
import { usePermissions } from '@/hooks/usePermissions';
import { ADMIN_NAV_GROUPS, filterNavLinks, type PortalNavGroup, type PortalNavLink } from '@/lib/permissions/portalNav';
import { getFirstAllowedRoute } from '@/lib/permissions/routePermissions';
import { PortalPageGuard } from '@/components/auth/PortalPageGuard';
import { PortalNoAccess } from '@/components/auth/PortalNoAccess';
import { Suspense } from 'react';

function isNavActive(pathname: string, href: string): boolean {
    if (pathname === href) return true;
    if (href === '/admin/dashboard') return false;
    return pathname.startsWith(`${href}/`);
}

function findNavLink(groups: PortalNavGroup[], href: string): PortalNavLink | undefined {
    for (const group of groups) {
        const found = group.links.find((l) => l.href === href);
        if (found) return found;
    }
    return undefined;
}

function AdminNavLinks({
    groups,
    pathname,
    pendingApprovals,
    collapsed,
    onNavigate,
}: {
    groups: PortalNavGroup[];
    pathname: string;
    pendingApprovals: number;
    collapsed: boolean;
    onNavigate?: () => void;
}) {
    return (
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {groups.map((group) => (
                <div key={group.label} className="mb-4">
                    {!collapsed && (
                        <p className="px-3 mb-2 text-[11px] font-semibold uppercase text-[#6B7280]">
                            {group.label}
                        </p>
                    )}
                    <div className="space-y-1">
                        {group.links.map((link) => {
                            const isActive = isNavActive(pathname, link.href);
                            const badge = link.name === 'Approvals' ? pendingApprovals : 0;
                            const badgeLabel = badge > 99 ? '99+' : String(badge);
                            return (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    onClick={onNavigate}
                                    title={collapsed ? (badge > 0 ? `${link.name} (${badgeLabel} pending)` : link.name) : undefined}
                                    className={cn(
                                        'relative flex items-center rounded-[12px] text-[14px] font-semibold overflow-hidden leading-none min-h-12',
                                        collapsed ? 'justify-center px-0' : 'gap-3 px-4',
                                        isActive
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'text-[#1C1C1C] hover:bg-primary-light active:bg-primary-light',
                                    )}
                                >
                                    <span className="relative shrink-0">
                                        <link.icon
                                            size={22}
                                            className={cn(isActive ? 'text-white' : 'text-[#1C1C1C]')}
                                        />
                                        {collapsed && badge > 0 && (
                                            <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-error border-2 border-white" />
                                        )}
                                    </span>
                                    {!collapsed && (
                                        <>
                                            <span className="whitespace-nowrap flex-1">{link.name}</span>
                                            {badge > 0 && (
                                                <span
                                                    className={cn(
                                                        'inline-flex min-w-[22px] h-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                                                        isActive ? 'bg-white text-error' : 'bg-error text-white',
                                                    )}
                                                >
                                                    {badgeLabel}
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
    );
}

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session, status } = useSession();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [pendingApprovals, setPendingApprovals] = useState(0);

    const { can, hasAny } = usePermissions();
    const canSeeApprovals = hasAny('vendors.approve', 'brands.approve', 'products.approve');
    const userRole = (session?.user as { role?: string })?.role;
    const firstAllowedRoute = getFirstAllowedRoute('admin', can);
    const visibleGroups = ADMIN_NAV_GROUPS.map((g) => ({
        ...g,
        links: filterNavLinks(g.links, can, 'admin'),
    })).filter((g) => g.links.length > 0);
    const allowedHrefs = visibleGroups.flatMap((g) => g.links.map((l) => l.href)).join('|');

    useEffect(() => {
        if (status !== 'authenticated' || userRole !== 'admin') return;
        if (!allowedHrefs || !firstAllowedRoute) return;
        const hrefs = allowedHrefs.split('|');
        if (!hrefs.some((h) => pathname === h || pathname.startsWith(`${h}/`))) {
            router.replace(firstAllowedRoute);
        }
    }, [status, userRole, allowedHrefs, firstAllowedRoute, pathname, router]);

    useEffect(() => {
        if (status !== 'authenticated') return;
        if (!canSeeApprovals) return;
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
    }, [status, pathname, canSeeApprovals]);

    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    useEffect(() => {
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

    const dockLinks = [
        findNavLink(visibleGroups, '/admin/dashboard'),
        findNavLink(visibleGroups, '/admin/orders'),
        findNavLink(visibleGroups, '/admin/approvals')
            ?? findNavLink(visibleGroups, '/admin/customers')
            ?? findNavLink(visibleGroups, '/admin/vendors'),
    ].filter((link): link is PortalNavLink => Boolean(link));

    if (status === 'loading' && !session) {
        return (
            <div className="flex items-center justify-center min-h-dvh bg-background">
                <Loader2 className="animate-spin text-primary" size={40} />
            </div>
        );
    }

    if (status === 'unauthenticated' || userRole !== 'admin') {
        return (
            <div className="flex flex-col items-center justify-center min-h-dvh bg-background gap-4 px-6">
                <ShieldAlert size={48} className="text-error" />
                <h1 className="text-[clamp(1.25rem,4vw,1.5rem)] font-bold text-[#111827] text-balance">Access Denied</h1>
                <p className="text-[14px] text-[#667085] text-pretty text-center">You need admin privileges to access this area.</p>
                <button
                    type="button"
                    onClick={() => router.push('/')}
                    className="mt-2 min-h-12 px-6 bg-primary text-white rounded-[12px] font-semibold hover:bg-primary-dark active:bg-primary-pressed active:scale-[0.97] transition-transform"
                >
                    Go to Homepage
                </button>
            </div>
        );
    }

    if (visibleGroups.length === 0) {
        return (
            <div className="flex flex-col min-h-dvh bg-background">
                <PortalNoAccess />
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-dvh bg-background">
            <header className="sticky top-0 z-50 shrink-0 bg-white border-b border-divider pt-[env(safe-area-inset-top)]">
                <div className="h-14 lg:h-20 flex items-center gap-2 px-3 lg:px-8">
                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        className="lg:hidden size-12 flex items-center justify-center rounded-[12px] text-[#1C1C1C] hover:bg-ivory active:scale-[0.97] transition-transform"
                        aria-label="Open admin menu"
                    >
                        <Menu size={22} />
                    </button>

                    <Link
                        href={firstAllowedRoute ?? '/admin/dashboard'}
                        className="flex items-center gap-2.5 min-w-0"
                    >
                        <div className="size-9 lg:size-[42px] shrink-0">
                            <img src="/images/admin/Ellipse 2.svg" alt="" className="w-full h-full object-contain" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-[18px] lg:text-[22px] font-extrabold leading-tight text-primary truncate">
                                Horeca1
                            </h1>
                            <p className="hidden sm:block text-[10px] text-[#6B7280] font-semibold uppercase -mt-0.5">
                                Admin
                            </p>
                        </div>
                    </Link>

                    <button
                        type="button"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="hidden lg:flex ml-2 size-11 items-center justify-center hover:bg-ivory rounded-[12px] text-[#1C1C1C] active:scale-[0.97] transition-transform"
                        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <Menu size={22} />
                    </button>

                    <div className="hidden lg:flex flex-1 justify-center px-10">
                        <div className="relative w-full max-w-[520px]">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={18} />
                            <input
                                type="search"
                                placeholder="Search"
                                aria-label="Search admin"
                                className="w-full bg-ivory border border-divider rounded-[12px] py-3 pl-11 pr-4 text-[14px] outline-none placeholder:text-[#9CA3AF] font-medium focus:border-primary focus:bg-white"
                            />
                        </div>
                    </div>

                    <div className="ml-auto flex items-center gap-1 lg:gap-4 shrink-0">
                        <NotificationBell accentColor="#6B1D2E" />
                        <BusinessAccountSwitcherDropdown isAdminMode={true} />
                    </div>
                </div>
            </header>

            {mobileOpen && (
                <div className="lg:hidden fixed inset-0 z-[60]">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/45"
                        aria-label="Close admin menu"
                        onClick={() => setMobileOpen(false)}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Admin navigation"
                        className="absolute inset-y-0 left-0 w-[min(86vw,20rem)] bg-white shadow-[0_12px_24px_rgba(31,34,51,0.12)] flex flex-col pt-[env(safe-area-inset-top)]"
                    >
                        <div className="flex items-center justify-between px-4 h-14 border-b border-divider">
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
                        <AdminNavLinks
                            groups={visibleGroups}
                            pathname={pathname}
                            pendingApprovals={pendingApprovals}
                            collapsed={false}
                            onNavigate={() => setMobileOpen(false)}
                        />
                        <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-divider pt-3">
                            <Link
                                href="/"
                                onClick={() => setMobileOpen(false)}
                                className="flex items-center gap-3 min-h-12 px-4 rounded-[12px] text-primary font-semibold hover:bg-primary-light"
                            >
                                <Home size={22} />
                                View Storefront
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-1 min-h-0">
                <aside
                    className={cn(
                        'hidden lg:block shrink-0',
                        isCollapsed ? 'w-20' : 'w-[240px]',
                    )}
                >
                    <div
                        className={cn(
                            'bg-white border-r border-divider flex flex-col sticky top-20 h-[calc(100dvh-5rem)] overflow-hidden z-40',
                            isCollapsed ? 'w-20' : 'w-[240px]',
                        )}
                    >
                        <AdminNavLinks
                            groups={visibleGroups}
                            pathname={pathname}
                            pendingApprovals={pendingApprovals}
                            collapsed={isCollapsed}
                        />
                        <div className="px-3 pb-2">
                            <Link
                                href="/"
                                title={isCollapsed ? 'View Storefront' : undefined}
                                className={cn(
                                    'flex items-center rounded-[12px] text-[14px] text-primary hover:bg-primary-light font-semibold min-h-12',
                                    isCollapsed ? 'justify-center px-0' : 'gap-3 px-4',
                                )}
                            >
                                <Home size={22} className="shrink-0" />
                                {!isCollapsed && <span className="whitespace-nowrap">View Storefront</span>}
                            </Link>
                        </div>
                        <div className="p-3 border-t border-divider">
                            <button
                                type="button"
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                className="w-full flex items-center justify-center min-h-12 hover:bg-ivory rounded-[12px] text-[#6B7280] hover:text-[#1C1C1C] active:scale-[0.97] transition-transform"
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
                        <PortalPageGuard scope="admin">{children}</PortalPageGuard>
                    </Suspense>
                </main>
            </div>

            <nav
                className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-divider pb-[env(safe-area-inset-bottom)]"
                aria-label="Admin shortcuts"
            >
                <div className="grid grid-cols-4 h-16">
                    {dockLinks.slice(0, 3).map((link) => {
                        const Icon =
                            link.href === '/admin/dashboard' ? LayoutDashboard
                            : link.href === '/admin/orders' ? ShoppingBag
                            : link.href === '/admin/approvals' ? CheckSquare
                            : link.href === '/admin/customers' ? Users
                            : link.icon;
                        const active = isNavActive(pathname, link.href);
                        const badge = link.name === 'Approvals' ? pendingApprovals : 0;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    'relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
                                    active ? 'text-primary' : 'text-[#6B7280]',
                                )}
                            >
                                <span className="relative">
                                    <Icon size={22} />
                                    {badge > 0 && (
                                        <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-[9px] font-bold flex items-center justify-center">
                                            {badge > 99 ? '99+' : badge}
                                        </span>
                                    )}
                                </span>
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
