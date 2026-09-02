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
    Wallet,
    CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isVendorPortalPath } from '@/lib/vendorPortalPaths';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileSearchOverlay } from './MobileSearchOverlay';
import { LocationSelectionOverlay } from './LocationSelectionOverlay';
import { useStableSession } from '@/hooks/useStableSession';
import { useCart } from '@/context/CartContext';
import { useAddress } from '@/context/AddressContext';
import { InitialPincodeOverlay } from './InitialPincodeOverlay';
import { PushBell } from '../features/PushBell';
import { NotificationBell } from '../features/NotificationBell';
import { dalClient as dal } from '@/lib/dalClient';
import type { Category } from '@/types';
import { NavDeliverySelector } from './NavDeliverySelector';
import { OutletContextStrip } from './OutletContextStrip';
import { isAdminCustomerImpersonationActive, isAnyAdminImpersonationActive, readImpersonationMode, type ImpersonationMode } from '@/lib/clearImpersonation';
import { resolvePortalNav, type InitialNav } from '@/lib/navChrome';

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

type NavStyledCategory = Category & { image: string; bgColor: string };

/** Module-level cache so remounting Navbar does not flash an empty category sheet. */
let navCategoriesCache: NavStyledCategory[] | null = null;

const NAV_CATEGORIES_SS_KEY = 'h1_nav_categories';

function readCachedNavCategories(): NavStyledCategory[] {
    if (navCategoriesCache) return navCategoriesCache;
    if (typeof window === 'undefined') return [];
    try {
        const raw = sessionStorage.getItem(NAV_CATEGORIES_SS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as NavStyledCategory[];
        if (Array.isArray(parsed) && parsed.length > 0) {
            navCategoriesCache = parsed;
            return parsed;
        }
    } catch {
        /* ignore corrupt cache */
    }
    return [];
}

function writeCachedNavCategories(cats: NavStyledCategory[]) {
    navCategoriesCache = cats;
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(NAV_CATEGORIES_SS_KEY, JSON.stringify(cats));
    } catch {
        /* quota / private mode */
    }
}

function styleCategories(cats: Category[]): NavStyledCategory[] {
    return cats.map((c) => ({
        ...c,
        image: c.image || CATEGORY_STYLE[c.slug]?.image || DEFAULT_STYLE.image,
        bgColor: CATEGORY_STYLE[c.slug]?.bgColor || DEFAULT_STYLE.bgColor,
    }));
}

/** Shimmer placeholder matching a desktop icon+label nav item — used only while session is unresolved. */
function DesktopNavSlotPlaceholder() {
    return (
        <div
            className="flex flex-col items-center gap-[3px] px-3 py-1.5 rounded-xl shrink-0 animate-pulse"
            aria-hidden
        >
            <div className="w-[21px] h-[21px] rounded-md bg-gray-200" />
            <div className="h-[10px] w-10 rounded bg-gray-200" />
        </div>
    );
}

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

