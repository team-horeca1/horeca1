'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    ShoppingBag,
    HelpCircle,
    Pencil,
    RotateCcw,
    ListOrdered,
    Store,
    MapPin,
    CreditCard,
    Bell,
    Info,
    Settings,
    LogOut,
    Home,
    User,
    Users,
    Phone,
    Building2,
    BadgeCheck,
    Mail,
    LayoutDashboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { clearAllAdminImpersonation, isAdminCustomerImpersonationActive } from '@/lib/clearImpersonation';
import { clientLogout } from '@/lib/clientLogout';
import { ACCOUNTS_REFRESH_EVENT } from '@/lib/addressUsability';
import { usePermissions } from '@/hooks/usePermissions';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAddress } from '@/context/AddressContext';
import { EditProfileOverlay } from './EditProfileOverlay';
import { SavedAddressesOverlay } from './SavedAddressesOverlay';
import { PaymentManagementOverlay } from './PaymentManagementOverlay';
import { NotificationOverlay } from './NotificationOverlay';
import { GeneralInformationOverlay } from './GeneralInformationOverlay';
import { SettingsOverlay } from './SettingsOverlay';
import { BecomeVendorModal } from './BecomeVendorModal';
import { OutletsOverlay } from './OutletsOverlay';
import { TeamMembersOverlay } from './TeamMembersOverlay';
import { RolesPermissionsOverlay } from './RolesPermissionsOverlay';
import { AccountOverviewOverlay } from './AccountOverviewOverlay';
import { Sparkles } from 'lucide-react';

interface ProfileScreenProps {
    isOpen: boolean;
    onClose: () => void;
}

type LucideIcon = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

function DetailRow({ icon: Icon, label, value, sub, muted }: { icon: LucideIcon; label: string; value: string; sub?: string; muted?: boolean }) {
    return (
        <div className="flex items-center gap-4 px-5 py-3.5">
            <span className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                <Icon size={16} className="text-gray-500" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-[700] text-gray-400 uppercase tracking-wider">{label}</p>
                <p className={cn('text-[13.5px] font-[600] truncate mt-0.5', muted ? 'text-gray-400' : 'text-[#181725]')}>{value}</p>
                {sub && <p className="text-[11px] text-gray-400 font-medium mt-0.5 truncate">{sub}</p>}
            </div>
        </div>
    );
}

