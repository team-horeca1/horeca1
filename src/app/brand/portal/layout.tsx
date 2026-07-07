'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
    LayoutDashboard,
    Package,
    Settings,
    BarChart3,
    Users,
    Menu,
    ChevronLeft,
    ChevronRight,
    Loader2,
    ShieldAlert,
    Home,
    LogOut,
    Eye,
    Clock,
    XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { defaultPortalPath } from '@/lib/portalRouting';
import { signOut } from 'next-auth/react';
import { BusinessAccountSwitcherDropdown } from '@/components/account-switcher/BusinessAccountSwitcherDropdown';
import { NotificationBell } from '@/components/features/NotificationBell';
import { usePermissions } from '@/hooks/usePermissions';
import { BRAND_NAV_LINKS, filterNavLinks } from '@/lib/permissions/portalNav';

export default function BrandPortalLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session, status } = useSession();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [adminBrandName, setAdminBrandName] = useState<string | null>(null);
    const [applicationStatus, setApplicationStatus] = useState<'pending' | 'rejected' | null>(null);
    const [applicationBrandName, setApplicationBrandName] = useState<string | null>(null);
    const [checkingApplication, setCheckingApplication] = useState(true);

    const { can } = usePermissions();
    const visibleLinks = filterNavLinks(BRAND_NAV_LINKS, can, 'brand');

    const userRole = (session?.user as { role?: string } | undefined)?.role;
    const activeAccountType = (session?.user as {
        activeBusinessAccountType?: { isCustomer: boolean; isVendor: boolean; isBrand: boolean };
    } | undefined)?.activeBusinessAccountType;
    const isActiveBrand = activeAccountType?.isBrand === true;
    const isActiveVendor = activeAccountType?.isVendor === true;
    const isAdmin = userRole === 'admin';

    // Only treat the impersonation cookie as authoritative when the current
    // session is actually an admin. A brand user logging in fresh would
    // otherwise see an "Admin View" banner for whichever brand an admin
    // previously impersonated on the same browser. When the cookie is found
    // on a non-admin session we also DELETE the impersonation server-side so
    // the stale cookie doesn't keep poisoning future requests.
    const sessionRole = userRole;
    React.useEffect(() => {
        if (status !== 'authenticated') return;
        const match = document.cookie.match(/(?:^|;\s*)admin_impersonate_brand_name=([^;]+)/);
        if (sessionRole === 'admin' && match) {
            setAdminBrandName(decodeURIComponent(match[1]));
        } else {
            setAdminBrandName(null);
            if (match) {
                fetch('/api/v1/admin/impersonate/brand', { method: 'DELETE' }).catch(() => {});
            }
        }
    }, [status, sessionRole]);

    // Gate portal access while brand approval is pending or rejected
    React.useEffect(() => {
        if (status !== 'authenticated') return;
        if (isAdmin) {
            setCheckingApplication(false);
            setApplicationStatus(null);
            return;
        }
        if (!isActiveBrand) {
            setCheckingApplication(false);
            return;
        }

        let isMounted = true;
        fetch('/api/v1/brand/application-status')
            .then((res) => res.json())
            .then((res) => {
                if (!isMounted) return;
                if (res.success && res.data?.hasApplication) {
                    const s = res.data.status as string;
                    if (s === 'pending' || s === 'rejected') {
                        setApplicationStatus(s);
                        setApplicationBrandName(res.data.brandName ?? null);
                    } else {
                        setApplicationStatus(null);
                    }
                } else {
                    setApplicationStatus(null);
                }
            })
            .catch((err) => {
                console.error('Failed to check brand application status:', err);
            })
            .finally(() => {
                if (isMounted) setCheckingApplication(false);
            });

        return () => {
            isMounted = false;
        };
    }, [status, isAdmin, isActiveBrand]);

    React.useEffect(() => {
        if (status !== 'authenticated' || isAdmin || isActiveBrand) return;
        if (!activeAccountType) return;
        router.replace(defaultPortalPath(activeAccountType));
    }, [status, isAdmin, isActiveBrand, activeAccountType, router]);

    const handleExitAdminView = async () => {
        await fetch('/api/v1/admin/impersonate/brand', { method: 'DELETE' });
        router.push('/admin/brands');
    };

    // Only gate on the genuine initial load (no session yet). A background
    // session revalidation (window-focus refetch) flips `status` to 'loading'
    // while `session` stays populated; gating on bare 'loading' would unmount
    // the children subtree and close any open modal mid-edit. See vendor layout.
    if ((status === 'loading' && !session) || (status === 'authenticated' && isActiveBrand && !isAdmin && checkingApplication)) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#F8F9FB]">
                <Loader2 className="animate-spin text-[#53B175]" size={40} />
            </div>
        );
    }

    if (status === 'unauthenticated') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8F9FB] gap-4">
                <ShieldAlert size={48} className="text-[#E74C3C]" />
                <h1 className="text-[24px] font-bold text-[#181725]">Brand Access Only</h1>
                <p className="text-[14px] text-[#7C7C7C]">You need to sign in to access the brand portal.</p>
                <button
                    onClick={() => router.push('/login')}
                    className="mt-4 px-6 py-3 bg-[#53B175] text-white rounded-[10px] font-bold hover:bg-[#3d9e41] transition-colors"
                >
                    Sign In
                </button>
            </div>
        );
    }

    if (!isAdmin && !isActiveBrand) {
        return (
            <div className="flex items-center justify-center min-h-[50vh] bg-[#F8F9FB]">
                <Loader2 className="animate-spin text-[#53B175]" size={36} />
            </div>
        );
    }

    if (applicationStatus === 'pending' || applicationStatus === 'rejected') {
        const isPending = applicationStatus === 'pending';
        return (
            <div className="flex flex-col min-h-screen bg-[#F8F9FB]">
                <header className="h-[70px] bg-white border-b border-[#EEEEEE] flex items-center px-6 shrink-0 justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#53B175] rounded-[10px] flex items-center justify-center shrink-0">
                            <Package size={18} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-[17px] font-extrabold leading-tight text-[#181725]">Brand Portal</h1>
                            <p className="text-[10px] text-[#AEAEAE] font-semibold uppercase tracking-wide -mt-0.5">HoReCa Hub</p>
                        </div>
                    </div>
                    <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="flex items-center gap-2 px-4 py-2 text-[14px] font-semibold text-[#7C7C7C] hover:text-[#E74C3C] border border-[#EEEEEE] hover:border-[#E74C3C]/20 rounded-[10px] bg-white hover:bg-[#FFF5F5] transition-all"
                    >
                        <LogOut size={16} />
                        Sign Out
                    </button>
                </header>

                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="bg-white border border-[#EEEEEE] rounded-[24px] p-10 max-w-[500px] w-full text-center shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
                        <div className={cn(
                            'w-[80px] h-[80px] rounded-full flex items-center justify-center mx-auto mb-6',
                            isPending ? 'bg-[#FFF5E6] text-[#F39C12] animate-pulse' : 'bg-[#FEF2F2] text-[#E74C3C]',
                        )}>
                            {isPending ? <Clock size={40} className="stroke-[2.5]" /> : <XCircle size={40} className="stroke-[2.5]" />}
                        </div>

                        <h2 className="text-[24px] font-bold text-[#181725] mb-3">
                            {isPending ? 'Application Under Review' : 'Application Not Approved'}
                        </h2>

                        <p className="text-[14px] text-[#7C7C7C] leading-relaxed mb-8">
                            {isPending ? (
                                <>
                                    Thank you for partnering with <span className="font-semibold text-[#181725]">Horeca1</span>.
                                    Your brand application for{' '}
                                    <span className="font-semibold text-[#53B175]">
                                        {applicationBrandName || 'your brand'}
                                    </span>{' '}
                                    is currently being verified by our onboarding team.
                                </>
                            ) : (
                                <>
                                    Your brand application for{' '}
                                    <span className="font-semibold text-[#181725]">
                                        {applicationBrandName || 'your brand'}
                                    </span>{' '}
                                    was not approved. Please contact our support team if you believe this is an error.
                                </>
                            )}
                        </p>

                        {isPending && (
                            <div className="bg-[#F8F9FB] rounded-[16px] p-5 mb-8 border border-[#EEEEEE] text-left">
                                <h4 className="text-[12px] font-bold text-[#181725] uppercase tracking-wider mb-2">What happens next?</h4>
                                <ul className="text-[13px] text-[#7C7C7C] space-y-2.5">
                                    <li className="flex items-start gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#F39C12] mt-1.5 shrink-0" />
                                        <span>We are reviewing your brand profile and documentation.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#F39C12] mt-1.5 shrink-0" />
                                        <span>Once approved, you will receive an email notification.</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#F39C12] mt-1.5 shrink-0" />
                                        <span>Upon approval, full brand portal access will be unlocked instantly.</span>
                                    </li>
                                </ul>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                onClick={() => router.push('/')}
                                className="px-6 py-3 bg-[#53B175] hover:bg-[#3d9e41] text-white font-bold text-[14px] rounded-[12px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#53B175]/10"
                            >
                                <Home size={18} />
                                Go to Homepage
                            </button>
                            {isPending && (
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-6 py-3 bg-white hover:bg-[#F8F9FB] text-[#181725] font-bold text-[14px] border border-[#EEEEEE] rounded-[12px] transition-all"
                                >
                                    Refresh Status
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#F8F9FB]">
            {/* Top Header */}
            <header className="h-[70px] bg-white border-b border-[#EEEEEE] flex items-center px-6 sticky top-0 z-50 shrink-0">
                <div className={cn(
                    'shrink-0 flex items-center gap-3 transition-all duration-300',
                    isCollapsed ? 'w-[52px]' : 'w-[210px]'
                )}>
                    <Link href="/brand/portal" className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-9 h-9 bg-[#53B175] rounded-[10px] flex items-center justify-center shrink-0">
                            <Package size={18} className="text-white" />
                        </div>
                        {!isCollapsed && (
                            <div className="whitespace-nowrap">
                                <h1 className="text-[17px] font-extrabold leading-tight text-[#181725]">Brand Portal</h1>
                                <p className="text-[10px] text-[#AEAEAE] font-semibold uppercase tracking-wide -mt-0.5">HoReCa Hub</p>
                            </div>
                        )}
                    </Link>
                </div>

                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="ml-3 p-2 hover:bg-gray-100 rounded-lg transition-colors text-[#181725]"
                >
                    <Menu size={20} />
                </button>

                <div className="flex-1" />

                <div className="flex items-center gap-3 shrink-0">
                    <NotificationBell accentColor="#53B175" />
                    <BusinessAccountSwitcherDropdown />
                </div>
            </header>

            <div className="flex flex-1">
                {/* Sidebar */}
                <aside className={cn(
                    'bg-white border-r border-[#EEEEEE] flex flex-col shrink-0 sticky top-[70px] h-[calc(100vh-70px)] overflow-y-auto transition-all duration-300 z-40',
                    isCollapsed ? 'w-[72px]' : 'w-[220px]'
                )}>
                    <nav className="flex-1 px-3 py-5 space-y-1">
                        {/* Admin View Indicator */}
                        {adminBrandName && (
                            <div className={cn(
                                'mb-3 bg-amber-50 border border-amber-200 rounded-[10px] overflow-hidden',
                                isCollapsed ? 'flex justify-center py-2' : 'p-3'
                            )}>
                                {isCollapsed ? (
                                    <Eye size={18} className="text-amber-500" />
                                ) : (
                                    <>
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <Eye size={13} className="text-amber-500 shrink-0" />
                                            <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wide">Admin View</span>
                                        </div>
                                        <p className="text-[12px] font-semibold text-amber-800 truncate mb-2">{adminBrandName}</p>
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
                        {visibleLinks.map((link) => {
                            const isActive = link.href === '/brand/portal'
                                ? pathname === '/brand/portal'
                                : pathname.startsWith(link.href);
                            return (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    title={isCollapsed ? link.name : ''}
                                    className={cn(
                                        'flex items-center rounded-[10px] transition-all text-[14px] overflow-hidden leading-none',
                                        isCollapsed ? 'justify-center h-[46px] px-0' : 'gap-3 px-4 py-3',
                                        isActive
                                            ? 'bg-[#53B175] text-white shadow-md shadow-[#53B175]/20'
                                            : 'text-[#191919] hover:bg-[#F8F9FB]'
                                    )}
                                >
                                    <link.icon size={20} className={cn('shrink-0', isActive ? 'text-white' : 'text-[#555]')} />
                                    {!isCollapsed && <span className="font-semibold whitespace-nowrap">{link.name}</span>}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="px-3 pb-3 space-y-1">
                        <Link
                            href="/"
                            title={isCollapsed ? 'View Storefront' : ''}
                            className={cn(
                                'flex items-center rounded-[10px] transition-all text-[14px] overflow-hidden leading-none text-[#53B175] hover:bg-[#EEF8F1] font-semibold',
                                isCollapsed ? 'justify-center h-[46px] px-0' : 'gap-3 px-4 py-3'
                            )}
                        >
                            <Home size={20} className="shrink-0" />
                            {!isCollapsed && <span className="whitespace-nowrap">View Storefront</span>}
                        </Link>
                        <button
                            onClick={() => signOut({ callbackUrl: '/' })}
                            title={isCollapsed ? 'Sign Out' : ''}
                            className={cn(
                                'w-full flex items-center rounded-[10px] transition-all text-[14px] overflow-hidden leading-none text-[#E74C3C] hover:bg-[#FEF2F2] font-semibold',
                                isCollapsed ? 'justify-center h-[46px] px-0' : 'gap-3 px-4 py-3'
                            )}
                        >
                            <LogOut size={20} className="shrink-0" />
                            {!isCollapsed && <span className="whitespace-nowrap">Sign Out</span>}
                        </button>
                    </div>

                    <div className="p-3 border-t border-[#EEEEEE] flex justify-center">
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="w-full flex items-center justify-center p-2 hover:bg-gray-50 rounded-lg transition-colors text-[#AEAEAE] hover:text-[#181725]"
                        >
                            {isCollapsed
                                ? <ChevronRight size={18} />
                                : <div className="flex items-center gap-2"><ChevronLeft size={18} /><span className="text-[12px] font-medium">Collapse</span></div>
                            }
                        </button>
                    </div>
                </aside>

                <main className="flex-1 min-w-0 p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