export function Navbar({ initialNav }: { initialNav?: InitialNav }) {
    const router = useRouter();
    const pathname = usePathname();
    const [isCategoriesSidebarOpen, setIsCategoriesSidebarOpen] = React.useState(false);
    const [isCategoriesExpanded, setIsCategoriesExpanded] = React.useState(false);
    const [isSearchOverlayOpen, setIsSearchOverlayOpen] = React.useState(false);
    const [isLocationOverlayOpen, setIsLocationOverlayOpen] = React.useState(false);
    const { session, isAuthenticated, isResolved } = useStableSession();
    const isLoggedIn = isAuthenticated;
    const userRole = session?.user?.role;
    const activeAccountType = session?.user?.activeBusinessAccountType;

    const [isScrolled, setIsScrolled] = React.useState(false);

    React.useEffect(() => {
        const handleScroll = () => setIsScrolled(window.scrollY > 10);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const [searchTab, setSearchTab] = React.useState<'items' | 'stores'>('stores');
    const [isNavSearchFocused, setIsNavSearchFocused] = React.useState(false);
    const [navSearchQuery, setNavSearchQuery] = React.useState('');
    const { totalItems, isCartLoading } = useCart();
    const [lastKnownTotalItems, setLastKnownTotalItems] = React.useState(totalItems);
    if (!isCartLoading && lastKnownTotalItems !== totalItems) {
        setLastKnownTotalItems(totalItems);
    }
    const badgeCount = isCartLoading ? lastKnownTotalItems : totalItems;
    const { selectedAddress, setSelectedAddress } = useAddress();

    const [apiCategories, setApiCategories] = React.useState<NavStyledCategory[]>([]);
    const [isAdminImpersonating, setIsAdminImpersonating] = React.useState(
        () => initialNav?.isAdminImpersonating ?? false,
    );
    const [isCustomerImpersonating, setIsCustomerImpersonating] = React.useState(
        () => initialNav?.isCustomerImpersonating ?? false,
    );
    const [impersonationMode, setImpersonationMode] = React.useState<ImpersonationMode | null>(
        () => initialNav?.impersonationMode ?? null,
    );
    const [vendorAppApproved, setVendorAppApproved] = React.useState(
        () => initialNav?.vendorAppApproved ?? false,
    );

    React.useEffect(() => {
        setIsAdminImpersonating(isAnyAdminImpersonationActive());
        setIsCustomerImpersonating(isAdminCustomerImpersonationActive());
        setImpersonationMode(readImpersonationMode());
    }, [pathname, isLoggedIn]);

    React.useEffect(() => {
        if (!isLoggedIn) {
            if (!initialNav?.vendorAppApproved) setVendorAppApproved(false);
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
    }, [isLoggedIn, pathname, initialNav?.vendorAppApproved]);

    React.useEffect(() => {
        // Seed from cache; still refresh in background so style/slug changes land.
        const cached = readCachedNavCategories();
        if (cached.length > 0) setApiCategories(cached);

        dal.categories.list().then((cats) => {
            const styled = styleCategories(cats);
            writeCachedNavCategories(styled);
            setApiCategories(styled);
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
    const isReturnPickupLink = pathname?.startsWith('/r/');
    const isPayoutLink = pathname?.startsWith('/payout/');

    const availableAccounts = session?.user?.availableAccounts;
    const hasVendorAccount =
        activeAccountType?.isVendor === true
        || userRole === 'vendor'
        || (availableAccounts?.some((a) => a.isVendor === true) ?? false);
    const hasBrandAccount =
        activeAccountType?.isBrand === true
        || userRole === 'brand'
        || (availableAccounts?.some((a) => a.isBrand === true) ?? false);

    const livePortalItem = React.useMemo(
        () => resolvePortalNav({
            isLoggedIn,
            userRole,
            impersonationMode,
            isCustomerImpersonating,
            isAdminImpersonating,
            hasVendorAccount,
            vendorAppApproved,
            hasBrandAccount,
        }),
        [isLoggedIn, hasVendorAccount, hasBrandAccount, vendorAppApproved, userRole, isAdminImpersonating, isCustomerImpersonating, impersonationMode],
    );

    const seededFallback = !isResolved && Boolean(initialNav);
    const portalNavItem = seededFallback ? (initialNav?.portal ?? null) : livePortalItem;
    const showRewardsLink = seededFallback ? Boolean(initialNav?.showWallet) : isLoggedIn;
    const reserveAuthSlots = !isResolved && !initialNav;

    if (
        isAdminPage ||
        isVendorDashboard ||
        isBrandPortal ||
        isShipmentPage ||
        isAccountPage ||
        isDeliveryBoyLink ||
        isReturnPickupLink ||
        isPayoutLink
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
            <header className="lg:hidden w-full bg-white relative z-[10000] sticky top-0 border-b border-divider">
                <div className="w-full py-3 px-4">
                    {/* Row 1: Logo | Notifications | Cart */}
                    <div className="flex items-center justify-between">
                        <Link href="/" className="flex items-center shrink-0">
                            <Image
                                src="/Horeca1.png"
                                alt="Horeca1"
                                width={100}
                                height={26}
                                className="h-[24px] w-auto object-contain"
                                priority
                            />
                        </Link>

                        <div className="flex items-center gap-2">
                            {(isLoggedIn || reserveAuthSlots) && (
                                <div className="flex items-center justify-end shrink-0 h-9 min-w-[76px] gap-1">
                                    {isLoggedIn ? (
                                        <>
                                            <NotificationBell accentColor="#6B1D2E" />
                                            <PushBell />
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-6 h-6 rounded-full bg-gray-200 animate-pulse" aria-hidden />
                                            <div className="w-6 h-6 rounded-full bg-gray-200 animate-pulse" aria-hidden />
                                        </>
                                    )}
                                </div>
                            )}
                            <Link href="/cart" className="relative p-1.5 cursor-pointer hover:bg-ivory rounded-lg transition-colors" aria-label="Cart">
                                <ShoppingCart size={21} className="text-text" />
                                {badgeCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 bg-primary text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold border border-white">
                                        {badgeCount}
                                    </span>
                                )}
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            <OutletContextStrip
                className="lg:hidden sticky top-[calc(var(--mobile-header-offset,0px)+0px)] z-[9999]"
                onGuestLocationClick={() => setIsLocationOverlayOpen(true)}
                onLoggedInSwitchClick={() => setIsLocationOverlayOpen(true)}
            />

            {/* ── Desktop Navbar — single sticky row, no green bar ── */}
            <div className={cn(
                "hidden lg:block sticky top-0 z-[10000] bg-white border-b border-gray-100 transition-shadow duration-300",
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

                            {/* Iconized nav — shrink-0 so Dashboard never clips; search yields space.
                                Reserve portal + Rewards slots only when session is unresolved and SSR seed is missing. */}
                            <div className="flex items-center gap-1 shrink-0">
                                {reserveAuthSlots ? (
                                    <DesktopNavSlotPlaceholder />
                                ) : portalNavItem ? (
                                    <Link
                                        href={portalNavItem.href}
                                        className={cn(
                                            "flex flex-col items-center gap-[3px] px-3 py-1.5 rounded-xl transition-colors shrink-0",
                                            pathname === portalNavItem.href ? "text-primary bg-primary/5" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                        )}
                                    >
                                        <LayoutDashboard size={21} strokeWidth={pathname === portalNavItem.href ? 2 : 1.5} />
                                        <span className="text-[10px] font-medium leading-none">{portalNavItem.name}</span>
                                    </Link>
                                ) : null}
                                {DESKTOP_NAV.map(({ name, href, Icon }) => {
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
                                {reserveAuthSlots ? (
                                    <>
                                        <DesktopNavSlotPlaceholder />
                                        <DesktopNavSlotPlaceholder />
                                    </>
                                ) : showRewardsLink ? (
                                    <>
                                        <Link
                                            href="/rewards"
                                            className={cn(
                                                "flex flex-col items-center gap-[3px] px-3 py-1.5 rounded-xl transition-colors shrink-0",
                                                pathname === '/rewards' ? "text-primary bg-primary/5" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                            )}
                                        >
                                            <Wallet size={21} strokeWidth={pathname === '/rewards' ? 2 : 1.5} />
                                            <span className="text-[10px] font-medium leading-none">Wallet</span>
                                        </Link>
                                        <Link
                                            href="/wallet"
                                            className={cn(
                                                "flex flex-col items-center gap-[3px] px-3 py-1.5 rounded-xl transition-colors shrink-0",
                                                pathname?.startsWith('/wallet') ? "text-primary bg-primary/5" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                            )}
                                        >
                                            <CreditCard size={21} strokeWidth={pathname?.startsWith('/wallet') ? 2 : 1.5} />
                                            <span className="text-[10px] font-medium leading-none">DiSCCO</span>
                                        </Link>
                                    </>
                                ) : null}
                            </div>

                            {/* Divider */}
                            <div className="h-9 w-px bg-gray-200 shrink-0" />

                            {/* Cart + User */}
                            <div className="flex items-center gap-1 shrink-0">
                                {(isLoggedIn || reserveAuthSlots) && (
                                    <div className="flex items-center justify-center shrink-0 w-10 h-10">
                                        {isLoggedIn ? (
                                            <NotificationBell accentColor="#6B1D2E" />
                                        ) : (
                                            <div className="w-6 h-6 rounded-full bg-gray-200 animate-pulse" aria-hidden />
                                        )}
                                    </div>
                                )}
                                <Link href="/cart" className="p-2.5 hover:bg-gray-50 rounded-full transition-all relative group cursor-pointer">
                                    <ShoppingCart size={22} strokeWidth={1.5} className="text-text group-hover:text-primary transition-colors" />
                                    {badgeCount > 0 && (
                                        <span className="absolute top-0.5 right-0.5 bg-primary text-white text-[10px] w-[18px] h-[18px] flex items-center justify-center rounded-full font-bold border-2 border-white">
                                            {badgeCount}
                                        </span>
                                    )}
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
                    "fixed inset-0 z-[10000] bg-black/40 transition-opacity duration-300 lg:hidden",
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
                            className="text-primary text-[14px] font-bold cursor-pointer"
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
                onSearchClick={() => openSearch('items')}
                onBusinessSwitchClick={() => setIsLocationOverlayOpen(true)}
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