export function ProfileScreen({ isOpen, onClose }: ProfileScreenProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [isSavedAddressesOpen, setIsSavedAddressesOpen] = useState(false);
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [isGeneralInfoOpen, setIsGeneralInfoOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isBecomeVendorOpen, setIsBecomeVendorOpen] = useState(false);
    const [isOutletsOpen, setIsOutletsOpen] = useState(false);
    const [isTeamOpen, setIsTeamOpen] = useState(false);
    const [isRolesOpen, setIsRolesOpen] = useState(false);
    const [isOverviewOpen, setIsOverviewOpen] = useState(false);
    const [hasVendorApplication, setHasVendorApplication] = useState<boolean | null>(null);
    const [vendorAppApproved, setVendorAppApproved] = useState(false);
    const [creditSummary, setCreditSummary] = useState<{
        totalLimit: number;
        totalAvailable: number;
        totalOutstanding: number;
        hasOverdue: boolean;
        hasWallets: boolean;
        lineCount: number;
    } | null>(null);

    const { data: session, update: updateSession } = useSession();
    const { has, hasAny } = usePermissions();
    const {
        savedAddresses,
        selectedAddress,
        setSelectedAddress,
        updateAddress,
        addAddress,
    } = useAddress();
    const {
        activeBusinessAccountId: switcherAccountId,
        customerImpersonating,
        signOut: switcherSignOut,
    } = useBusinessAccountSwitcher();

    useEffect(() => {
        const openParam = searchParams?.get('open');
        if (!openParam) return;
        Promise.resolve().then(() => {
            if (openParam === 'outlets' || openParam === 'addresses' || openParam === 'saved-addresses') {
                if (has('outlets.view')) setIsOutletsOpen(true);
            } else if (openParam === 'team' || openParam === 'team-members' || openParam === 'users') {
                if (hasAny('users.view', 'users.create', 'users.edit', 'users.delete')) setIsTeamOpen(true);
            } else if (openParam === 'roles') {
                if (hasAny('users.view', 'users.create', 'users.edit', 'users.delete')) setIsRolesOpen(true);
            } else if (openParam === 'overview' || openParam === 'account-overview') {
                if (has('settings.view')) setIsOverviewOpen(true);
            }
        });
    }, [searchParams, has, hasAny]);

    // updateSession from useSession() is a new reference each render — keep it in a ref
    // so our role-sync effect doesn't refire and ping the session endpoint in a loop.
    const updateSessionRef = useRef(updateSession);
    useEffect(() => { updateSessionRef.current = updateSession; }, [updateSession]);
    const sessionRoleRefreshedRef = useRef<string | null>(null);
    // Nuclear-option guard: if updateSession() doesn't actually rotate the JWT
    // (NextAuth occasionally no-ops on identical payloads, or the cookie write
    // races with the page render), we hard-reload exactly once per page load.
    const hardReloadDoneRef = useRef(false);

    const [userData, setUserData] = useState({
        fullName: '',
        phone: '',
        businessName: '',
        email: '',
        address: '',
        address2: '',
        pincode: '',
        city: '',
        image: '',
        shortAddress: '',
        state: '',
        latitude: null as number | null,
        longitude: null as number | null,
        placeId: '',
    });
    const [primaryAddressId, setPrimaryAddressId] = useState<string | null>(null);
    const [profileReady, setProfileReady] = useState(false);

    const sessionUserId = session?.user?.id;
    const sessionRole = (session?.user as { role?: string } | undefined)?.role;
    const sessionName = session?.user?.name ?? '';
    const sessionEmail = session?.user?.email ?? '';

    // Seed from session immediately so we never flash "Hi there" / empty email
    // while /auth/me is in flight.
    useEffect(() => {
        if (!sessionUserId) {
            Promise.resolve().then(() => setProfileReady(false));
            return;
        }
        Promise.resolve().then(() => {
            setUserData(prev => ({
                ...prev,
                fullName: prev.fullName || sessionName || '',
                email: prev.email || sessionEmail || '',
            }));
        });
    }, [sessionUserId, sessionName, sessionEmail]);

    // Fetch full profile from DB (session only carries name/email/role)
    useEffect(() => {
        if (!sessionUserId) return;
        let cancelled = false;
        Promise.all([
            fetch('/api/v1/auth/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
            fetch('/api/v1/addresses', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
            fetch('/api/v1/vendor/application-status', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
            fetch('/api/v1/wallet', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        ])
            .then(([profileJson, addrJson, vendorJson, walletJson]) => {
                if (cancelled) return;
                if (vendorJson?.success) {
                    Promise.resolve().then(() => {
                        setHasVendorApplication(!!vendorJson.data.hasApplication);
                        setVendorAppApproved(vendorJson.data?.status === 'approved');
                    });
                }
                if (walletJson?.success && Array.isArray(walletJson.data)) {
                    const wallets = walletJson.data;
                    let totalLimit = 0;
                    let totalAvailable = 0;
                    let totalOutstanding = 0;
                    let hasOverdue = false;
                    const now = new Date();
                    for (const w of wallets) {
                        totalLimit += Number(w.creditLimit || 0);
                        totalAvailable += Number(w.availableCredit || 0);
                        totalOutstanding += Number(w.outstandingAmount || 0);
                        if (w.currentDueDate && new Date(w.currentDueDate) < now && Number(w.outstandingAmount) > 0) {
                            hasOverdue = true;
                        }
                    }
                    setCreditSummary({
                        totalLimit,
                        totalAvailable,
                        totalOutstanding,
                        hasOverdue,
                        hasWallets: wallets.length > 0,
                        lineCount: wallets.length,
                    });
                }
                const p = profileJson?.success ? profileJson.data : null;
                const addresses = addrJson?.success ? addrJson.data : [];
                const defaultAddr = addresses?.find((a: { isDefault?: boolean }) => a.isDefault) ?? addresses?.[0];
                setPrimaryAddressId(defaultAddr?.id ?? null);
                setUserData(prev => ({
                    ...prev,
                    fullName: p?.fullName || prev.fullName || sessionName || '',
                    phone: p?.phone || '',
                    businessName: p?.businessName || '',
                    email: p?.email || prev.email || sessionEmail || '',
                    pincode: p?.pincode || defaultAddr?.pincode || '',
                    image: p?.image || '',
                    address: defaultAddr?.fullAddress || defaultAddr?.shortAddress || '',
                    address2: defaultAddr?.flatInfo || defaultAddr?.landmark || '',
                    city: defaultAddr?.city || '',
                    shortAddress: defaultAddr?.shortAddress || '',
                    state: defaultAddr?.state || '',
                    latitude: typeof defaultAddr?.latitude === 'number' ? defaultAddr.latitude : null,
                    longitude: typeof defaultAddr?.longitude === 'number' ? defaultAddr.longitude : null,
                    placeId: defaultAddr?.placeId || '',
                }));
                setProfileReady(true);
            })
            .catch(() => {
                if (!cancelled) setProfileReady(true);
            });
        return () => { cancelled = true; };
    }, [sessionUserId, sessionName, sessionEmail]);

    // One-shot role drift fix — separate from profile fetch so session.update()
    // doesn't re-trigger four API calls and hammer /api/auth/session (429).
    // Skip while viewing as a customer: JWT stays admin by design while
    // GET /auth/me returns the impersonated customer's role.
    useEffect(() => {
        if (!sessionUserId || !sessionRole) return;
        if (isAdminCustomerImpersonationActive()) return;

        let cancelled = false;
        fetch('/api/v1/auth/me', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then((profileJson) => {
                if (cancelled) return;
                const dbRole = profileJson?.success ? profileJson.data?.role : null;
                if (!dbRole || dbRole === sessionRole) {
                    try { sessionStorage.removeItem(`horeca_role_reload_${sessionUserId}`); } catch { /* ignore */ }
                    return;
                }

                const key = `${sessionRole}->${dbRole}`;
                if (sessionRoleRefreshedRef.current === key) return;
                sessionRoleRefreshedRef.current = key;

                Promise.resolve(updateSessionRef.current({ refresh: Date.now() }))
                    .catch(() => { /* silent — fallback below covers it */ })
                    .finally(() => {
                        window.setTimeout(() => {
                            if (cancelled || hardReloadDoneRef.current) return;
                            if (isAdminCustomerImpersonationActive()) return;
                            const reloadGuardKey = `horeca_role_reload_${sessionUserId}`;
                            try {
                                if (sessionStorage.getItem(reloadGuardKey)) return;
                            } catch { /* ignore */ }

                            fetch('/api/v1/auth/me', { credentials: 'include' })
                                .then(r => r.ok ? r.json() : null)
                                .then((latest) => {
                                    if (cancelled || hardReloadDoneRef.current) return;
                                    if (isAdminCustomerImpersonationActive()) return;
                                    const freshDbRole = latest?.success ? latest.data?.role : null;
                                    if (freshDbRole && freshDbRole !== sessionRole) {
                                        hardReloadDoneRef.current = true;
                                        try { sessionStorage.setItem(reloadGuardKey, key); } catch { /* ignore */ }
                                        window.location.reload();
                                    }
                                })
                                .catch(() => { /* network blip */ });
                        }, 1500);
                    });
            })
            .catch(() => {});

        return () => { cancelled = true; };
    }, [sessionUserId, sessionRole]);

    if (!isOpen) return null;

    const handleLogout = async () => {
        toast.success('Logged out successfully');
        try {
            localStorage.removeItem('horeca_order_lists_all');
            localStorage.removeItem('horeca_orders');
            localStorage.removeItem('horeca_recently_viewed');
        } catch { /* ignore */ }
        // Cookie clear first — do not await impersonation DELETEs (can delay/hang).
        void clearAllAdminImpersonation();
        await clientLogout('/');
    };

    // Four primary actions for B2B procurement landing — uniform brand styling
    // (no per-tile color pastels) to keep the dashboard feeling enterprise, not consumer.
    const primaryActions = [
        { id: 'reorder', label: 'Reorder', sub: 'From last order', icon: RotateCcw, onClick: () => router.push('/orders') },
        { id: 'quick-order', label: 'Quick Order', sub: 'Saved order lists', icon: ListOrdered, onClick: () => router.push('/order-lists') },
        { id: 'my-vendors', label: 'My Vendors', sub: 'Saved suppliers', icon: Store, onClick: () => router.push('/vendors') },
        { id: 'orders', label: 'Your Orders', sub: 'Track & history', icon: ShoppingBag, onClick: () => router.push('/orders') },
    ];

    // Prefer switcher BA (impersonation-aware). Never fall back to the admin JWT
    // BA while viewing as a customer — that was loading admin outlets.
    const jwtAccountId = (session?.user as { activeBusinessAccountId?: string } | undefined)?.activeBusinessAccountId;
    const activeAccountIdForLinks = customerImpersonating
      ? (switcherAccountId ?? undefined)
      : (switcherAccountId ?? jwtAccountId);

    const yourInfoItems = [
        { id: 'edit-profile', label: 'Edit Profile', desc: 'Update your personal details', icon: Pencil, onClick: () => setIsEditProfileOpen(true) },
        ...(!activeAccountIdForLinks ? [{
            id: 'saved-addresses',
            label: 'Delivery Addresses',
            desc: 'Manage delivery locations',
            icon: MapPin,
            onClick: () => setIsSavedAddressesOpen(true),
        }] : []),
        { id: 'payment', label: 'Payment Management', desc: 'Cards, UPI & banking', icon: CreditCard, onClick: () => setIsPaymentOpen(true) },
        {
            id: 'credit-wallet',
            label: 'DiSCCO Credit',
            desc: creditSummary
                ? creditSummary.hasWallets
                    ? creditSummary.totalOutstanding > 0
                        ? `${creditSummary.lineCount} line${creditSummary.lineCount === 1 ? '' : 's'} · ₹${creditSummary.totalOutstanding.toLocaleString('en-IN')} due`
                        : `${creditSummary.lineCount} supplier line${creditSummary.lineCount === 1 ? '' : 's'}`
                    : 'No credit assigned yet'
                : 'Buy Now, Pay Later',
            icon: CreditCard,
            onClick: () => {
                onClose();
                router.push('/wallet');
            }
        },
        {
            id: 'h1-wallet',
            label: 'H1 Wallet',
            desc: 'Available to spend at checkout',
            icon: CreditCard,
            onClick: () => {
                onClose();
                router.push('/rewards');
            }
        },
    ];

    // Business Account management — hide for platform admins (they use /admin).
    // Still show while admin is viewing-as-customer.
    const canSeeOutlets = has('outlets.view');
    const canSeeTeam = hasAny('users.view', 'users.create', 'users.edit', 'users.delete');
    const canSeeOverview = has('settings.view');
    const hideBusinessAccountForAdmin = sessionRole === 'admin' && !customerImpersonating;
    const businessAccountItems = (!hideBusinessAccountForAdmin && activeAccountIdForLinks) ? [
        ...(canSeeOutlets ? [{ id: 'outlets', label: 'Outlets & Delivery', desc: 'Branches and where orders are delivered', icon: MapPin, onClick: () => setIsOutletsOpen(true) }] : []),
        ...(!customerImpersonating && canSeeTeam ? [{ id: 'team-members', label: 'Team Members', desc: 'Invite users, manage roles & access', icon: Users, onClick: () => router.push('/profile/team') }] : []),
        ...(canSeeOverview ? [{ id: 'account-overview', label: 'Account Overview', desc: 'GST, business type, members', icon: Building2, onClick: () => setIsOverviewOpen(true) }] : []),
    ] : [];

    const adminPortalItem = hideBusinessAccountForAdmin
        ? [{
            id: 'admin-dashboard',
            label: 'Admin Dashboard',
            desc: 'Orders, vendors, finance & approvals',
            icon: LayoutDashboard,
            onClick: () => { onClose(); router.push('/admin/dashboard'); },
          }]
        : [];

    const sessionAcctType = (session?.user as {
        activeBusinessAccountType?: { isVendor?: boolean; isBrand?: boolean };
        availableAccounts?: Array<{ isVendor?: boolean; isBrand?: boolean }>;
    } | undefined);
    const showVendorDashboardCta =
        !customerImpersonating
        && !hideBusinessAccountForAdmin
        && vendorAppApproved
        && (
            sessionAcctType?.activeBusinessAccountType?.isVendor === true
            || sessionRole === 'vendor'
            || (sessionAcctType?.availableAccounts?.some((a) => a.isVendor === true) ?? false)
        );
    const vendorPortalItem = showVendorDashboardCta
        ? [{
            id: 'vendor-dashboard',
            label: 'Supplier Dashboard',
            desc: 'Inventory, orders & store operations',
            icon: LayoutDashboard,
            onClick: () => { onClose(); router.push('/vendor/dashboard'); },
          }]
        : [];

    const portalItems = [...adminPortalItem, ...vendorPortalItem];

    const otherInfoItems = [
        { id: 'notifications', label: 'Notification', desc: 'Push & email preferences', icon: Bell, onClick: () => setIsNotificationOpen(true) },
        { id: 'general', label: 'General Information', desc: 'About, terms & policies', icon: Info, onClick: () => setIsGeneralInfoOpen(true) },
        { id: 'settings', label: 'Settings', desc: 'Language, theme & more', icon: Settings, onClick: () => setIsSettingsOpen(true) },
        { id: 'support', label: 'Help & Support', desc: 'Reach our team', icon: HelpCircle, onClick: () => router.push('/contact') },
    ];

    const isProfileComplete = !!(userData.fullName && userData.businessName && userData.pincode);
    // Deliver-to comes from AddressContext (selected / primary SavedAddress), not User profile fields.
    const deliverToAddress =
        selectedAddress
        ?? savedAddresses.find((a) => a.isDefault)
        ?? savedAddresses[0]
        ?? null;
    const deliverToLabel = deliverToAddress
        ? (deliverToAddress.businessName || deliverToAddress.label || deliverToAddress.shortAddress || '').trim()
        : '';
    const deliverToLine = deliverToAddress
        ? (deliverToAddress.fullAddress || deliverToAddress.shortAddress || '').trim()
        : '';
    const deliverToSub = deliverToAddress
        ? [deliverToAddress.city, deliverToAddress.pincode].filter(Boolean).join(' · ')
        : '';
    // Fallback only when no SavedAddress exists yet (legacy profile fields).
    const defaultLocation = deliverToSub || [userData.city, userData.pincode].filter(Boolean).join(' · ');
    const defaultDeliveryLine = deliverToLine || userData.address || '';
    // Show the "Become a vendor" CTA only for customers who haven't yet applied.
    // Admins, brands, and existing vendors (pending or approved) all skip it.
    const showBecomeVendorCta = hasVendorApplication === false && sessionRole !== 'admin' && sessionRole !== 'brand' && sessionRole !== 'vendor';

    // Edit Profile delivery fields seed from deliver-to (not stale User profile address).
    const editProfileUserData = deliverToAddress
        ? {
            ...userData,
            businessName:
                deliverToAddress.businessName
                || deliverToAddress.label
                || userData.businessName,
            address: deliverToAddress.fullAddress || userData.address,
            address2: deliverToAddress.flatInfo || userData.address2,
            pincode: deliverToAddress.pincode || userData.pincode,
            city: deliverToAddress.city || userData.city,
            state: deliverToAddress.state || userData.state,
            shortAddress: deliverToAddress.shortAddress || userData.shortAddress,
            latitude: Number.isFinite(deliverToAddress.latitude)
                ? deliverToAddress.latitude
                : userData.latitude,
            longitude: Number.isFinite(deliverToAddress.longitude)
                ? deliverToAddress.longitude
                : userData.longitude,
            placeId: deliverToAddress.placeId || userData.placeId,
        }
        : userData;

    return (
        <>
            <div className="w-full min-h-screen bg-[#F2F3F2] flex flex-col animate-in fade-in slide-in-from-bottom duration-300">
                {/* Mobile Header */}
                <div className="md:hidden flex items-center px-4 py-3 shrink-0 relative bg-transparent">
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors absolute left-4 z-10"
                    >
                        <ChevronLeft size={20} className="text-[#181725]" />
                    </button>
                    <h2 className="w-full text-center text-[18px] font-[700] text-[#181725]">Profile</h2>
                </div>

                {/* Desktop Header */}
                <div className="hidden md:block bg-[#F7F8FA] border-b border-gray-100">
                    <div className="md:max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-6">
                        <div className="flex items-center gap-2 text-[13px] text-text-muted mb-3">
                            <Link href="/" className="hover:text-primary transition-colors flex items-center gap-1">
                                <Home size={14} />
                                <span>Home</span>
                            </Link>
                            <ChevronRight size={12} />
                            <span className="text-text font-semibold">Profile</span>
                        </div>
                        <h1 className="text-[32px] font-black text-text tracking-tight">
                            <User size={32} className="inline-block mr-3 -mt-1 text-primary" />
                            My Account
                        </h1>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pb-24 md:pb-16 px-4 pt-2 md:px-0 md:pt-0">
                    <div className="md:max-w-[var(--container-max)] md:mx-auto md:px-[var(--container-padding)] md:pt-10">
                        
                        {/* === MOBILE LAYOUT === */}
                        <div className="md:hidden">
                            {/* Identity card */}
                            <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
                                <div className="relative shrink-0">
                                    <div className="w-[60px] h-[60px] rounded-full overflow-hidden border-[2px] border-[#53B175] bg-white">
                                        <img src={userData.image || '/images/profile/sample-profile.png'} alt="Profile" className="w-full h-full object-cover" />
                                    </div>
                                    <button onClick={() => setIsEditProfileOpen(true)} className="absolute -bottom-0.5 -right-0.5 w-6 h-6 bg-white rounded-full flex items-center justify-center border border-gray-100 shadow-sm cursor-pointer">
                                        <Pencil size={11} className="text-gray-400" />
                                    </button>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        {!profileReady && !userData.fullName ? (
                                            <div className="h-5 w-28 rounded bg-gray-100 animate-pulse" aria-hidden />
                                        ) : (
                                            <h3 className="text-[16px] font-[700] text-[#181725] truncate">{userData.fullName || 'Welcome'}</h3>
                                        )}
                                        {isProfileComplete && <BadgeCheck size={15} className="text-[#53B175] shrink-0" />}
                                    </div>
                                    <p className="text-[12px] text-gray-400 font-medium truncate">{userData.email}</p>
                                    {deliverToLabel && (
                                        <span className="inline-flex items-center mt-1 text-[10px] font-bold text-[#53B175] bg-[#53B175]/10 border border-[#53B175]/15 px-2 py-0.5 rounded-full max-w-full truncate">
                                            {deliverToLabel}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Mobile DiSCCO summary */}
                            {creditSummary && creditSummary.hasWallets && (
                                <div className="mb-4 bg-gradient-to-br from-[#1b5e3a] to-[#2e7d32] text-white rounded-2xl p-5 shadow-md relative overflow-hidden">
                                    <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
                                        <CreditCard size={120} strokeWidth={1} />
                                    </div>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-emerald-200 font-bold">DiSCCO</p>
                                            <h3 className="text-[20px] font-black mt-1">Buy Now, Pay Later</h3>
                                            <p className="text-[10px] text-emerald-100/80 mt-0.5">
                                                {creditSummary.lineCount} supplier credit line{creditSummary.lineCount === 1 ? '' : 's'}
                                            </p>
                                        </div>
                                        {creditSummary.totalOutstanding > 0 && (
                                            <span className={cn(
                                                "px-2.5 py-1 rounded-full text-[10px] font-bold border",
                                                creditSummary.hasOverdue
                                                    ? "bg-red-500/20 text-red-100 border-red-400/30 animate-pulse"
                                                    : "bg-amber-500/20 text-amber-100 border-amber-400/30"
                                            )}>
                                                {creditSummary.hasOverdue ? 'Overdue' : 'Due'}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-[9px] text-emerald-200/80 uppercase font-bold">Outstanding</p>
                                            <p className="text-[13px] font-bold">₹{creditSummary.totalOutstanding.toLocaleString('en-IN')}</p>
                                        </div>
                                        <div className="flex items-end justify-end">
                                            <button
                                                onClick={() => { onClose(); router.push('/wallet'); }}
                                                className="bg-white text-[#1b5e3a] hover:bg-emerald-50 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-sm"
                                            >
                                                View Credit
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Primary actions — 2x2 */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                {primaryActions.map((action) => {
                                    const Icon = action.icon;
                                    return (
                                        <button key={action.id} onClick={action.onClick} className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-3 shadow-sm active:scale-[0.98] transition-all text-left cursor-pointer">
                                            <div className="w-10 h-10 rounded-xl bg-[#53B175]/10 text-[#53B175] flex items-center justify-center shrink-0">
                                                <Icon size={18} strokeWidth={2.4} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-[700] text-[#181725] leading-tight">{action.label}</p>
                                                <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">{action.sub}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Account details snapshot */}
                            {(userData.phone || deliverToLabel || userData.businessName || defaultDeliveryLine || defaultLocation) && (
                                <div className="mb-6">
                                    <h4 className="text-[12px] font-[800] text-gray-400 uppercase tracking-wider mb-2 px-1">Account details</h4>
                                    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-50">
                                        {userData.phone && (
                                            <div className="flex items-center gap-3 px-4 py-3">
                                                <Phone size={15} className="text-gray-400 shrink-0" />
                                                <span className="text-[13px] font-[600] text-[#181725]">{userData.phone}</span>
                                            </div>
                                        )}
                                        {userData.email && (
                                            <div className="flex items-center gap-3 px-4 py-3">
                                                <Mail size={15} className="text-gray-400 shrink-0" />
                                                <span className="text-[13px] font-[600] text-[#181725] truncate">{userData.email}</span>
                                            </div>
                                        )}
                                        {(deliverToLabel || userData.businessName) && (
                                            <div className="flex items-center gap-3 px-4 py-3">
                                                <Building2 size={15} className="text-gray-400 shrink-0" />
                                                <span className="text-[13px] font-[600] text-[#181725] truncate">{deliverToLabel || userData.businessName}</span>
                                            </div>
                                        )}
                                        {(defaultDeliveryLine || defaultLocation) && (
                                            <div className="flex items-start gap-3 px-4 py-3">
                                                <MapPin size={15} className="text-gray-400 shrink-0 mt-0.5" />
                                                <div className="text-[13px] font-[600] text-[#181725]">
                                                    {defaultDeliveryLine && <p className="truncate">{defaultDeliveryLine}</p>}
                                                    {defaultLocation && <p className="text-[11px] text-gray-400 font-medium">{defaultLocation}</p>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Admin portal — platform admins go here instead of Business Account */}
                            {portalItems.length > 0 && (
                                <div className="mb-6">
                                    <h4 className="text-[12px] font-[800] text-gray-400 uppercase tracking-wider mb-2 px-1">Platform</h4>
                                    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                                        {portalItems.map((item, idx) => {
                                            const Icon = item.icon;
                                            return (
                                                <button key={item.id} onClick={item.onClick} className={cn("w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors text-left cursor-pointer", idx < portalItems.length - 1 && "border-b border-gray-50")}>
                                                    <span className="w-8 h-8 rounded-lg bg-[#53B175]/10 text-[#53B175] flex items-center justify-center shrink-0">
                                                        <Icon size={15} />
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13px] font-[700] text-[#181725] leading-tight">{item.label}</p>
                                                        <p className="text-[11px] text-gray-400 font-medium mt-0.5 truncate">{item.desc}</p>
                                                    </div>
                                                    <ChevronRight size={16} className="text-gray-300" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Business Account management — V2.2 */}
                            {businessAccountItems.length > 0 && (
                                <div className="mb-6">
                                    <h4 className="text-[12px] font-[800] text-gray-400 uppercase tracking-wider mb-2 px-1">Business</h4>
                                    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                                        {businessAccountItems.map((item, idx) => {
                                            const Icon = item.icon;
                                            return (
                                                <button key={item.id} onClick={item.onClick} className={cn("w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors text-left cursor-pointer", idx < businessAccountItems.length - 1 && "border-b border-gray-50")}>
                                                    <span className="w-8 h-8 rounded-lg bg-[#53B175]/10 text-[#53B175] flex items-center justify-center shrink-0">
                                                        <Icon size={15} />
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13px] font-[700] text-[#181725] leading-tight">{item.label}</p>
                                                        <p className="text-[11px] text-gray-400 font-medium mt-0.5 truncate">{item.desc}</p>
                                                    </div>
                                                    <ChevronRight size={16} className="text-gray-300" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Your Information */}
                            <div className="mb-6">
                                <h4 className="text-[12px] font-[800] text-gray-400 uppercase tracking-wider mb-2 px-1">Account</h4>
                                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                                    {yourInfoItems.map((item, idx) => {
                                        const Icon = item.icon;
                                        return (
                                            <button key={item.id} onClick={item.onClick} className={cn("w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors text-left cursor-pointer", idx < yourInfoItems.length - 1 && "border-b border-gray-50")}>
                                                <Icon size={16} className="text-gray-500 shrink-0" />
                                                <span className="text-[13px] font-[600] text-[#181725] flex-1">{item.label}</span>
                                                <ChevronRight size={16} className="text-gray-300" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Other Information */}
                            <div className="mb-6">
                                <h4 className="text-[12px] font-[800] text-gray-400 uppercase tracking-wider mb-2 px-1">More</h4>
                                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                                    {otherInfoItems.map((item, idx) => {
                                        const Icon = item.icon;
                                        return (
                                            <button key={item.id} onClick={item.onClick} className={cn("w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors text-left cursor-pointer", idx < otherInfoItems.length - 1 && "border-b border-gray-50")}>
                                                <Icon size={16} className="text-gray-500 shrink-0" />
                                                <span className="text-[13px] font-[600] text-[#181725] flex-1">{item.label}</span>
                                                <ChevronRight size={16} className="text-gray-300" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Logout - Mobile */}
                            <button onClick={handleLogout} className="w-full bg-white border border-gray-100 rounded-2xl py-3.5 text-red-500 font-[700] text-[15px] active:bg-red-50/30 transition-colors flex items-center justify-center gap-2 shadow-sm mb-12 cursor-pointer">
                                <LogOut size={16} />
                                Logout
                            </button>
                        </div>

                        {/* === DESKTOP LAYOUT — sidebar nav + main dashboard (B2B enterprise feel) === */}
                        <div className="hidden md:grid md:grid-cols-[280px_1fr] lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr] md:gap-6 lg:gap-8 md:items-start">

                            {/* LEFT SIDEBAR — profile card + grouped nav + logout */}
                            <aside className="md:sticky md:top-6 md:self-start space-y-3">

                                {/* Profile identity card */}
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)] p-5">
                                    <div className="flex flex-col items-center text-center">
                                        <div className="relative mb-3">
                                            <div className="w-[80px] h-[80px] rounded-full overflow-hidden border-[2px] border-[#53B175] bg-white">
                                                <img src={userData.image || '/images/profile/sample-profile.png'} alt="Profile" className="w-full h-full object-cover" />
                                            </div>
                                            <button
                                                onClick={() => setIsEditProfileOpen(true)}
                                                className="absolute bottom-0 right-0 w-7 h-7 bg-white rounded-full flex items-center justify-center border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors cursor-pointer"
                                                title="Edit profile"
                                            >
                                                <Pencil size={11} className="text-gray-400" />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-1.5 max-w-full">
                                            {!profileReady && !userData.fullName ? (
                                                <div className="h-5 w-28 rounded bg-gray-100 animate-pulse" aria-hidden />
                                            ) : (
                                                <h3 className="text-[15px] font-[700] text-[#181725] truncate">{userData.fullName || 'Welcome'}</h3>
                                            )}
                                            {isProfileComplete && <BadgeCheck size={14} className="text-[#53B175] shrink-0" />}
                                        </div>
                                        <p className="text-[11.5px] text-gray-400 font-medium mt-0.5 truncate max-w-full">{userData.email}</p>
                                        {deliverToLabel && (
                                            <span className="mt-2 inline-flex items-center text-[10.5px] font-bold text-[#53B175] bg-[#53B175]/10 border border-[#53B175]/15 px-2.5 py-0.5 rounded-full max-w-full truncate">
                                                {deliverToLabel}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Grouped nav */}
                                <nav className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)] p-2.5">
                                    <p className="text-[10px] font-[700] text-gray-400 uppercase tracking-[0.12em] px-2 pt-1 pb-1.5">Account</p>
                                    <ul className="space-y-0.5">
                                        {yourInfoItems.map((item) => {
                                            const Icon = item.icon;
                                            return (
                                                <li key={item.id}>
                                                    <button
                                                        onClick={item.onClick}
                                                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#53B175]/8 text-[#181725] hover:text-[#53B175] transition-colors group cursor-pointer"
                                                    >
                                                        <Icon size={15} className="text-gray-400 group-hover:text-[#53B175] shrink-0" />
                                                        <span className="text-[13px] font-[600] flex-1 text-left">{item.label}</span>
                                                        <ChevronRight size={13} className="text-gray-300 group-hover:text-[#53B175]" />
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>

                                    {/* Platform admin — dashboard entry */}
                                    {portalItems.length > 0 && (
                                        <>
                                            <p className="text-[10px] font-[700] text-gray-400 uppercase tracking-[0.12em] px-2 pt-3 pb-1.5">Platform</p>
                                            <ul className="space-y-0.5">
                                                {portalItems.map((item) => {
                                                    const Icon = item.icon;
                                                    return (
                                                        <li key={item.id}>
                                                            <button
                                                                onClick={item.onClick}
                                                                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#53B175]/8 text-[#181725] hover:text-[#53B175] transition-colors group cursor-pointer"
                                                            >
                                                                <Icon size={15} className="text-gray-400 group-hover:text-[#53B175] shrink-0" />
                                                                <span className="text-[13px] font-[600] flex-1 text-left">{item.label}</span>
                                                                <ChevronRight size={13} className="text-gray-300 group-hover:text-[#53B175]" />
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </>
                                    )}

                                    {/* V2.2: Business Account management — only renders if user has an active account */}
                                    {businessAccountItems.length > 0 && (
                                        <>
                                            <p className="text-[10px] font-[700] text-gray-400 uppercase tracking-[0.12em] px-2 pt-3 pb-1.5">Business</p>
                                            <ul className="space-y-0.5">
                                                {businessAccountItems.map((item) => {
                                                    const Icon = item.icon;
                                                    return (
                                                        <li key={item.id}>
                                                            <button
                                                                onClick={item.onClick}
                                                                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#53B175]/8 text-[#181725] hover:text-[#53B175] transition-colors group cursor-pointer"
                                                            >
                                                                <Icon size={15} className="text-gray-400 group-hover:text-[#53B175] shrink-0" />
                                                                <span className="text-[13px] font-[600] flex-1 text-left">{item.label}</span>
                                                                <ChevronRight size={13} className="text-gray-300 group-hover:text-[#53B175]" />
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </>
                                    )}

                                    <p className="text-[10px] font-[700] text-gray-400 uppercase tracking-[0.12em] px-2 pt-3 pb-1.5">Activity</p>
                                    <ul className="space-y-0.5">
                                        <li>
                                            <button onClick={() => router.push('/orders')} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#53B175]/8 text-[#181725] hover:text-[#53B175] transition-colors group cursor-pointer">
                                                <ShoppingBag size={15} className="text-gray-400 group-hover:text-[#53B175] shrink-0" />
                                                <span className="text-[13px] font-[600] flex-1 text-left">Your Orders</span>
                                                <ChevronRight size={13} className="text-gray-300 group-hover:text-[#53B175]" />
                                            </button>
                                        </li>
                                        <li>
                                            <button onClick={() => router.push('/order-lists')} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#53B175]/8 text-[#181725] hover:text-[#53B175] transition-colors group cursor-pointer">
                                                <ListOrdered size={15} className="text-gray-400 group-hover:text-[#53B175] shrink-0" />
                                                <span className="text-[13px] font-[600] flex-1 text-left">Quick Order Lists</span>
                                                <ChevronRight size={13} className="text-gray-300 group-hover:text-[#53B175]" />
                                            </button>
                                        </li>
                                        <li>
                                            <button onClick={() => router.push('/vendors')} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#53B175]/8 text-[#181725] hover:text-[#53B175] transition-colors group cursor-pointer">
                                                <Store size={15} className="text-gray-400 group-hover:text-[#53B175] shrink-0" />
                                                <span className="text-[13px] font-[600] flex-1 text-left">My Vendors</span>
                                                <ChevronRight size={13} className="text-gray-300 group-hover:text-[#53B175]" />
                                            </button>
                                        </li>
                                    </ul>

                                    <p className="text-[10px] font-[700] text-gray-400 uppercase tracking-[0.12em] px-2 pt-3 pb-1.5">Preferences</p>
                                    <ul className="space-y-0.5">
                                        {otherInfoItems.map((item) => {
                                            const Icon = item.icon;
                                            return (
                                                <li key={item.id}>
                                                    <button
                                                        onClick={item.onClick}
                                                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#53B175]/8 text-[#181725] hover:text-[#53B175] transition-colors group cursor-pointer"
                                                    >
                                                        <Icon size={15} className="text-gray-400 group-hover:text-[#53B175] shrink-0" />
                                                        <span className="text-[13px] font-[600] flex-1 text-left">{item.label}</span>
                                                        <ChevronRight size={13} className="text-gray-300 group-hover:text-[#53B175]" />
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </nav>

                                {/* Logout */}
                                <button
                                    onClick={handleLogout}
                                    className="w-full bg-white border border-gray-100 rounded-2xl py-3 text-red-500 font-[700] text-[13px] hover:bg-red-50/40 transition-colors flex items-center justify-center gap-2 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)] cursor-pointer"
                                >
                                    <LogOut size={15} />
                                    Logout
                                </button>
                            </aside>

                            {/* RIGHT MAIN — welcome + actions + account snapshot */}
                            <main className="space-y-6">

                                {/* Welcome strip — flat, professional, B2B-friendly */}
                                <div className="bg-white border border-gray-100 rounded-2xl px-6 lg:px-8 py-5 lg:py-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)] flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-[10.5px] font-[800] text-[#53B175] uppercase tracking-[0.18em] mb-1">Welcome back</p>
                                        {!profileReady && !userData.fullName ? (
                                            <div className="space-y-2" aria-hidden>
                                                <div className="h-7 w-40 max-w-full rounded-lg bg-gray-100 animate-pulse" />
                                                <div className="h-4 w-64 max-w-full rounded bg-gray-50 animate-pulse" />
                                            </div>
                                        ) : (
                                            <>
                                                <h2 className="text-[22px] lg:text-[26px] font-black text-[#181725] leading-tight truncate">
                                                    {userData.fullName ? `Hi, ${userData.fullName.split(' ')[0]}` : 'Hi there'}
                                                </h2>
                                                <p className="text-[13px] text-gray-500 mt-1.5 truncate">
                                                    {userData.businessName
                                                        ? `Manage ${userData.businessName}'s procurement from one place.`
                                                        : 'Manage your procurement from one place.'}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                    {!isProfileComplete && (
                                        <button
                                            onClick={() => setIsEditProfileOpen(true)}
                                            className="hidden lg:flex items-center gap-2 shrink-0 bg-[#53B175] text-white text-[12px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#469E66] transition-colors cursor-pointer"
                                        >
                                            <Pencil size={13} />
                                            Complete profile
                                        </button>
                                    )}
                                </div>

                                {/* Desktop DiSCCO summary */}
                                {creditSummary && creditSummary.hasWallets && (
                                    <div className="bg-gradient-to-r from-[#1b5e3a] via-[#246c43] to-[#2e7d32] text-white rounded-2xl p-6 shadow-md relative overflow-hidden border border-emerald-800/20">
                                        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
                                            <CreditCard size={180} strokeWidth={1} />
                                        </div>
                                        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                            <div className="flex-1 space-y-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="p-2 rounded-xl bg-white/10 text-white shrink-0">
                                                        <CreditCard size={20} />
                                                    </span>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider text-emerald-200 font-bold">DiSCCO</p>
                                                        <h3 className="text-[22px] font-black leading-tight mt-0.5">Buy Now, Pay Later</h3>
                                                        <p className="text-[11px] text-emerald-100/80 mt-0.5">
                                                            {creditSummary.lineCount} supplier credit line{creditSummary.lineCount === 1 ? '' : 's'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 max-w-sm pt-1">
                                                    <div>
                                                        <p className="text-[10px] text-emerald-200/80 font-semibold">Outstanding</p>
                                                        <p className="text-[16px] font-bold">₹{creditSummary.totalOutstanding.toLocaleString('en-IN')}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-emerald-200/80 font-semibold">Status</p>
                                                        <span className={cn(
                                                            "inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase border",
                                                            creditSummary.hasOverdue
                                                                ? "bg-red-500/20 text-red-100 border-red-400/30"
                                                                : "bg-emerald-500/20 text-emerald-100 border-emerald-400/30"
                                                        )}>
                                                            {creditSummary.hasOverdue ? 'Overdue' : 'Active'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex sm:flex-col items-stretch gap-2 shrink-0">
                                                <button
                                                    onClick={() => { onClose(); router.push('/wallet'); }}
                                                    className="bg-white text-[#1b5e3a] hover:bg-emerald-50 text-[13px] font-black px-6 py-3 rounded-xl transition-all shadow-sm hover:shadow active:scale-[0.98] duration-150 cursor-pointer text-center"
                                                >
                                                    View Credit
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Become a vendor CTA — only for customer-only users who haven't applied yet */}
                                {showBecomeVendorCta && (
                                    <button
                                        onClick={() => setIsBecomeVendorOpen(true)}
                                        className="w-full text-left bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group cursor-pointer"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shrink-0 shadow-md shadow-emerald-200">
                                                <Store size={20} className="text-white" />
                                                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 flex items-center justify-center">
                                                    <Sparkles size={8} className="text-white" />
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[14px] font-bold text-emerald-900 leading-tight">
                                                    Want to sell on Horeca1? Become a supplier.
                                                </p>
                                                <p className="text-[12px] text-emerald-800/70 mt-0.5">
                                                    Keep your account — just unlock the supplier portal. Admin reviews in ~24h.
                                                </p>
                                            </div>
                                            <span className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-[12px] font-bold group-hover:bg-emerald-700 shrink-0">
                                                Apply
                                                <ChevronRight size={13} />
                                            </span>
                                        </div>
                                    </button>
                                )}

                                {/* Primary actions — 4 enterprise-style tiles with shared brand accent */}
                                <section>
                                    <div className="flex items-baseline justify-between mb-3 px-1">
                                        <h3 className="text-[15px] font-[700] text-[#181725]">Shortcuts</h3>
                                        <span className="text-[11px] font-medium text-gray-400">Jump back in</span>
                                    </div>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                                        {primaryActions.map((action) => {
                                            const Icon = action.icon;
                                            return (
                                                <button
                                                    key={action.id}
                                                    onClick={action.onClick}
                                                    className="group relative text-left bg-white border border-gray-100 rounded-2xl p-5 hover:border-[#53B175]/40 hover:shadow-[0_8px_24px_rgba(83,177,117,0.12)] hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.98] cursor-pointer overflow-hidden"
                                                >
                                                    <div className="w-11 h-11 rounded-xl bg-[#53B175]/10 text-[#53B175] flex items-center justify-center mb-4 group-hover:bg-[#53B175] group-hover:text-white transition-colors">
                                                        <Icon size={20} strokeWidth={2.3} />
                                                    </div>
                                                    <p className="text-[14px] font-[700] text-[#181725] leading-tight">{action.label}</p>
                                                    <p className="text-[11.5px] text-gray-400 font-medium mt-1">{action.sub}</p>
                                                    <ChevronRight size={16} className="absolute top-5 right-5 text-gray-200 group-hover:text-[#53B175] transition-colors" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>

                                {/* Admin Dashboard shortcut on profile home */}
                                {portalItems.length > 0 && (
                                    <section>
                                        <div className="flex items-baseline justify-between mb-3 px-1">
                                            <h3 className="text-[15px] font-[700] text-[#181725]">Platform</h3>
                                            <span className="text-[11px] font-medium text-gray-400">Your workspace</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                                            {portalItems.map((item) => {
                                                const Icon = item.icon;
                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={item.onClick}
                                                        className="group relative text-left bg-white border border-gray-100 rounded-2xl p-5 hover:border-[#53B175]/40 hover:shadow-[0_8px_24px_rgba(83,177,117,0.12)] hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.98] cursor-pointer overflow-hidden"
                                                    >
                                                        <div className="w-11 h-11 rounded-xl bg-[#53B175]/10 text-[#53B175] flex items-center justify-center mb-4 group-hover:bg-[#53B175] group-hover:text-white transition-colors">
                                                            <Icon size={20} strokeWidth={2.3} />
                                                        </div>
                                                        <p className="text-[14px] font-[700] text-[#181725] leading-tight">{item.label}</p>
                                                        <p className="text-[11.5px] text-gray-400 font-medium mt-1 line-clamp-2">{item.desc}</p>
                                                        <ChevronRight size={16} className="absolute top-5 right-5 text-gray-200 group-hover:text-[#53B175] transition-colors" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}

                                {/* Business Account — V2.2 multi-account / multi-outlet management */}
                                {businessAccountItems.length > 0 && (
                                    <section>
                                        <div className="flex items-baseline justify-between mb-3 px-1">
                                            <h3 className="text-[15px] font-[700] text-[#181725]">Business Account</h3>
                                            <span className="text-[11px] font-medium text-gray-400">Outlets · Team · Roles</span>
                                        </div>
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                                            {businessAccountItems.map((item) => {
                                                const Icon = item.icon;
                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={item.onClick}
                                                        className="group relative text-left bg-white border border-gray-100 rounded-2xl p-5 hover:border-[#53B175]/40 hover:shadow-[0_8px_24px_rgba(83,177,117,0.12)] hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.98] cursor-pointer overflow-hidden"
                                                    >
                                                        <div className="w-11 h-11 rounded-xl bg-[#53B175]/10 text-[#53B175] flex items-center justify-center mb-4 group-hover:bg-[#53B175] group-hover:text-white transition-colors">
                                                            <Icon size={20} strokeWidth={2.3} />
                                                        </div>
                                                        <p className="text-[14px] font-[700] text-[#181725] leading-tight">{item.label}</p>
                                                        <p className="text-[11.5px] text-gray-400 font-medium mt-1 line-clamp-2">{item.desc}</p>
                                                        <ChevronRight size={16} className="absolute top-5 right-5 text-gray-200 group-hover:text-[#53B175] transition-colors" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}

                                {/* Account details snapshot — surfaces business info from existing userData */}
                                <section>
                                    <div className="flex items-baseline justify-between mb-3 px-1">
                                        <h3 className="text-[15px] font-[700] text-[#181725]">Account details</h3>
                                        <button onClick={() => setIsEditProfileOpen(true)} className="text-[12px] font-bold text-[#53B175] hover:text-[#469E66] transition-colors cursor-pointer">
                                            Edit
                                        </button>
                                    </div>
                                    <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06)] divide-y divide-gray-50">
                                        <DetailRow icon={Mail} label="Email" value={userData.email || '—'} />
                                        <DetailRow icon={Phone} label="Phone" value={userData.phone || 'Not added'} muted={!userData.phone} />
                                        <DetailRow
                                            icon={Building2}
                                            label="Business"
                                            value={deliverToLabel || userData.businessName || 'Not added'}
                                            muted={!deliverToLabel && !userData.businessName}
                                        />
                                        <DetailRow
                                            icon={MapPin}
                                            label="Default delivery"
                                            value={defaultDeliveryLine || 'No address saved'}
                                            sub={defaultLocation || undefined}
                                            muted={!defaultDeliveryLine}
                                        />
                                    </div>
                                </section>

                            </main>
                        </div>

                    </div>
                </div>
            </div>

            {/* Edit Profile Overlay */}
            <EditProfileOverlay
                isOpen={isEditProfileOpen}
                onClose={() => setIsEditProfileOpen(false)}
                userData={editProfileUserData}
                onSave={async (data) => {
                    const patch: Record<string, string> = {};
                    if (data.fullName) patch.fullName = data.fullName;
                    if (data.businessName) patch.businessName = data.businessName;
                    if (/^\d{6}$/.test(data.pincode)) patch.pincode = data.pincode;
                    // Phone is editable now (10-digit local part; the API normalizes to +91…).
                    if (/^[6-9]\d{9}$/.test(data.phone)) patch.phone = data.phone;

                    const res = await fetch('/api/v1/auth/me', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify(patch),
                    });
                    if (!res.ok) {
                        const json = await res.json().catch(() => null) as
                            | { error?: { message?: string } }
                            | null;
                        throw new Error(
                            json?.error?.message ?? 'Failed to save profile. Please try again.',
                        );
                    }

                    setUserData(prev => ({ ...prev, ...data }));

                    // Mark profile complete when core fields are filled
                    if (data.fullName && data.businessName && /^\d{6}$/.test(data.pincode)) {
                        await fetch('/api/v1/me/profile', { method: 'POST', credentials: 'include' });
                    }

                    // Persist delivery address to primary SavedAddress (same source as navbar Deliver To).
                    const fullAddress = data.address?.trim();
                    if (fullAddress) {
                        const shortAddress = (data.shortAddress || fullAddress.split(',').slice(0, 2).join(', ')).trim();
                        const addressPatch = {
                            businessName: data.businessName?.trim() || undefined,
                            fullAddress,
                            shortAddress,
                            flatInfo: data.address2?.trim() || undefined,
                            pincode: data.pincode?.trim() || undefined,
                            city: data.city?.trim() || undefined,
                            state: data.state?.trim() || undefined,
                            ...(typeof data.latitude === 'number' && typeof data.longitude === 'number'
                                ? { latitude: data.latitude, longitude: data.longitude }
                                : {}),
                            ...(data.placeId ? { placeId: data.placeId } : {}),
                        };
                        const existingId = deliverToAddress?.id
                            ?? primaryAddressId
                            ?? savedAddresses.find((a) => a.isDefault)?.id
                            ?? savedAddresses[0]?.id
                            ?? selectedAddress?.id
                            ?? null;
                        if (existingId) {
                            await updateAddress(existingId, addressPatch);
                        } else if (
                            typeof data.latitude === 'number'
                            && typeof data.longitude === 'number'
                        ) {
                            const created = await addAddress({
                                label: 'Home',
                                isDefault: true,
                                ...addressPatch,
                                latitude: data.latitude,
                                longitude: data.longitude,
                            });
                            if (created) {
                                setPrimaryAddressId(created.id);
                                setSelectedAddress(created);
                            }
                        }
                    }
                }}
            />

            {/* Delivery Addresses Overlay */}
            <SavedAddressesOverlay
                isOpen={isSavedAddressesOpen}
                onClose={() => setIsSavedAddressesOpen(false)}
            />

            {/* Payment Management Overlay */}
            <PaymentManagementOverlay
                isOpen={isPaymentOpen}
                onClose={() => setIsPaymentOpen(false)}
            />

            {/* Notification Overlay */}
            <NotificationOverlay
                isOpen={isNotificationOpen}
                onClose={() => setIsNotificationOpen(false)}
            />

            {/* General Information Overlay */}
            <GeneralInformationOverlay
                isOpen={isGeneralInfoOpen}
                onClose={() => setIsGeneralInfoOpen(false)}
            />

            {/* Settings Overlay */}
            <SettingsOverlay
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                activeBusinessAccountId={activeAccountIdForLinks}
                onBusinessAccountDeleted={() => {
                    window.dispatchEvent(new CustomEvent(ACCOUNTS_REFRESH_EVENT));
                }}
            />

            {/* Become a Vendor Modal — prefer active BA display name over User.businessName */}
            <BecomeVendorModal
                isOpen={isBecomeVendorOpen}
                onClose={() => setIsBecomeVendorOpen(false)}
                defaultBusinessName={
                    (session?.user as {
                        activeBusinessAccountId?: string;
                        availableAccounts?: Array<{ id: string; displayName?: string }>;
                    } | undefined)?.availableAccounts?.find(
                        (a) => a.id === (session?.user as { activeBusinessAccountId?: string } | undefined)?.activeBusinessAccountId,
                    )?.displayName
                    || userData.businessName
                }
                onSubmitted={() => setHasVendorApplication(true)}
            />

            {/* Business Account Overlays */}
            {activeAccountIdForLinks && (
                <>
                    <OutletsOverlay
                        isOpen={isOutletsOpen}
                        onClose={() => setIsOutletsOpen(false)}
                        accountId={activeAccountIdForLinks}
                    />
                    <TeamMembersOverlay
                        isOpen={isTeamOpen}
                        onClose={() => setIsTeamOpen(false)}
                        accountId={activeAccountIdForLinks}
                    />
                    <RolesPermissionsOverlay
                        isOpen={isRolesOpen}
                        onClose={() => setIsRolesOpen(false)}
                        accountId={activeAccountIdForLinks}
                    />
                    <AccountOverviewOverlay
                        isOpen={isOverviewOpen}
                        onClose={() => setIsOverviewOpen(false)}
                        accountId={activeAccountIdForLinks}
                        onOpenOutlets={() => setIsOutletsOpen(true)}
                        onOpenMembers={() => setIsTeamOpen(true)}
                        onOpenRoles={() => setIsRolesOpen(true)}
                        // Hard refresh after a delete — the navbar account
                        // switcher caches /api/v1/account and won't re-fetch
                        // unless we force a reload. Reload also resets any
                        // stale activeBusinessAccountId in case the user
                        // somehow deleted the BA they're viewing from.
                        onDeleted={() => {
                            window.dispatchEvent(new CustomEvent(ACCOUNTS_REFRESH_EVENT));
                        }}
                    />
                </>
            )}
        </>
    );
}
