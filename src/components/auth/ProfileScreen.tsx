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
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
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
    const [creditSummary, setCreditSummary] = useState<{
        totalLimit: number;
        totalAvailable: number;
        totalOutstanding: number;
        hasOverdue: boolean;
        hasWallets: boolean;
    } | null>(null);

    useEffect(() => {
        const openParam = searchParams?.get('open');
        if (!openParam) return;
        Promise.resolve().then(() => {
            if (openParam === 'outlets') setIsOutletsOpen(true);
            else if (openParam === 'team' || openParam === 'team-members' || openParam === 'users') setIsTeamOpen(true);
            else if (openParam === 'roles') setIsRolesOpen(true);
            else if (openParam === 'overview' || openParam === 'account-overview') setIsOverviewOpen(true);
        });
    }, [searchParams]);

    const { data: session, update: updateSession } = useSession();
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
    });

    // Fetch full profile from DB (session only carries name/email/role)
    // Also pull the default saved address to fill address/city fields
    // and the vendor-application status to decide whether to show "Become a vendor".
    //
    // ALSO: detect role drift. If DB says role='vendor' but the cached JWT still
    // says 'customer' (happens when admin approves a vendor application while
    // the user's session is open), force a JWT refresh once so the navbar's
    // Dashboard link and the vendor portal actually become reachable.
    useEffect(() => {
        if (!session?.user) return;
        Promise.all([
            fetch('/api/v1/auth/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
            fetch('/api/v1/addresses', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
            fetch('/api/v1/vendor/application-status', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
            fetch('/api/v1/wallet', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        ])
            .then(([profileJson, addrJson, vendorJson, walletJson]) => {
                if (vendorJson?.success) {
                    Promise.resolve().then(() => setHasVendorApplication(!!vendorJson.data.hasApplication));
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
                    });
                }
                // One-shot role drift fix: DB role > session role?  Refresh JWT.
                // Pass a non-empty payload so NextAuth definitely fires the jwt
                // callback with trigger==='update' (a bare update() can no-op).
                // After ~1.5s, re-check the session and if the role STILL doesn't
                // match the DB, do a hard reload as a last-resort fallback. The
                // hardReloadDoneRef guard makes sure this can't loop.
                const dbRole = profileJson?.success ? profileJson.data?.role : null;
                const sessionRole = (session.user as { role?: string }).role;
                if (dbRole && sessionRole && dbRole !== sessionRole) {
                    const key = `${sessionRole}->${dbRole}`;
                    if (sessionRoleRefreshedRef.current !== key) {
                        sessionRoleRefreshedRef.current = key;
                        Promise.resolve(updateSessionRef.current({ refresh: Date.now() }))
                            .catch(() => { /* silent — fallback below covers it */ })
                            .finally(() => {
                                window.setTimeout(() => {
                                    if (hardReloadDoneRef.current) return;
                                    // Re-fetch the DB role and compare against the latest session.
                                    fetch('/api/v1/auth/me', { credentials: 'include' })
                                        .then(r => r.ok ? r.json() : null)
                                        .then(latest => {
                                            const freshDbRole = latest?.success ? latest.data?.role : null;
                                            // Read from the live session object captured by closure — by
                                            // 1.5s the React tree will have re-rendered if update() worked.
                                            const stillSessionRole = (session.user as { role?: string }).role;
                                            if (freshDbRole && stillSessionRole && freshDbRole !== stillSessionRole) {
                                                hardReloadDoneRef.current = true;
                                                window.location.reload();
                                            }
                                        })
                                        .catch(() => { /* network blip — leave UI as-is */ });
                                }, 1500);
                            });
                    }
                }
                const p = profileJson?.success ? profileJson.data : null;
                const addresses = addrJson?.success ? addrJson.data : [];
                const defaultAddr = addresses?.[0]; // already sorted by isDefault desc, then createdAt desc
                setUserData(prev => ({
                    ...prev,
                    fullName: p?.fullName || prev.fullName || '',
                    phone: p?.phone || '',
                    businessName: p?.businessName || '',
                    email: p?.email || '',
                    pincode: p?.pincode || defaultAddr?.pincode || '',
                    image: p?.image || '',
                    address: defaultAddr?.shortAddress || defaultAddr?.fullAddress || '',
                    address2: defaultAddr?.flatInfo || defaultAddr?.landmark || '',
                    city: defaultAddr?.city || '',
                }));
            })
            .catch(() => {});
    }, [session]);

    if (!isOpen) return null;

    const handleLogout = async () => {
        await signOut({ redirect: false });
        // Clear user-scoped caches so the next user on this browser doesn't inherit them
        try {
            localStorage.removeItem('horeca_order_lists_all');
            localStorage.removeItem('horeca_orders');
            localStorage.removeItem('horeca_recently_viewed');
        } catch { /* ignore quota / privacy-mode errors */ }
        toast.success('Logged out successfully');
        onClose();
        window.location.href = '/';
    };

    // Four primary actions for B2B procurement landing — uniform brand styling
    // (no per-tile color pastels) to keep the dashboard feeling enterprise, not consumer.
    const primaryActions = [
        { id: 'reorder', label: 'Reorder', sub: 'From last order', icon: RotateCcw, onClick: () => router.push('/orders') },
        { id: 'quick-order', label: 'Quick Order', sub: 'Saved order lists', icon: ListOrdered, onClick: () => router.push('/order-lists') },
        { id: 'my-vendors', label: 'My Vendors', sub: 'Saved suppliers', icon: Store, onClick: () => router.push('/vendors') },
        { id: 'orders', label: 'Your Orders', sub: 'Track & history', icon: ShoppingBag, onClick: () => router.push('/orders') },
    ];

    const yourInfoItems = [
        { id: 'edit-profile', label: 'Edit Profile', desc: 'Update your personal details', icon: Pencil, onClick: () => setIsEditProfileOpen(true) },
        { id: 'saved-addresses', label: 'Delivery Addresses', desc: 'Manage delivery locations', icon: MapPin, onClick: () => setIsSavedAddressesOpen(true) },
        { id: 'payment', label: 'Payment Management', desc: 'Cards, UPI & banking', icon: CreditCard, onClick: () => setIsPaymentOpen(true) },
        {
            id: 'credit-wallet',
            label: 'Credit & Wallets',
            desc: creditSummary
                ? creditSummary.hasWallets
                    ? creditSummary.totalOutstanding > 0 
                        ? `Outstanding: ₹${creditSummary.totalOutstanding.toLocaleString('en-IN')} · Pay dues` 
                        : `Available: ₹${creditSummary.totalAvailable.toLocaleString('en-IN')} of ₹${creditSummary.totalLimit.toLocaleString('en-IN')}`
                    : 'No credit limit assigned yet'
                : 'Manage outstanding balances and pay dues',
            icon: CreditCard,
            onClick: () => {
                onClose();
                router.push('/wallet');
            }
        }
    ];

    // Business Account management (V2.2) — only show when the user has an active account
    // resolved on the session. Each card jumps straight into the matching tab on
    // /account/[id]/... so this profile screen acts as the customer's dashboard.
    const activeAccountIdForLinks = (session?.user as { activeBusinessAccountId?: string } | undefined)?.activeBusinessAccountId;
    // Roles & Permissions used to be its own sidebar entry; folded into the
    // Team page's "Manage Roles" button so there's one entry per concept.
    // RolesPermissionsOverlay still mounts below for the ?open=roles deep-link
    // fallback, but isn't surfaced as a top-level item.
    // Gate each card by the perms attached to the current session so a teammate
    // with view-only Orders doesn't see Outlets or Team Members in the sidebar.
    const sessionPerms = (session?.user as { permissions?: string[] } | undefined)?.permissions ?? [];
    const canSeeOutlets = sessionPerms.includes('outlets.view');
    const canSeeTeam = sessionPerms.some(p => p.startsWith('users.'));
    const businessAccountItems = activeAccountIdForLinks ? [
        ...(canSeeOutlets ? [{ id: 'outlets', label: 'Outlets', desc: 'Delivery locations & branches', icon: MapPin, onClick: () => setIsOutletsOpen(true) }] : []),
        ...(canSeeTeam ? [{ id: 'team-members', label: 'Team Members', desc: 'Invite users, manage roles & access', icon: Users, onClick: () => router.push('/profile/team') }] : []),
        { id: 'account-overview', label: 'Account Overview', desc: 'GST, business type, members', icon: Building2, onClick: () => setIsOverviewOpen(true) },
    ] : [];

    const otherInfoItems = [
        { id: 'notifications', label: 'Notification', desc: 'Push & email preferences', icon: Bell, onClick: () => setIsNotificationOpen(true) },
        { id: 'general', label: 'General Information', desc: 'About, terms & policies', icon: Info, onClick: () => setIsGeneralInfoOpen(true) },
        { id: 'settings', label: 'Settings', desc: 'Language, theme & more', icon: Settings, onClick: () => setIsSettingsOpen(true) },
        { id: 'support', label: 'Help & Support', desc: 'Reach our team', icon: HelpCircle, onClick: () => router.push('/contact') },
    ];

    const isProfileComplete = !!(userData.fullName && userData.businessName && userData.pincode);
    const defaultLocation = [userData.city, userData.pincode].filter(Boolean).join(' · ');
    const sessionRole = (session?.user as { role?: string } | undefined)?.role;
    // Show the "Become a vendor" CTA only for customers who haven't yet applied.
    // Admins, brands, and existing vendors (pending or approved) all skip it.
    const showBecomeVendorCta = hasVendorApplication === false && sessionRole !== 'admin' && sessionRole !== 'brand' && sessionRole !== 'vendor';

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
                                        <h3 className="text-[16px] font-[700] text-[#181725] truncate">{userData.fullName || 'Welcome'}</h3>
                                        {isProfileComplete && <BadgeCheck size={15} className="text-[#53B175] shrink-0" />}
                                    </div>
                                    <p className="text-[12px] text-gray-400 font-medium truncate">{userData.email}</p>
                                    {userData.businessName && (
                                        <span className="inline-flex items-center mt-1 text-[10px] font-bold text-[#53B175] bg-[#53B175]/10 border border-[#53B175]/15 px-2 py-0.5 rounded-full max-w-full truncate">
                                            {userData.businessName}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Mobile Credit Card summary */}
                            {creditSummary && creditSummary.hasWallets && (
                                <div className="mb-4 bg-gradient-to-br from-[#1b5e3a] to-[#2e7d32] text-white rounded-2xl p-5 shadow-md relative overflow-hidden">
                                    <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
                                        <CreditCard size={120} strokeWidth={1} />
                                    </div>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider text-emerald-200 font-bold">Horeca1 Credit Wallet</p>
                                            <h3 className="text-[20px] font-black mt-1">₹{creditSummary.totalAvailable.toLocaleString('en-IN')}</h3>
                                            <p className="text-[10px] text-emerald-100/80 mt-0.5">Available of ₹{creditSummary.totalLimit.toLocaleString('en-IN')} limit</p>
                                        </div>
                                        {creditSummary.totalOutstanding > 0 && (
                                            <span className={cn(
                                                "px-2.5 py-1 rounded-full text-[10px] font-bold border",
                                                creditSummary.hasOverdue 
                                                    ? "bg-red-500/20 text-red-100 border-red-400/30 animate-pulse" 
                                                    : "bg-amber-500/20 text-amber-100 border-amber-400/30"
                                            )}>
                                                {creditSummary.hasOverdue ? 'Overdue' : 'Outstanding'}
                                            </span>
                                        )}
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="mt-4">
                                        <div className="w-full bg-[#144228] rounded-full h-1.5 overflow-hidden">
                                            <div 
                                                className="bg-emerald-400 h-full rounded-full transition-all duration-500" 
                                                style={{ width: `${(creditSummary.totalAvailable / (creditSummary.totalLimit || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-emerald-700/40 flex justify-between items-center">
                                        <div>
                                            <p className="text-[9px] text-emerald-200/80 uppercase font-bold">Outstanding</p>
                                            <p className="text-[13px] font-bold">₹{creditSummary.totalOutstanding.toLocaleString('en-IN')}</p>
                                        </div>
                                        <button 
                                            onClick={() => { onClose(); router.push('/wallet'); }}
                                            className="bg-white text-[#1b5e3a] hover:bg-emerald-50 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-sm"
                                        >
                                            {creditSummary.totalOutstanding > 0 ? 'Repay Now' : 'View Details'}
                                        </button>
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
                            {(userData.phone || userData.businessName || userData.address || defaultLocation) && (
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
                                        {userData.businessName && (
                                            <div className="flex items-center gap-3 px-4 py-3">
                                                <Building2 size={15} className="text-gray-400 shrink-0" />
                                                <span className="text-[13px] font-[600] text-[#181725] truncate">{userData.businessName}</span>
                                            </div>
                                        )}
                                        {(userData.address || defaultLocation) && (
                                            <div className="flex items-start gap-3 px-4 py-3">
                                                <MapPin size={15} className="text-gray-400 shrink-0 mt-0.5" />
                                                <div className="text-[13px] font-[600] text-[#181725]">
                                                    {userData.address && <p className="truncate">{userData.address}</p>}
                                                    {defaultLocation && <p className="text-[11px] text-gray-400 font-medium">{defaultLocation}</p>}
                                                </div>
                                            </div>
                                        )}
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
                                            <h3 className="text-[15px] font-[700] text-[#181725] truncate">{userData.fullName || 'Welcome'}</h3>
                                            {isProfileComplete && <BadgeCheck size={14} className="text-[#53B175] shrink-0" />}
                                        </div>
                                        <p className="text-[11.5px] text-gray-400 font-medium mt-0.5 truncate max-w-full">{userData.email}</p>
                                        {userData.businessName && (
                                            <span className="mt-2 inline-flex items-center text-[10.5px] font-bold text-[#53B175] bg-[#53B175]/10 border border-[#53B175]/15 px-2.5 py-0.5 rounded-full max-w-full truncate">
                                                {userData.businessName}
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
                                        <h2 className="text-[22px] lg:text-[26px] font-black text-[#181725] leading-tight truncate">
                                            {userData.fullName ? `Hi, ${userData.fullName.split(' ')[0]}` : 'Hi there'}
                                        </h2>
                                        <p className="text-[13px] text-gray-500 mt-1.5 truncate">
                                            {userData.businessName
                                                ? `Manage ${userData.businessName}'s procurement from one place.`
                                                : 'Manage your procurement from one place.'}
                                        </p>
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

                                {/* Desktop Credit Card summary */}
                                {creditSummary && creditSummary.hasWallets && (
                                    <div className="bg-gradient-to-r from-[#1b5e3a] via-[#246c43] to-[#2e7d32] text-white rounded-2xl p-6 shadow-md relative overflow-hidden border border-emerald-800/20">
                                        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
                                            <CreditCard size={180} strokeWidth={1} />
                                        </div>
                                        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                            <div className="flex-1 space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <span className="p-2 rounded-xl bg-white/10 text-white shrink-0">
                                                        <CreditCard size={20} />
                                                    </span>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider text-emerald-200 font-bold">Credit Wallet Summary</p>
                                                        <h3 className="text-[22px] font-black leading-tight mt-0.5">₹{creditSummary.totalAvailable.toLocaleString('en-IN')} Available</h3>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-3 gap-4 max-w-md pt-1">
                                                    <div>
                                                        <p className="text-[10px] text-emerald-200/80 font-semibold">Total Limit</p>
                                                        <p className="text-[16px] font-bold">₹{creditSummary.totalLimit.toLocaleString('en-IN')}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-emerald-200/80 font-semibold">Outstanding</p>
                                                        <p className="text-[16px] font-bold text-emerald-100">₹{creditSummary.totalOutstanding.toLocaleString('en-IN')}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-emerald-200/80 font-semibold">Status</p>
                                                        <span className={cn(
                                                            "inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase border",
                                                            creditSummary.hasOverdue 
                                                                ? "bg-red-500/20 text-red-100 border-red-400/30 animate-pulse" 
                                                                : "bg-emerald-500/20 text-emerald-100 border-emerald-400/30"
                                                        )}>
                                                            {creditSummary.hasOverdue ? 'Overdue Dues' : 'Healthy'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Progress Bar */}
                                                <div className="w-full bg-[#144228] rounded-full h-2 overflow-hidden max-w-md">
                                                    <div 
                                                        className="bg-emerald-400 h-full rounded-full transition-all duration-500" 
                                                        style={{ width: `${(creditSummary.totalAvailable / (creditSummary.totalLimit || 1)) * 100}%` }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex sm:flex-col items-stretch gap-2 shrink-0">
                                                <button
                                                    onClick={() => { onClose(); router.push('/wallet'); }}
                                                    className="bg-white text-[#1b5e3a] hover:bg-emerald-50 text-[13px] font-black px-6 py-3 rounded-xl transition-all shadow-sm hover:shadow active:scale-[0.98] duration-150 cursor-pointer text-center"
                                                >
                                                    {creditSummary.totalOutstanding > 0 ? 'Pay Overdue Dues' : 'Manage Credit'}
                                                </button>
                                                <button
                                                    onClick={() => { onClose(); router.push('/wallet'); }}
                                                    className="bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[12px] font-bold px-6 py-2 rounded-xl transition-all active:scale-[0.98] duration-150 cursor-pointer text-center"
                                                >
                                                    View Statement
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
                                                    Want to sell on Horeca1? Become a vendor.
                                                </p>
                                                <p className="text-[12px] text-emerald-800/70 mt-0.5">
                                                    Keep your account — just unlock the vendor portal. Admin reviews in ~24h.
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
                                        <DetailRow icon={Building2} label="Business" value={userData.businessName || 'Not added'} muted={!userData.businessName} />
                                        <DetailRow
                                            icon={MapPin}
                                            label="Default delivery"
                                            value={userData.address || 'No address saved'}
                                            sub={defaultLocation || undefined}
                                            muted={!userData.address}
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
                userData={userData}
                onSave={async (data) => {
                    setUserData(prev => ({ ...prev, ...data }));
                    try {
                        const patch: Record<string, string> = {};
                        if (data.fullName) patch.fullName = data.fullName;
                        if (data.businessName) patch.businessName = data.businessName;
                        if (/^\d{6}$/.test(data.pincode)) patch.pincode = data.pincode;
                        // Phone is editable now (10-digit local part; the API normalizes to +91…).
                        if (/^[6-9]\d{9}$/.test(data.phone)) patch.phone = data.phone;
                        await fetch('/api/v1/auth/me', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify(patch),
                        });
                        // Mark profile complete when core fields are filled
                        if (data.fullName && data.businessName && /^\d{6}$/.test(data.pincode)) {
                            await fetch('/api/v1/me/profile', { method: 'POST', credentials: 'include' });
                        }
                    } catch { /* silent — local state already updated */ }
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
            />

            {/* Become a Vendor Modal */}
            <BecomeVendorModal
                isOpen={isBecomeVendorOpen}
                onClose={() => setIsBecomeVendorOpen(false)}
                defaultBusinessName={userData.businessName}
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
                        onDeleted={() => { window.location.reload(); }}
                    />
                </>
            )}
        </>
    );
}
