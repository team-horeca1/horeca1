'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
    Search,
    ShoppingCart,
    User,
    X,
    Home as HomeIcon,
    Store,
    ClipboardList,
    LayoutDashboard,
    Gift,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isVendorPortalPath } from '@/lib/vendorPortalPaths';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileSearchOverlay } from './MobileSearchOverlay';
import { LocationSelectionOverlay } from './LocationSelectionOverlay';
import { useSession } from 'next-auth/react';
import { useCart } from '@/context/CartContext';
import { useAddress } from '@/context/AddressContext';
import { InitialPincodeOverlay } from './InitialPincodeOverlay';
import { PushBell } from '../features/PushBell';
import { NotificationBell } from '../features/NotificationBell';
import { dal } from '@/lib/dal';
import type { Category } from '@/types';
import { NavDeliverySelector } from './NavDeliverySelector';
import { isAdminCustomerImpersonationActive, isAnyAdminImpersonationActive } from '@/lib/clearImpersonation';

const CATEGORY_STYLE: Record<string, { image: string; bgColor: string }> = {
    'vegetables': { image: '/images/category/vegitable.png', bgColor: '#e8f9e9' },
    'fruits': { image: '/images/category/fruits.png', bgColor: '#f0fdf4' },
    'dairy-eggs': { image: '/images/category/milk.png', bgColor: '#eef2ff' },
    'spices-masala': { image: '/images/category/candy.png', bgColor: '#eff6ff' },
    'grains-pulses': { image: '/images/category/snacks.png', bgColor: '#f5f3ff' },
    'meat-poultry': { image: '/images/category/fish & meat.png', bgColor: '#fffbeb' },
    'seafood': { image: '/images/category/fish & meat.png', bgColor: '#fff7ed' },
    'beverages': { image: '/images/category/drink-juice.png', bgColor: '#ecfdf5' },
    'oils-ghee': { image: '/images/category/fruits.png', bgColor: '#f0fdf4' },
    'packaging-supplies': { image: '/images/category/vegitable.png', bgColor: '#f8fafc' },
};
const DEFAULT_STYLE = { image: '/images/category/vegitable.png', bgColor: '#f7f8fa' };

const DESKTOP_NAV = [
    { name: 'Home', href: '/', Icon: HomeIcon },
    { name: 'Vendors', href: '/vendors', Icon: Store },
    { name: 'Lists', href: '/order-lists', Icon: ClipboardList },
];

interface NavbarSearchBarProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
}

const NavbarSearchBar = React.memo(function NavbarSearchBar({
    value,
    onChange,
    onSubmit,
}: NavbarSearchBarProps) {
    return (
        <div className="flex flex-1 items-center min-w-0">
            <div className="flex items-center gap-2 pl-5 pr-2 py-2.5 bg-gray-50 border-2 border-gray-100 rounded-full w-full focus-within:border-primary/50 focus-within:bg-white transition-all duration-300 shadow-sm">
                <Search size={17} className="text-gray-400 shrink-0" />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && value.trim()) onSubmit();
                    }}
                    placeholder="Search for a product or brand..."
                    className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-gray-400 min-w-0"
                />
                <button
                    type="button"
                    onClick={onSubmit}
                    className="bg-primary hover:bg-primary-dark px-5 py-2 rounded-full text-white font-bold text-[13px] transition-all shadow-sm cursor-pointer shrink-0"
                >
                    Search
                </button>
            </div>
        </div>
    );
});

