'use client';

import React, { useState, useEffect } from 'react';
import {
    Mail,
    Phone,
    CheckCircle2,
    XCircle,
    Package,
    ListOrdered,
    Shield,
    Building2,
    Star,
    FileText,
    Calendar,
    Loader2,
    AlertCircle,
    Power,
    Pencil,
    Save,
    X,
    Wallet,
    Copy,
    Check,
    LayoutDashboard,
    Users,
    SlidersHorizontal,
    MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AdminAccountTeamPanel } from '@/components/features/admin/AdminAccountTeamPanel';
import {
    AdminEntityDetailHeader,
    AdminEntityStatsRow,
    AdminImpersonateButton,
    AdminStatusBadge,
    AdminLoginCredentialsPanel,
    AdminEntityHeroCard,
    AdminEntityContactGrid,
    AdminEntityTabBar,
    AdminEntityTabPanel,
    AdminEntityTabContent,
    AdminRegistryLoadingState,
} from '@/components/features/admin/entity';

interface VendorProfile {
    id: string;
    businessName: string;
    isVerified: boolean;
    isActive: boolean;
    rating: number | null;
}

interface UserData {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    role: 'customer' | 'vendor' | 'admin';
    businessName: string | null;
    gstNumber: string | null;
    pincode: string | null;
    image: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    adminPassword?: string | null;
    vendor: VendorProfile | null;
    accountMemberships?: Array<{
        isPrimary: boolean;
        businessAccount: {
            id: string;
            legalName: string | null;
            displayName: string | null;
            gstin: string | null;
            pan: string | null;
            fssaiNumber: string | null;
            billingAddressLine: string | null;
            billingCity: string | null;
            billingState: string | null;
            billingPincode: string | null;
            businessType: string | null;
            subType: string | null;
            cuisine: string | null;
            businessSize: string | null;
            businessStructure: string | null;
            serviceModel: string | null;
            monthlyPurchaseBand: string | null;
            procurementFrequency: string | null;
            designation: string | null;
            leadStatus: string | null;
            creditType: string | null;
        };
    }>;
    creditWallets?: Array<{
        id: string;
        vendorId: string | null;
        vendor: { businessName: string } | null;
        status: 'ACTIVE' | 'BLOCKED' | 'BLACKLISTED';
        creditLimit: number | string;
        availableCredit: number | string;
        outstandingAmount: number | string;
        currentDueDate: string | null;
    }>;
    _count: {
        orders: number;
        quickOrderLists: number;
    };
}

