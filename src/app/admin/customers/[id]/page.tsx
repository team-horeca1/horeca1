'use client';

import React, { useState, useEffect } from 'react';
import {
    ChevronLeft,
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AdminPasswordResetButton } from '@/components/features/admin/AdminPasswordResetButton';
import { AdminAccountTeamPanel } from '@/components/features/admin/AdminAccountTeamPanel';
import {
    AdminEntityDetailHeader,
    AdminEntityStatsRow,
    AdminImpersonateButton,
    AdminStatusBadge,
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
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-[#299E60]" />
            </div>
        );
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
        { id: 'overview' as const, label: 'Overview' },
        { id: 'business' as const, label: 'Business Profile' },
        { id: 'credit' as const, label: 'Credit & Orders' },
        { id: 'team' as const, label: 'Team' },
    ];

    return (
        <div className="space-y-6 pb-12 px-4 md:px-0">
            <AdminEntityDetailHeader
                onBack={() => router.back()}
                breadcrumbs={[
                    { label: 'Customers', href: '/admin/customers' },
                    { label: user.fullName },
                ]}
                actions={
                    <>
                        {user.role === 'customer' && (
                            <AdminImpersonateButton
                                target="customer"
                                entityId={user.id}
                                label="View as Customer"
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

            <div className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm overflow-hidden p-6 md:p-8 flex flex-col lg:flex-row items-center lg:items-stretch gap-6 md:gap-8">
                <div className="flex flex-col items-center justify-center shrink-0 w-[180px]">
                    <div className="w-[120px] h-[120px] rounded-full border-4 border-[#F3F4F6] overflow-hidden bg-white shadow-inner">
                        <img src={avatarUrl} alt={user.fullName} className="w-full h-full object-cover" />
                    </div>
                    <div className="mt-3">
                        <AdminStatusBadge variant={user.isActive ? 'active' : 'inactive'} label={user.isActive ? 'Active' : 'Inactive'} />
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between text-center lg:text-left">
                    <div>
                        <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 justify-center lg:justify-start">
                            <h2 className="text-[24px] font-black text-[#111827] leading-tight">{user.fullName}</h2>
                            <span className={cn('text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider border capitalize', getRoleBadgeStyles(user.role))}>
                                {user.role}
                            </span>
                        </div>
                        {user.businessName && (
                            <p className="text-[13px] text-[#6B7280] font-medium mt-2">{user.businessName}</p>
                        )}
                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mt-4 justify-center lg:justify-start">
                            <div className="flex items-center gap-2 text-[13px] text-[#374151]">
                                <Mail size={14} className="text-[#9CA3AF]" />
                                <span className="font-bold truncate">{user.email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[13px] text-[#374151]">
                                <Phone size={14} className="text-[#9CA3AF]" />
                                <span className="font-bold">{user.phone || '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="w-full lg:w-[220px] border-t lg:border-t-0 lg:border-l border-[#F3F4F6] pt-6 lg:pt-0 lg:pl-6 flex flex-col justify-center gap-2.5">
                    <span className="text-[11px] font-bold text-[#9CA3AF] uppercase text-center lg:text-left">Account Actions</span>
                    <AdminPasswordResetButton user={user} permission="customers.edit" accent="#299E60" className="w-full justify-center" />
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

            <AdminEntityStatsRow stats={stats} />

            <div className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="flex overflow-x-auto border-b border-[#EEEEEE] bg-[#FAFAFA]">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                'px-6 py-3.5 text-[13px] font-bold whitespace-nowrap transition-all border-b-2 -mb-px',
                                activeTab === tab.id
                                    ? 'border-[#299E60] text-[#299E60] bg-white'
                                    : 'border-transparent text-[#6B7280] hover:text-[#111827]',
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="p-6 md:p-8">
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
                                <div className="rounded-[14px] border border-[#EEEEEE] p-5">
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
                        <div className="bg-white rounded-[14px] border border-[#EEEEEE] overflow-hidden max-w-3xl">
                            <div className="divide-y divide-[#EEEEEE]">
                                <DetailRow label="Account ID" value={truncateId(user.id)} copyText={user.id} />
                                {editing ? (
                                    <>
                                        <EditRow label="Full name">
                                            <input value={draft.fullName} onChange={e => setDraft(d => ({ ...d, fullName: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-[13px] outline-none focus:border-[#299E60]" />
                                        </EditRow>
                                        <EditRow label="Email">
                                            <input type="email" value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-[13px] outline-none focus:border-[#299E60]" />
                                        </EditRow>
                                        <EditRow label="Phone">
                                            <input type="tel" inputMode="numeric" maxLength={10}
                                                value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-[13px] outline-none focus:border-[#299E60]" />
                                        </EditRow>
                                        <EditRow label="Pincode">
                                            <input value={draft.pincode} onChange={e => setDraft(d => ({ ...d, pincode: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-[13px] outline-none focus:border-[#299E60]" />
                                        </EditRow>
                                        <EditRow label="Business name">
                                            <input value={draft.businessName} onChange={e => setDraft(d => ({ ...d, businessName: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-[13px] outline-none focus:border-[#299E60]" />
                                        </EditRow>
                                        <EditRow label="GST number">
                                            <input value={draft.gstNumber} onChange={e => setDraft(d => ({ ...d, gstNumber: e.target.value }))}
                                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-[13px] outline-none focus:border-[#299E60]" />
                                        </EditRow>
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
                                            <EditRow key={key} label={label}>
                                                <input value={draft.cp[key] ?? ''} onChange={e => setDraft(d => ({ ...d, cp: { ...d.cp, [key]: e.target.value } }))}
                                                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-[13px] outline-none focus:border-[#299E60]" />
                                            </EditRow>
                                        ))}
                                    </>
                                ) : (
                                    <>
                                        <DetailRow label="Full name" value={user.fullName} />
                                        <DetailRow label="Email" value={user.email || '--'} />
                                        <DetailRow label="Phone" value={user.phone || '--'} />
                                        <DetailRow label="Pincode" value={user.pincode || '--'} />
                                        <DetailRow label="Business Name" value={user.businessName || primaryBa?.displayName || primaryBa?.legalName || '--'} />
                                        <DetailRow label="GST Number" value={user.gstNumber || primaryBa?.gstin || '--'} />
                                        <DetailRow label="Joined" value={formatDateIndian(user.createdAt)} />
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'credit' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <StatCard label="Total Orders" value={String(user._count.orders)} icon={Package} />
                                <StatCard label="Quick Order Lists" value={String(user._count.quickOrderLists)} icon={ListOrdered} />
                            </div>
                            {user.creditWallets && user.creditWallets.length > 0 ? (
                                <div className="divide-y divide-[#EEEEEE] border border-[#EEEEEE] rounded-[14px] overflow-hidden">
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
                </div>
            </div>
        </div>
    );
}

function DetailRow({ label, value, copyText }: { label: string; value: string; copyText?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!copyText) return;
        try {
            await navigator.clipboard.writeText(copyText);
            setCopied(true);
            toast.success(`${label} copied to clipboard`);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast.error('Failed to copy to clipboard');
        }
    };

    return (
        <div className="px-6 py-4 flex items-center justify-between text-[13px]">
            <span className="font-[800] text-[#4B4B4B]">{label} :</span>
            <div className="flex items-center gap-1.5 justify-end max-w-[60%]">
                <span className="font-[800] text-[#181725] truncate">
                    {value}
                </span>
                {copyText && (
                    <button
                        onClick={handleCopy}
                        className="p-1 rounded hover:bg-gray-100 text-[#7C7C7C] hover:text-[#181725] transition-colors cursor-pointer shrink-0"
                        title={`Copy ${label}`}
                    >
                        {copied ? (
                            <span className="text-[10px] text-[#299E60] font-bold">Copied!</span>
                        ) : (
                            <Copy size={13} />
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast.success(`${label} copied to clipboard`);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast.error('Failed to copy to clipboard');
        }
    };
    return (
        <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-gray-100 text-[#7C7C7C] hover:text-[#181725] transition-colors inline-flex items-center justify-center cursor-pointer shrink-0"
            title={`Copy ${label}`}
        >
            {copied ? (
                <Check size={12} className="text-[#299E60]" />
            ) : (
                <Copy size={12} />
            )}
        </button>
    );
}

function EditRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="px-6 py-3 flex items-center justify-between text-[13px] gap-3">
            <span className="font-[800] text-[#4B4B4B] shrink-0">{label} :</span>
            <div className="max-w-[60%] w-full">{children}</div>
        </div>
    );
}

function StatCard({
    label,
    value,
    icon: Icon,
}: {
    label: string;
    value: string;
    icon: React.ComponentType<{ size?: number }>;
}) {
    return (
        <div className="bg-white p-5 rounded-[14px] border border-[#EEEEEE] flex items-center justify-between shadow-sm">
            <div className="space-y-1">
                <p className="text-[13px] font-[800] text-[#7C7C7C]">{label}</p>
                <h4 className="text-[22px] font-[800] text-[#181725]">{value}</h4>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#299E60]/10 flex items-center justify-center text-[#299E60]">
                <Icon size={20} />
            </div>
        </div>
    );
}