export function Navbar() {
    const router = useRouter();
    const pathname = usePathname();
    const [isCategoriesSidebarOpen, setIsCategoriesSidebarOpen] = React.useState(false);
    const [isCategoriesExpanded, setIsCategoriesExpanded] = React.useState(false);
    const [isSearchOverlayOpen, setIsSearchOverlayOpen] = React.useState(false);
    const [isLocationOverlayOpen, setIsLocationOverlayOpen] = React.useState(false);
    const { data: session, status: sessionStatus } = useSession();
    const sessionReady = sessionStatus !== 'loading';
    const isLoggedIn = sessionStatus === 'authenticated';
    const userRole = (session?.user as { role?: string })?.role;
    const activeAccountType = (session?.user as {
        activeBusinessAccountType?: { isVendor: boolean; isBrand: boolean };
    } | undefined)?.activeBusinessAccountType;

    const [isScrolled, setIsScrolled] = React.useState(false);

    React.useEffect(() => {
        const handleScroll = () => setIsScrolled(window.scrollY > 10);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const [searchTab, setSearchTab] = React.useState<'items' | 'stores'>('stores');
    const [isNavSearchFocused, setIsNavSearchFocused] = React.useState(false);
    const [navSearchQuery, setNavSearchQuery] = React.useState('');
    const { totalItems } = useCart();
    const { selectedAddress, setSelectedAddress } = useAddress();

    const [apiCategories, setApiCategories] = React.useState<(Category & { image: string; bgColor: string })[]>([]);
    const [isAdminImpersonating, setIsAdminImpersonating] = React.useState(false);
    const [isCustomerImpersonating, setIsCustomerImpersonating] = React.useState(false);
    const [vendorAppApproved, setVendorAppApproved] = React.useState(false);

    React.useEffect(() => {
        setIsAdminImpersonating(isAnyAdminImpersonationActive());
        setIsCustomerImpersonating(isAdminCustomerImpersonationActive());
    }, [pathname, sessionStatus]);

    React.useEffect(() => {
        if (sessionStatus !== 'authenticated') {
            setVendorAppApproved(false);
            return;
        }
        let cancelled = false;
        fetch('/api/v1/vendor/application-status', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
                if (cancelled || !json?.success) return;
                setVendorAppApproved(json.data?.status === 'approved');
            })
            .catch(() => {
                if (!cancelled) setVendorAppApproved(false);
            });
        return () => { cancelled = true; };
    }, [sessionStatus, pathname]);

    React.useEffect(() => {
        dal.categories.list().then((cats) => {
            setApiCategories(cats.map(c => ({
                ...c,
                image: c.image || CATEGORY_STYLE[c.slug]?.image || DEFAULT_STYLE.image,
                bgColor: CATEGORY_STYLE[c.slug]?.bgColor || DEFAULT_STYLE.bgColor,
            })));
        }).catch((err) => console.error('[Navbar] Failed to load categories:', err));
    }, []);

    const openSearch = React.useCallback((tab: 'items' | 'stores' | 'vendors' = 'vendors', initialQuery = '') => {
        setSearchTab(tab === 'vendors' ? 'stores' : tab as 'items' | 'stores');
        setNavSearchQuery(initialQuery);
        setIsSearchOverlayOpen(true);
    }, []);

    const submitDesktopSearch = React.useCallback(() => {
        if (navSearchQuery.trim()) openSearch('items', navSearchQuery);
    }, [navSearchQuery, openSearch]);

    const isShipmentPage = pathname?.includes('/cart/shipment/');
    const isAdminPage = pathname?.startsWith('/admin');
    const isVendorDashboard = isVendorPortalPath(pathname);
    const isBrandPortal = pathname?.startsWith('/brand/portal');
    const isAccountPage = pathname?.startsWith('/account');
    const isDeliveryBoyLink = pathname?.startsWith('/d/');

    const availableAccounts = (session?.user as {
        availableAccounts?: Array<{ isVendor?: boolean; isBrand?: boolean }>;
    } | undefined)?.availableAccounts;
    const hasVendorAccount =
        activeAccountType?.isVendor === true
        || userRole === 'vendor'
        || (availableAccounts?.some((a) => a.isVendor === true) ?? false);
    const hasBrandAccount =
        activeAccountType?.isBrand === true
        || userRole === 'brand'
        || (availableAccounts?.some((a) => a.isBrand === true) ?? false);

    // Simple portal links: Admin → Admin Dashboard, vendor/brand membership → their portal.
    // Only hide Admin Dashboard while actively viewing-as-customer.
    const desktopNavItems = React.useMemo(() => {
        if (!sessionReady) return DESKTOP_NAV;

        const portalLinks: typeof DESKTOP_NAV = [];
        if (isLoggedIn) {
            if (userRole === 'admin' && !isCustomerImpersonating) {
                portalLinks.push({ name: 'Dashboard', href: '/admin/dashboard', Icon: LayoutDashboard });
            } else if (!isAdminImpersonating && hasVendorAccount && vendorAppApproved) {
                portalLinks.push({ name: 'Dashboard', href: '/vendor/dashboard', Icon: LayoutDashboard });
            } else if (!isAdminImpersonating && hasBrandAccount) {
                portalLinks.push({ name: 'Brand Portal', href: '/brand/portal', Icon: LayoutDashboard });
            }
        }

        return [
            ...portalLinks,
            ...DESKTOP_NAV,
            ...(isLoggedIn ? [{ name: 'Rewards', href: '/rewards', Icon: Gift }] : []),
        ];
    }, [sessionReady, isLoggedIn, hasVendorAccount, hasBrandAccount, vendorAppApproved, userRole, isAdminImpersonating, isCustomerImpersonating]);

    if (
        isAdminPage ||
        isVendorDashboard ||
        isBrandPortal ||
        isShipmentPage ||
        isAccountPage ||
        isDeliveryBoyLink
    ) {
        return null;
    }

    return (
        <>
            <React.Suspense fallback={null}>
                <SearchURLSync openSearch={openSearch} />
            </React.Suspense>
            {pathname === '/' && (
                <InitialPincodeOverlay
                    onComplete={(pincode) => {
                        // The overlay itself sets the accurate selected address for
                        // every path (business pick, GPS, or geocoded pincode). Here we
                        // only handle "skip" — clearing any stale location selection.
                        if (!pincode) {
                            localStorage.removeItem('user_pincode');
                            setSelectedAddress(null);
                        }
                    }}
                />
            )}

            {/* ── Mobile Header ── */}
            <header className="md:hidden w-full bg-white relative z-[10000] sticky top-0 border-b border-gray-100">
                <div className="w-full py-3 px-4 space-y-3">
                    {/* Row 1: Logo | Location | Notifications | Cart */}
                    <div className="flex items-center justify-between px-1">
                        <Link href="/" className="flex items-center">
                            <Image
                                src="/horeca1_logo.jpg"
                                alt="Horeca1"
                                width={40}
                                height={40}
                                className="h-[40px] w-[40px] object-contain rounded-lg"
                                priority
                            />
                        </Link>

                        <NavDeliverySelector
                            variant="mobile"
                            fallbackLabel={selectedAddress?.shortAddress || 'Select Location'}
                            onFallbackClick={() => setIsLocationOverlayOpen(true)}
                        />

                        <div className="flex items-center gap-2">
                            {isLoggedIn && <NotificationBell accentColor="#53B175" />}
                            <PushBell />
                            <Link href="/cart" className="relative p-1 cursor-pointer">
                                <ShoppingCart size={20} className="text-[#181725]" />
                                <span className="absolute -top-1 -right-1 bg-[#53B175] text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold border border-white">
                                    {totalItems}
                                </span>
                            </Link>
                        </div>
                    </div>

                    {/* Row 2: Search Bar — always visible (universal escape hatch) */}
                    <div className="px-1">
                        <div
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 bg-[#F7F7F7] border rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all duration-300",
                                isNavSearchFocused ? "border-[#53B175] bg-white ring-1 ring-[#53B175]/10" : "border-gray-100"
                            )}
                        >
                            <Search size={20} className={cn("transition-colors", isNavSearchFocused ? "text-[#53B175]" : "text-gray-400")} />
                            <input
                                type="text"
                                placeholder="search for product or brand, store..."
                                className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-gray-400 font-medium"
                                onFocus={() => setIsNavSearchFocused(true)}
                                onBlur={() => setIsNavSearchFocused(false)}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val.length > 0) {
                                        openSearch('items', val);
                                        e.target.value = '';
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            </header>

            {/* ── Desktop Navbar — single sticky row, no green bar ── */}
            <div className={cn(
                "hidden md:block sticky top-0 z-[10000] bg-white border-b border-gray-100 transition-shadow duration-300",
                isScrolled && "shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
            )}>
                <nav className="w-full">
                    <div className="w-full max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                        <div className="flex items-center gap-4 lg:gap-6 py-4">

                            {/* Logo */}
                            <Link href="/" className="shrink-0">
                                <Image
                                    src="/Horeca1.png"
                                    alt="Horeca1"
                                    width={100}
                                    height={26}
                                    className="h-[26px] w-auto object-contain"
                                    style={{ width: 'auto', height: 'auto' }}
                                    priority
                                />
                            </Link>

                            {/* Search Bar — flex-1, fills available space. Always visible. */}
                            <NavbarSearchBar
                                value={navSearchQuery}
                                onChange={setNavSearchQuery}
                                onSubmit={submitDesktopSearch}
                            />

                            {/* Deliver to — account + outlet selector for logged-in users */}
                            <NavDeliverySelector
                                variant="desktop"
                                fallbackLabel={selectedAddress?.shortAddress || 'Select Location'}
                                onFallbackClick={() => setIsLocationOverlayOpen(true)}
                            />

                            {/* Divider */}
                            <div className="h-9 w-px bg-gray-200 shrink-0" />

                            {/* Iconized nav — shrink-0 so Dashboard never clips; search yields space */}
                            <div className="flex items-center gap-1 shrink-0">
                                {desktopNavItems.map(({ name, href, Icon }) => {
                                    const isActive = pathname === href;
                                    return (
                                        <Link
                                            key={name}
                                            href={href}
                                            className={cn(
                                                "flex flex-col items-center gap-[3px] px-3 py-1.5 rounded-xl transition-colors shrink-0",
                                                isActive ? "text-primary bg-primary/5" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                            )}
                                        >
                                            <Icon size={21} strokeWidth={isActive ? 2 : 1.5} />
                                            <span className="text-[10px] font-medium leading-none">{name}</span>
                                        </Link>
                                    );
                                })}
                            </div>

                            {/* Divider */}
                            <div className="h-9 w-px bg-gray-200 shrink-0" />

                            {/* Cart + User */}
                            <div className="flex items-center gap-1 shrink-0">
                                {isLoggedIn && <NotificationBell accentColor="#53B175" />}
                                <Link href="/cart" className="p-2.5 hover:bg-gray-50 rounded-full transition-all relative group cursor-pointer">
                                    <ShoppingCart size={22} strokeWidth={1.5} className="text-text group-hover:text-primary transition-colors" />
                                    <span className="absolute top-0.5 right-0.5 bg-primary text-white text-[10px] w-[18px] h-[18px] flex items-center justify-center rounded-full font-bold border-2 border-white">
                                        {totalItems}
                                    </span>
                                </Link>
                                <button
                                    onClick={() => {
                                        if (isLoggedIn) router.push('/profile');
                                        else router.push('/login');
                                    }}
                                    className="p-2.5 hover:bg-gray-50 rounded-full transition-all group cursor-pointer"
                                >
                                    <User size={22} strokeWidth={1.5} className="text-text group-hover:text-primary transition-colors" />
                                </button>
                            </div>
                        </div>
                    </div>
                </nav>
            </div>

            {/* Mobile — Categories Bottom Sheet */}
            <div
                className={cn(
                    "fixed inset-0 z-[10000] bg-black/40 transition-opacity duration-300 md:hidden",
                    isCategoriesSidebarOpen ? "opacity-100 visible" : "opacity-0 invisible"
                )}
                onClick={() => {
                    setIsCategoriesSidebarOpen(false);
                    setIsCategoriesExpanded(false);
                }}
            >
                <div
                    className={cn(
                        "fixed bottom-0 left-0 right-0 bg-white rounded-t-[30px] transition-transform duration-500 ease-out p-6 max-h-[85vh] overflow-y-auto pb-[90px]",
                        isCategoriesSidebarOpen ? "translate-y-0" : "translate-y-full"
                    )}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
                    <div className="flex justify-end mb-2">
                        <button
                            onClick={() => {
                                setIsCategoriesSidebarOpen(false);
                                setIsCategoriesExpanded(false);
                            }}
                            className="p-1 cursor-pointer"
                        >
                            <X size={20} className="text-gray-400" />
                        </button>
                    </div>
                    <div className="flex items-center justify-between mb-6 px-1">
                        <h2 className="text-[17px] font-black text-[#181725]">Shop By Category</h2>
                        <button
                            onClick={() => setIsCategoriesExpanded(!isCategoriesExpanded)}
                            className="text-[#53B175] text-[14px] font-bold cursor-pointer"
                        >
                            {isCategoriesExpanded ? 'Collapse' : 'See All'}
                        </button>
                    </div>
                    <div className="grid grid-cols-4 gap-y-6 gap-x-3">
                        {(isCategoriesExpanded ? apiCategories : apiCategories.slice(0, 8)).map((item) => (
                            <Link
                                key={item.id}
                                href={`/category/${item.slug}`}
                                className="flex flex-col items-center gap-2 group"
                                onClick={() => {
                                    setIsCategoriesSidebarOpen(false);
                                    setIsCategoriesExpanded(false);
                                }}
                            >
                                <div
                                    className="w-full aspect-square rounded-[18px] flex items-center justify-center p-2 transition-transform active:scale-95 shadow-sm border border-gray-50 overflow-hidden"
                                    style={{ backgroundColor: item.bgColor || '#F7F8FA', aspectRatio: '1 / 1' }}
                                >
                                    <div className="relative w-[75%] h-[75%]">
                                        <Image src={item.image} alt={item.name} fill className="object-contain" />
                                    </div>
                                </div>
                                <span className="text-[10px] font-extrabold text-center text-[#181725] leading-tight px-0.5 line-clamp-2">
                                    {item.name}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>

            <MobileBottomNav
                isCategoriesOpen={isCategoriesSidebarOpen}
                onCategoriesClick={() => setIsCategoriesSidebarOpen(true)}
                onStoreClick={() => openSearch('stores')}
                onAccountClick={() => {
                    if (isLoggedIn) router.push('/profile');
                    else router.push('/login');
                }}
            />
            <MobileSearchOverlay
                isOpen={isSearchOverlayOpen}
                onClose={() => {
                    setIsSearchOverlayOpen(false);
                    setNavSearchQuery('');
                }}
                initialTab={searchTab}
                initialQuery={navSearchQuery}
            />
            <LocationSelectionOverlay
                isOpen={isLocationOverlayOpen}
                onClose={() => setIsLocationOverlayOpen(false)}
            />
        </>
    );
}

const SearchURLSync = ({
    openSearch,
}: {
    openSearch: (tab?: 'items' | 'stores' | 'vendors', initialQuery?: string) => void;
}) => {
    const searchParams = useSearchParams();
    const router = useRouter();

    React.useEffect(() => {
        if (!searchParams) return;
        const searchOpen = searchParams.get('searchOpen');
        const q = searchParams.get('q');
        const tab = searchParams.get('tab');

        if (searchOpen === 'true') {
            openSearch(tab as 'items' | 'stores' | 'vendors' || 'items', q || '');
            const url = new URL(window.location.href);
            url.searchParams.delete('searchOpen');
            url.searchParams.delete('q');
            url.searchParams.delete('tab');
            router.replace(url.pathname + url.search, { scroll: false });
        }
    }, [searchParams, router, openSearch]);

    return null;
};