const INR = (v: number | string) =>
    `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function getWalletStatusStyles(status: string) {
    switch (status) {
        case 'ACTIVE':
            return 'bg-[#EEF8F1] text-[#299E60]';
        case 'BLOCKED':
            return 'bg-amber-50 text-amber-600';
        case 'BLACKLISTED':
            return 'bg-red-50 text-red-500';
        default:
            return 'bg-gray-50 text-gray-600';
    }
}

function formatDateIndian(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function truncateId(id: string): string {
    if (id.length <= 12) return id;
    return id.slice(0, 6) + '...' + id.slice(-4);
}

function getRoleBadgeStyles(role: string) {
    switch (role) {
        case 'admin':
            return 'bg-purple-50 text-purple-700';
        case 'vendor':
            return 'bg-blue-50 text-blue-700';
        default:
            return 'bg-[#EEF8F1] text-[#299E60]';
    }
}

export default function CustomerDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params.id as string;

    const [user, setUser] = useState<UserData | null>(null);
    const [ownerPassword, setOwnerPassword] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toggling, setToggling] = useState(false);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'business' | 'credit' | 'team'>('overview');
    const [draft, setDraft] = useState<{
        fullName: string; email: string; phone: string;
        businessName: string; gstNumber: string; pincode: string;
        // P0-4 master-datasheet attributes (BusinessAccount companyProfile).
        cp: Record<string, string>;
    }>({ fullName: '', email: '', phone: '', businessName: '', gstNumber: '', pincode: '', cp: {} });

    useEffect(() => {
        async function fetchUser() {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(`/api/v1/admin/users/${userId}`);
                if (!res.ok) {
                    throw new Error(`Failed to fetch user (${res.status})`);
                }
                const json = await res.json();
                if (!json.success) {
                    throw new Error(json.message || 'Failed to fetch user');
                }
                setUser(json.data);
                setOwnerPassword(json.data.adminPassword ?? null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unexpected error occurred');
            } finally {
                setLoading(false);
            }
        }

        if (userId) {
            fetchUser();
        }
    }, [userId]);

    function startEdit() {
        if (!user) return;
        const ba = user.accountMemberships?.find((m) => m.isPrimary)?.businessAccount;
        setDraft({
            fullName: user.fullName || '',
            email: user.email || '',
            phone: user.phone || '',
            businessName: user.businessName || '',
            gstNumber: user.gstNumber || '',
            pincode: user.pincode || '',
            cp: {
                pan: ba?.pan || '', fssaiNumber: ba?.fssaiNumber || '',
                billingAddressLine: ba?.billingAddressLine || '', billingCity: ba?.billingCity || '',
                billingState: ba?.billingState || '', billingPincode: ba?.billingPincode || '',
                businessType: ba?.businessType || '', subType: ba?.subType || '',
                cuisine: ba?.cuisine || '', businessSize: ba?.businessSize || '',
                businessStructure: ba?.businessStructure || '', serviceModel: ba?.serviceModel || '',
                monthlyPurchaseBand: ba?.monthlyPurchaseBand || '', procurementFrequency: ba?.procurementFrequency || '',
                designation: ba?.designation || '', leadStatus: ba?.leadStatus || '', creditType: ba?.creditType || '',
            },
        });
        setEditing(true);
    }

    async function handleSave() {
        if (!user || saving) return;
        setSaving(true);
        try {
            const payload: Record<string, string> = {
                fullName: draft.fullName.trim(),
                email: draft.email.trim(),
                phone: (() => { const d = draft.phone.replace(/\D/g, ''); return d.length === 12 ? d.replace(/^91/, '') : d; })(),
                businessName: draft.businessName.trim(),
                gstNumber: draft.gstNumber.trim(),
                pincode: draft.pincode.trim(),
            };
            const companyProfile: Record<string, string> = {};
            for (const [k, v] of Object.entries(draft.cp)) companyProfile[k] = v.trim();
            const res = await fetch(`/api/v1/admin/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, companyProfile }),
            });
            const json = await res.json();
            if (!json.success) {
                throw new Error(json.error?.message || json.error || 'Failed to save');
            }
            setUser(prev => prev ? { ...prev, ...json.data } : prev);
            setEditing(false);
            toast.success('Customer updated');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update');
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleActive() {
        if (!user || toggling) return;
        try {
            setToggling(true);
            const res = await fetch(`/api/v1/admin/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !user.isActive }),
            });
            if (!res.ok) {
                throw new Error(`Failed to update user (${res.status})`);
            }
            const json = await res.json();
            if (json.success) {
                setUser((prev) => prev ? { ...prev, isActive: !prev.isActive } : prev);
            } else {
                throw new Error(json.message || 'Failed to update user');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update user status');
        } finally {
            setToggling(false);
        }
    }

    if (loading) {
        return <AdminRegistryLoadingState message="Loading customer details..." />;
    }

    if (error || !user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <AlertCircle className="w-12 h-12 text-red-400" />
                <p className="text-[16px] font-bold text-[#4B4B4B]">{error || 'User not found'}</p>
                <button
                    onClick={() => router.back()}
                    className="px-4 py-2 bg-[#299E60] text-white rounded-xl text-[14px] font-bold hover:bg-[#238a53] transition-colors"
                >
                    Go Back
                </button>
            </div>
        );
    }

    const avatarUrl = user.image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.fullName)}`;
    const primaryBa = user.accountMemberships?.find((m) => m.isPrimary)?.businessAccount;
    const creditWalletCount = user.creditWallets?.length ?? 0;

    const stats = [
        { label: 'Total Orders', value: user._count.orders, icon: Package, color: '#299E60' },
        { label: 'Order Lists', value: user._count.quickOrderLists, icon: ListOrdered, color: '#F59E0B' },
        { label: 'Credit Lines', value: creditWalletCount, icon: Wallet, color: '#3B82F6' },
        { label: 'Member Since', value: formatDateIndian(user.createdAt), icon: Calendar, color: '#8B5CF6' },
    ];

    const tabs = [
        { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
        { id: 'business' as const, label: 'Business Profile', icon: Building2 },
        { id: 'credit' as const, label: 'Credit & Orders', icon: Wallet },
        { id: 'team' as const, label: 'Team', icon: Users },
    ];

    return (
        <div className="space-y-6 pb-12 px-4 md:px-0">
            <AdminEntityDetailHeader
                onBack={() => router.back()}
                breadcrumbs={[
                    { label: 'Customers Registry', href: '/admin/customers' },
                    { label: user.fullName },
                ]}
                actions={
                    <>
                        {user.role !== 'admin' && (
                            <AdminImpersonateButton
                                target="customer"
                                entityId={user.id}
                                label="Impersonate"
                            />
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                if (editing) {
                                    setEditing(false);
                                } else {
                                    startEdit();
                                    setActiveTab('business');
                                }
                            }}
                            className={cn(
                                'h-[38px] px-4 rounded-[10px] text-[12px] font-bold border active:scale-97 transition-all flex items-center gap-1.5 shadow-sm',
                                editing
                                    ? 'bg-[#EF4444] border-[#EF4444] text-white hover:bg-[#DC2626]'
                                    : 'bg-white border-[#D1D5DB] text-[#374151] hover:bg-[#F9FAFB]',
                            )}
                        >
                            <Pencil size={13} />
                            {editing ? 'Cancel Editing' : 'Edit Details'}
                        </button>
                    </>
                }
            />

            {editing && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[12px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-2.5 text-[14px] font-bold text-[#B45309]">
                        <AlertCircle size={18} className="shrink-0" />
                        Editing mode is on. Update fields in Business Profile and press Save.
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button type="button" onClick={() => setEditing(false)} disabled={saving}
                            className="px-4 py-1.5 bg-white border border-[#D1D5DB] text-[#374151] rounded-[8px] text-[12px] font-bold">
                            Cancel
                        </button>
                        <button type="button" onClick={handleSave} disabled={saving}
                            className="px-4 py-1.5 bg-[#299E60] text-white rounded-[8px] text-[12px] font-bold flex items-center gap-1.5 disabled:opacity-50">
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            Save Changes
                        </button>
                    </div>
                </div>
            )}

            <AdminEntityHeroCard
                avatar={
                    <div className="w-[140px] h-[140px] rounded-[16px] bg-[#F9FAFB] border border-[#E5E7EB] overflow-hidden shadow-inner flex items-center justify-center">
                        <img src={avatarUrl} alt={user.fullName} className="w-full h-full object-cover" />
                    </div>
                }
                avatarFooter={
                    <AdminStatusBadge variant={user.isActive ? 'active' : 'inactive'} label={user.isActive ? 'Active' : 'Inactive'} />
                }
                title={user.fullName}
                badges={
                    <span className={cn('text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider border capitalize', getRoleBadgeStyles(user.role))}>
                        {user.role}
                    </span>
                }
                subtitle={
                    user.businessName ? (
                        <p className="text-[13px] text-[#6B7280] font-medium mt-2">{user.businessName}</p>
                    ) : undefined
                }
                contact={
                    <AdminEntityContactGrid
                        accent="#299E60"
                        accentBg="#EEF8F1"
                        items={[
                            { icon: Mail, label: 'Email', value: user.email || '—' },
                            { icon: Phone, label: 'Phone', value: user.phone || '—' },
                        ]}
                    />
                }
            />

            <AdminEntityStatsRow stats={stats} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left/Middle Column: Tab panels */}
                <div className="lg:col-span-8 space-y-6">
                    <AdminEntityTabPanel>
                        <AdminEntityTabBar
                            activeTab={activeTab}
                            onTabChange={(id) => setActiveTab(id as typeof activeTab)}
                            tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon }))}
                        />
                        <AdminEntityTabContent>
                            {activeTab === 'overview' && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-[#F9FAFB] p-6 rounded-[14px] border border-[#F0F2F5]">
                                        <div className="flex items-center gap-4">
                                            <div className="w-11 h-11 rounded-[10px] bg-[#EAF7EF] flex items-center justify-center text-[#299E60]">
                                                <Calendar size={20} />
                                            </div>
                                            <div>
                                                <p className="text-[12px] font-bold text-[#7C7C7C]">Account Created</p>
                                                <p className="text-[14px] font-bold text-[#181725]">{formatDateIndian(user.createdAt)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="w-11 h-11 rounded-[10px] bg-[#EAF7EF] flex items-center justify-center text-[#299E60]">
                                                <FileText size={20} />
                                            </div>
                                            <div>
                                                <p className="text-[12px] font-bold text-[#7C7C7C]">Last Updated</p>
                                                <p className="text-[14px] font-bold text-[#181725]">{formatDateIndian(user.updatedAt)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    {user.vendor && (
                                        <div className="rounded-[14px] border border-[#D1D5DB] p-5 bg-white">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="font-bold text-[16px] flex items-center gap-2">
                                                    <Building2 size={18} className="text-[#299E60]" />
                                                    Linked Vendor Profile
                                                </h3>
                                                <AdminStatusBadge variant={user.vendor.isVerified ? 'verified' : 'pending'} />
                                            </div>
                                            <p className="text-[14px] font-bold text-[#181725]">{user.vendor.businessName}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'business' && (
                                <div className="space-y-6">
                                    {editing ? (
                                        <div className="bg-white rounded-[20px] border border-[#D1D5DB] p-6 shadow-sm">
                                            <h3 className="font-extrabold text-[15px] text-[#181725] mb-4">Edit Profile Details</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <EditField label="Full Name">
                                                    <input value={draft.fullName} onChange={e => setDraft(d => ({ ...d, fullName: e.target.value }))}
                                                        className="w-full h-[40px] px-3 border border-[#D1D5DB] rounded-[8px] text-[13px] outline-none focus:border-[#299E60] font-semibold bg-[#F9FAFB] focus:bg-white transition-all" />
                                                </EditField>
                                                <EditField label="Email">
                                                    <input type="email" value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
                                                        className="w-full h-[40px] px-3 border border-[#D1D5DB] rounded-[8px] text-[13px] outline-none focus:border-[#299E60] font-semibold bg-[#F9FAFB] focus:bg-white transition-all" />
                                                </EditField>
                                                <EditField label="Phone">
                                                    <input type="tel" inputMode="numeric" maxLength={10}
                                                        value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                                        className="w-full h-[40px] px-3 border border-[#D1D5DB] rounded-[8px] text-[13px] outline-none focus:border-[#299E60] font-semibold bg-[#F9FAFB] focus:bg-white transition-all" />
                                                </EditField>
                                                <EditField label="Pincode">
                                                    <input value={draft.pincode} onChange={e => setDraft(d => ({ ...d, pincode: e.target.value }))}
                                                        className="w-full h-[40px] px-3 border border-[#D1D5DB] rounded-[8px] text-[13px] outline-none focus:border-[#299E60] font-semibold bg-[#F9FAFB] focus:bg-white transition-all" />
                                                </EditField>
                                                <EditField label="Business name">
                                                    <input value={draft.businessName} onChange={e => setDraft(d => ({ ...d, businessName: e.target.value }))}
                                                        className="w-full h-[40px] px-3 border border-[#D1D5DB] rounded-[8px] text-[13px] outline-none focus:border-[#299E60] font-semibold bg-[#F9FAFB] focus:bg-white transition-all" />
                                                </EditField>
                                                <EditField label="GST number">
                                                    <input value={draft.gstNumber} onChange={e => setDraft(d => ({ ...d, gstNumber: e.target.value }))}
                                                        className="w-full h-[40px] px-3 border border-[#D1D5DB] rounded-[8px] text-[13px] outline-none focus:border-[#299E60] font-semibold bg-[#F9FAFB] focus:bg-white transition-all" />
                                                </EditField>
                                                {([
                                                    ['pan', 'PAN'], ['fssaiNumber', 'FSSAI'],
                                                    ['billingAddressLine', 'Billing address'], ['billingCity', 'Billing city'],
                                                    ['billingState', 'Billing state'], ['billingPincode', 'Billing pincode'],
                                                    ['businessType', 'Business type'], ['subType', 'Sub-type'],
                                                    ['cuisine', 'Cuisine / category'], ['businessSize', 'Business size'],
                                                    ['businessStructure', 'Business structure'], ['serviceModel', 'Service model'],
                                                    ['monthlyPurchaseBand', 'Monthly purchase band'], ['procurementFrequency', 'Procurement frequency'],
                                                    ['designation', 'Designation'], ['leadStatus', 'Lead status'], ['creditType', 'Credit type'],
                                                ] as [string, string][]).map(([key, label]) => (
                                                    <EditField key={key} label={label}>
                                                        <input value={draft.cp[key] ?? ''} onChange={e => setDraft(d => ({ ...d, cp: { ...d.cp, [key]: e.target.value } }))}
                                                            className="w-full h-[40px] px-3 border border-[#D1D5DB] rounded-[8px] text-[13px] outline-none focus:border-[#299E60] font-semibold bg-[#F9FAFB] focus:bg-white transition-all" />
                                                    </EditField>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-6 animate-in fade-in duration-300">
                                            {/* Personal Info Grid */}
                                            <div className="bg-white rounded-[20px] border border-[#D1D5DB] p-6 shadow-sm">
                                                <h3 className="font-extrabold text-[15px] text-[#181725] mb-4 border-b pb-2.5 flex items-center gap-2">
                                                    <Users size={16} className="text-[#299E60]" />
                                                    Personal Information
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                    <InfoCardField label="Full Name" value={user.fullName} />
                                                    <InfoCardField label="Email" value={user.email} copyable />
                                                    <InfoCardField label="Phone" value={user.phone} copyable />
                                                    <InfoCardField label="Joined Date" value={formatDateIndian(user.createdAt)} />
                                                    <InfoCardField label="Pincode" value={user.pincode} />
                                                </div>
                                            </div>

                                            {/* Company Profile Info */}
                                            <div className="bg-white rounded-[20px] border border-[#D1D5DB] p-6 shadow-sm">
                                                <h3 className="font-extrabold text-[15px] text-[#181725] mb-4 border-b pb-2.5 flex items-center gap-2">
                                                    <Building2 size={16} className="text-[#299E60]" />
                                                    Company Registration Details
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                    <InfoCardField label="Business Name" value={user.businessName || primaryBa?.displayName || primaryBa?.legalName} />
                                                    <InfoCardField label="GSTIN / GST Number" value={user.gstNumber || primaryBa?.gstin} copyable />
                                                    <InfoCardField label="FSSAI License Number" value={primaryBa?.fssaiNumber} copyable />
                                                    <InfoCardField label="PAN Card" value={primaryBa?.pan} copyable />
                                                    <InfoCardField label="Designation" value={primaryBa?.designation} />
                                                    <InfoCardField label="Lead Status" value={primaryBa?.leadStatus} />
                                                </div>
                                            </div>

                                            {/* Billing & Address */}
                                            <div className="bg-white rounded-[20px] border border-[#D1D5DB] p-6 shadow-sm">
                                                <h3 className="font-extrabold text-[15px] text-[#181725] mb-4 border-b pb-2.5 flex items-center gap-2">
                                                    <MapPin size={16} className="text-[#299E60]" />
                                                    Billing Address & Location
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                    <div className="sm:col-span-2">
                                                        <InfoCardField label="Billing Address" value={primaryBa?.billingAddressLine} />
                                                    </div>
                                                    <InfoCardField label="Billing City" value={primaryBa?.billingCity} />
                                                    <InfoCardField label="Billing State" value={primaryBa?.billingState} />
                                                    <InfoCardField label="Billing Pincode" value={primaryBa?.billingPincode} />
                                                </div>
                                            </div>

                                            {/* Business Profile Details */}
                                            <div className="bg-white rounded-[20px] border border-[#D1D5DB] p-6 shadow-sm">
                                                <h3 className="font-extrabold text-[15px] text-[#181725] mb-4 border-b pb-2.5 flex items-center gap-2">
                                                    <SlidersHorizontal size={16} className="text-[#299E60]" />
                                                    Business Profile Attributes
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                    <InfoCardField label="Business Type" value={primaryBa?.businessType} />
                                                    <InfoCardField label="Sub Type" value={primaryBa?.subType} />
                                                    <InfoCardField label="Cuisine / Category" value={primaryBa?.cuisine} />
                                                    <InfoCardField label="Business Size" value={primaryBa?.businessSize} />
                                                    <InfoCardField label="Business Structure" value={primaryBa?.businessStructure} />
                                                    <InfoCardField label="Service Model" value={primaryBa?.serviceModel} />
                                                    <InfoCardField label="Monthly Purchase Band" value={primaryBa?.monthlyPurchaseBand} />
                                                    <InfoCardField label="Procurement Frequency" value={primaryBa?.procurementFrequency} />
                                                    <InfoCardField label="Credit Type" value={primaryBa?.creditType} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'credit' && (
                                <div className="space-y-6">
                                    <AdminEntityStatsRow
                                        stats={[
                                            { label: 'Total Orders', value: user._count.orders, icon: Package, color: '#299E60' },
                                            { label: 'Quick Order Lists', value: user._count.quickOrderLists, icon: ListOrdered, color: '#F59E0B' },
                                        ]}
                                    />
                                    {user.creditWallets && user.creditWallets.length > 0 ? (
                                        <div className="divide-y divide-[#D1D5DB] border border-[#D1D5DB] rounded-[14px] overflow-hidden bg-white">
                                            {user.creditWallets.map((w) => (
                                                <div key={w.id} className="p-6">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <p className="text-[14px] font-bold text-[#181725]">
                                                            {w.vendorId ? (w.vendor?.businessName ?? 'Vendor credit line') : 'Horeca1 (platform)'}
                                                        </p>
                                                        <span className={cn('inline-block text-[11px] font-bold px-2.5 py-1 rounded-md', getWalletStatusStyles(w.status))}>
                                                            {w.status}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                                                        <div>
                                                            <p className="text-[12px] font-bold text-[#7C7C7C] mb-1">Credit Limit</p>
                                                            <p className="text-[14px] font-bold">{INR(w.creditLimit)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[12px] font-bold text-[#7C7C7C] mb-1">Available</p>
                                                            <p className="text-[14px] font-bold text-[#299E60]">{INR(w.availableCredit)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[12px] font-bold text-[#7C7C7C] mb-1">Outstanding</p>
                                                            <p className="text-[14px] font-bold">{INR(w.outstandingAmount)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[12px] font-bold text-[#7C7C7C] mb-1">Due Date</p>
                                                            <p className="text-[14px] font-bold">{w.currentDueDate ? formatDateIndian(w.currentDueDate) : '--'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[14px] text-[#6B7280] font-medium">No credit wallets assigned.</p>
                                    )}
                                </div>
                            )}

                            {activeTab === 'team' && primaryBa?.id && (
                                <AdminAccountTeamPanel businessAccountId={primaryBa.id} />
                            )}
                            {activeTab === 'team' && !primaryBa?.id && (
                                <p className="text-[14px] text-[#6B7280] font-medium">No business account team to display.</p>
                            )}
                        </AdminEntityTabContent>
                    </AdminEntityTabPanel>
                </div>

                {/* Right Column: Sticky actions / Login credentials */}
                <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-8 animate-in fade-in duration-300">
                    <AdminLoginCredentialsPanel
                        user={user}
                        adminPassword={ownerPassword}
                        permission="customers.edit"
                        accent="#299E60"
                        onPasswordUpdated={setOwnerPassword}
                    />

                    <div className="bg-white rounded-[20px] border border-[#D1D5DB] p-6 shadow-sm flex flex-col gap-4">
                        <span className="text-[11px] font-extrabold text-[#9CA3AF] uppercase tracking-wider block">
                            Account Actions
                        </span>
                        <button
                            type="button"
                            onClick={handleToggleActive}
                            disabled={toggling}
                            className={cn(
                                'w-full py-2.5 rounded-[10px] text-[12px] font-bold transition-all shadow-sm flex items-center justify-center gap-2 border',
                                user.isActive
                                    ? 'bg-white border-red-200 text-red-600 hover:bg-red-50'
                                    : 'bg-[#299E60] border-[#299E60] text-white hover:bg-[#238a54]',
                            )}
                        >
                            {toggling ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                            {user.isActive ? 'Deactivate User' : 'Activate User'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5 w-full">
            <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">{label}</span>
            <div className="w-full">{children}</div>
        </div>
    );
}

function InfoCardField({ label, value, copyable }: { label: string; value: string | null | undefined; copyable?: boolean }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success(`${label} copied`);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast.error('Failed to copy');
        }
    };

    const displayValue = value && value.trim() !== '' ? value : '—';

    return (
        <div className="flex flex-col gap-1 p-3.5 bg-[#F9FAFB] rounded-[10px] border border-[#F0F2F5] transition-all hover:bg-gray-50/60 relative group min-w-0">
            <span className="text-[10px] font-extrabold text-[#9CA3AF] uppercase tracking-wider">{label}</span>
            <div className="flex items-center gap-1.5 justify-between min-w-0">
                <span className="text-[13px] font-extrabold text-[#181725] truncate">
                    {displayValue}
                </span>
                {copyable && value && (
                    <button
                        onClick={handleCopy}
                        className="p-1 rounded hover:bg-white hover:shadow-sm text-[#9CA3AF] hover:text-[#299E60] transition-all cursor-pointer shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title={`Copy ${label}`}
                    >
                        {copied ? (
                            <Check size={11} className="text-[#299E60]" />
                        ) : (
                            <Copy size={11} />
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}
