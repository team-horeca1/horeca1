'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
    Search,
    Star,
    Mail,
    Phone,
    Loader2,
    CheckCircle,
    XCircle,
    LayoutGrid,
    List,
    LayoutDashboard,
    Plus,
    Users,
    Boxes,
    ShoppingBag,
    ShieldCheck,
    AlertCircle,
    Building2,
    ArrowUpRight,
    MoreVertical,
    Trash2,
    UserCheck,
    UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { useAdminImpersonate } from '@/hooks/useAdminImpersonate';
import {
  AdminStatusBadge,
  AdminVerifyPartnerButton,
} from '@/components/features/admin/entity';

const AddVendorWizard = dynamic(
    () => import('@/components/features/admin/AddVendorWizard').then((mod) => mod.AddVendorWizard),
    {
        loading: () => (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center">
                <div className="bg-white rounded-[24px] p-10 flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin text-[#299E60]" size={36} />
                    <span className="text-[13px] font-bold text-[#6B7280]">Loading wizard...</span>
                </div>
            </div>
        ),
        ssr: false,
    }
);

interface AdminVendor {
    id: string;
    businessName: string;
    slug: string;
    logoUrl: string | null;
    rating: number;
    isVerified: boolean;
    isActive: boolean;
    createdAt: string;
    user: {
        id: string;
        fullName: string;
        email: string;
        phone: string | null;
    };
    _count: {
        products: number;
        orders: number;
    };
}

export default function VendorsPage() {
    const router = useRouter();
    const { has: can } = usePermissions();
    const canWriteSettings = can('settings.edit');
    const canEditVendors = can('vendors.edit');
    const canDeleteVendors = can('vendors.delete');
    const confirm = useConfirm();
    const { start: startVendorView, loading: impersonateLoading } = useAdminImpersonate('vendor');
    const [searchQuery, setSearchQuery] = useState('');
    const [vendors, setVendors] = useState<AdminVendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
    const [activeMenu, setActiveMenu] = useState<{ id: string; top: number; right: number } | null>(null);

    // Add-Vendor wizard modal open state
    const [showCreate, setShowCreate] = useState(false);

    const openDetails = (vendorId: string) => router.push(`/admin/vendors/${vendorId}`);

    const viewAsVendor = (e: React.MouseEvent, vendorId: string) => {
        e.stopPropagation();
        void startVendorView(vendorId);
    };

    const handleVendorVerified = (vendorId: string) => {
        setVendors((prev) => prev.map((v) => (v.id === vendorId ? { ...v, isVerified: true } : v)));
    };

    const deleteVendor = async (id: string, name: string) => {
        setActiveMenu(null);
        const ok = await confirm({
            title: 'Delete permanently?',
            message: `${name} will be removed completely along with products, orders, team memberships and vendor data. This cannot be undone.`,
            confirmText: 'Delete permanently',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            const res = await fetch(`/api/v1/admin/vendors/${id}?force=true`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) {
                toast.error(json.error?.message || json.error || 'Failed to delete');
                return;
            }
            setVendors((prev) => prev.filter((v) => v.id !== id));
            toast.success(`${name} deleted permanently`);
        } catch {
            toast.error('Failed to delete');
        }
    };

    const toggleVendorActive = async (id: string, currentlyActive: boolean) => {
        setActiveMenu(null);
        try {
            const res = await fetch(`/api/v1/admin/vendors/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !currentlyActive }),
            });
            const json = await res.json();
            if (json.success) {
                setVendors((prev) => prev.map((v) => (v.id === id ? { ...v, isActive: !currentlyActive } : v)));
                toast.success(currentlyActive ? 'Vendor deactivated' : 'Vendor activated');
            } else {
                toast.error(json.error?.message || 'Failed to update');
            }
        } catch {
            toast.error('Failed to update');
        }
    };

    useEffect(() => {
        const handleClickOutside = () => setActiveMenu(null);
        if (activeMenu !== null) {
            window.addEventListener('click', handleClickOutside);
        }
        return () => window.removeEventListener('click', handleClickOutside);
    }, [activeMenu]);

    useEffect(() => {
        if (!activeMenu) return;
        const close = () => setActiveMenu(null);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [activeMenu]);

    useEffect(() => {
        fetch('/api/v1/admin/vendors?limit=50')
            .then(res => res.json())
            .then(json => { if (json.success) setVendors(json.data.vendors); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // Filter search query safely (handles null user fields)
    const filteredVendors = React.useMemo(() => {
        const query = searchQuery.toLowerCase();
        return vendors.filter(vendor =>
            (vendor.businessName || '').toLowerCase().includes(query) ||
            (vendor.user?.email || '').toLowerCase().includes(query) ||
            (vendor.user?.fullName || '').toLowerCase().includes(query)
        );
    }, [vendors, searchQuery]);

    // Calculate metrics for stats cards using useMemo to optimize re-renders
    const { totalVendors, pendingVerification, totalProducts, totalOrders } = React.useMemo(() => {
        const totalVendors = vendors.length;
        const pendingVerification = vendors.filter(v => !v.isVerified).length;
        const totalProducts = vendors.reduce((sum, v) => sum + (v._count?.products || 0), 0);
        const totalOrders = vendors.reduce((sum, v) => sum + (v._count?.orders || 0), 0);
        return { totalVendors, pendingVerification, totalProducts, totalOrders };
    }, [vendors]);

    // Show full-page spinner while loading to prevent layout shifts and flash of 0 stats
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 bg-white rounded-[24px] border border-[#EEEEEE] shadow-sm py-24 m-8">
                <Loader2 className="animate-spin text-[#299E60]" size={40} />
                <span className="text-[13px] font-bold text-[#6B7280]">Loading vendors registry...</span>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10 px-4 md:px-0">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[#EEEEEE] pb-5">
                <div>
                    <h1 className="text-[30px] font-extrabold text-[#111827] tracking-tight mb-1">Vendors Registry</h1>
                    <p className="text-[#6B7280] text-[14px] font-medium">Manage and audit commercial supplier profiles, catalog size, and onboarding verification</p>
                </div>

                <div className="flex items-center gap-3">
                    {canWriteSettings && (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="h-[44px] px-5 bg-[#299E60] text-white rounded-[12px] text-[13px] font-bold hover:bg-[#238a54] active:scale-95 transition-all shadow-md shadow-[#299E60]/10 flex items-center gap-2 shrink-0"
                        >
                            <Plus size={16} />
                            Add Vendor
                        </button>
                    )}
                </div>
            </div>

            {/* Dashboard Mini Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Stat 1: Total Sellers */}
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] bg-[#EEF8F1] flex items-center justify-center text-[#299E60]">
                        <Users size={22} />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Total Sellers</span>
                        <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{totalVendors}</span>
                    </div>
                </div>

                {/* Stat 2: Pending Approval */}
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] bg-[#FFF8EB] flex items-center justify-center text-[#D97706]">
                        <ShieldCheck size={22} className="text-[#D97706] opacity-60" />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Pending Approval</span>
                        <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{pendingVerification}</span>
                    </div>
                </div>

                {/* Stat 3: Products Catalog */}
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] bg-[#EFF6FF] flex items-center justify-center text-[#3B82F6]">
                        <Boxes size={22} />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Total Products</span>
                        <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{totalProducts}</span>
                    </div>
                </div>

                {/* Stat 4: Total Orders */}
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] bg-[#FDF2F2] flex items-center justify-center text-[#EF4444]">
                        <ShoppingBag size={22} />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Orders Placed</span>
                        <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{totalOrders}</span>
                    </div>
                </div>
            </div>

            {/* Filter Panel */}
            <div className="bg-white p-4 rounded-[16px] border border-[#EEEEEE] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Search Bar */}
                <div className="relative group w-full sm:w-[320px]">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={16} />
                    <input
                        type="text"
                        placeholder="Search by vendor, owner, email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-[42px] w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] pl-10 pr-4 text-[13px] outline-none transition-all placeholder:text-[#9CA3AF] font-medium focus:border-[#299E60]/50 focus:bg-white focus:shadow-sm"
                    />
                </div>

                {/* View Toggler */}
                <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                    <span className="text-[12px] font-bold text-[#9CA3AF] uppercase mr-1 hidden md:inline">View:</span>
                    <div className="flex items-center bg-[#F3F4F6] border border-[#E5E7EB] rounded-[10px] p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={cn(
                                "p-2 rounded-[8px] transition-all flex items-center gap-1.5 text-[12px] font-bold",
                                viewMode === 'grid' ? "bg-white text-[#111827] shadow-sm" : "text-[#6B7280] hover:text-[#111827]"
                            )}
                        >
                            <LayoutGrid size={15} />
                            <span className="hidden sm:inline">Cards</span>
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            className={cn(
                                "p-2 rounded-[8px] transition-all flex items-center gap-1.5 text-[12px] font-bold",
                                viewMode === 'table' ? "bg-white text-[#111827] shadow-sm" : "text-[#6B7280] hover:text-[#111827]"
                            )}
                        >
                            <List size={15} />
                            <span className="hidden sm:inline">Table</span>
                        </button>
                    </div>
                </div>
            </div>

            {filteredVendors.length === 0 ? (
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-24 text-center text-[#6B7280] font-medium shadow-sm">
                    <Building2 className="mx-auto text-[#D1D5DB] mb-3" size={40} />
                    {searchQuery ? (
                        <>
                            <h4 className="text-[15px] font-bold text-[#374151]">No matched results</h4>
                            <p className="text-[13px] text-[#9CA3AF] mt-1">We couldn&apos;t find any vendor matching &quot;{searchQuery}&quot;</p>
                        </>
                    ) : (
                        <>
                            <h4 className="text-[15px] font-bold text-[#374151]">No vendors registered yet</h4>
                            <p className="text-[13px] text-[#9CA3AF] mt-1">Click the &quot;Add Vendor&quot; button to register your first seller partner.</p>
                        </>
                    )}
                </div>
            ) : (
            /* Vendors Display Area */
            viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredVendors.map((vendor) => (
                    <div
                        key={vendor.id}
                        className="bg-white rounded-[16px] border border-[#E5E7EB] shadow-sm overflow-hidden flex flex-col h-full hover:shadow-md hover:border-[#299E60]/30 hover:-translate-y-0.5 transition-all w-full"
                    >
                        {/* Upper Section — click anywhere to open vendor details */}
                        <div
                            onClick={() => openDetails(vendor.id)}
                            className="p-4 flex-1 flex flex-col cursor-pointer"
                        >
                            {/* Visual Logo Container */}
                            <div className="bg-[#F9FAFB] rounded-[12px] h-[120px] relative flex items-center justify-center p-4 border border-[#F3F4F6] mb-4">
                                {/* Verification Status Pin */}
                                <AdminStatusBadge
                                    variant={vendor.isVerified ? 'verified' : 'pending'}
                                    label={vendor.isVerified ? 'Verified' : 'Pending Verification'}
                                    className="absolute top-2.5 left-2.5 shadow-sm normal-case"
                                />

                                {vendor.logoUrl ? (
                                    <Image
                                        src={vendor.logoUrl}
                                        alt={vendor.businessName}
                                        width={80}
                                        height={80}
                                        sizes="80px"
                                        className="w-[80px] h-[80px] object-contain rounded-lg"
                                    />
                                ) : (
                                    <div className="w-[70px] h-[70px] rounded-full bg-[#299E60]/10 flex items-center justify-center border border-[#299E60]/20">
                                        <span className="text-[26px] font-black text-[#299E60]">
                                            {vendor.businessName.charAt(0)}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Name & Star */}
                            <div className="mb-3">
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="text-[16px] font-extrabold text-[#111827] line-clamp-1 group-hover:text-[#299E60]">{vendor.businessName}</h3>
                                    <div className="flex items-center gap-1 bg-[#FFFBEB] border border-[#FDE68A] px-1.5 py-0.5 rounded-md shrink-0">
                                        <Star size={12} fill="#F59E0B" className="text-[#F59E0B]" />
                                        <span className="text-[11px] font-bold text-[#D97706]">{Number(vendor.rating).toFixed(1)}</span>
                                    </div>
                                </div>
                                <span className="text-[12px] text-[#6B7280] font-semibold block mt-0.5">Owner: {vendor.user.fullName}</span>
                            </div>

                            {/* Details Details */}
                            <div className="space-y-2 mt-auto pt-2 border-t border-[#F3F4F6]">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Mail size={13} className="text-[#9CA3AF] shrink-0" />
                                    <span className="text-[12px] font-medium text-[#4B5563] truncate">{vendor.user.email}</span>
                                </div>
                                {vendor.user.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone size={13} className="text-[#9CA3AF] shrink-0" />
                                    <span className="text-[12px] font-medium text-[#4B5563]">{vendor.user.phone}</span>
                                </div>
                                )}
                            </div>

                            {/* Core Counts */}
                            <div className="flex items-center justify-around border-t border-[#F3F4F6] pt-3 mt-4 -mx-4 px-4 bg-[#F9FAFB] rounded-b-[10px]">
                                <div className="text-center py-1 flex-1">
                                    <p className="text-[14px] font-black text-[#111827] leading-none">{vendor._count.products}</p>
                                    <p className="text-[10px] font-bold text-[#9CA3AF] mt-1 uppercase">Products</p>
                                </div>
                                <div className="w-[1px] h-6 bg-[#E5E7EB]" />
                                <div className="text-center py-1 flex-1">
                                    <p className="text-[14px] font-black text-[#111827] leading-none">{vendor._count.orders}</p>
                                    <p className="text-[10px] font-bold text-[#9CA3AF] mt-1 uppercase">Orders</p>
                                </div>
                            </div>
                        </div>

                        {/* Card Buttons */}
                        <div className="p-4 border-t border-[#EEEEEE] bg-white flex flex-col gap-2 rounded-b-[16px]">
                            <button
                                type="button"
                                disabled={impersonateLoading}
                                onClick={(e) => viewAsVendor(e, vendor.id)}
                                className="w-full h-[38px] bg-[#299E60] text-white rounded-[10px] text-[12px] font-bold hover:bg-[#238a54] active:scale-98 transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-[#299E60]/10 disabled:opacity-60"
                            >
                                <LayoutDashboard size={13} />
                                View as Vendor
                            </button>
                            <div className="flex items-center gap-2">
                                <Link
                                    href={`/admin/vendors/${vendor.id}`}
                                    className={cn(
                                        "h-[36px] bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB] rounded-[10px] text-[12px] font-bold transition-all flex items-center justify-center border border-[#E5E7EB]",
                                        !vendor.isVerified && canEditVendors ? "flex-1" : "w-full"
                                    )}
                                >
                                    Details
                                </Link>
                                {!vendor.isVerified && canEditVendors && (
                                    <AdminVerifyPartnerButton
                                        vendorId={vendor.id}
                                        compact
                                        className="flex-1"
                                        onVerified={() => handleVendorVerified(vendor.id)}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            ) : (
            /* Table View - Semantic Premium Table */
            <div className="w-full overflow-x-auto rounded-[16px] border border-[#EEEEEE] bg-white shadow-sm">
                <table className="w-full border-collapse text-left text-[13px] min-w-[1000px]">
                    <thead>
                        <tr className="bg-[#F9FAFB] border-b border-[#EEEEEE] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                            <th className="px-6 py-2.5 font-bold text-center w-[60px]">#</th>
                            <th className="px-6 py-2.5 font-bold min-w-[280px]">Vendor Partner</th>
                            <th className="px-6 py-2.5 font-bold min-w-[150px]">Owner</th>
                            <th className="px-6 py-2.5 font-bold min-w-[220px]">Contact Information</th>
                            <th className="px-6 py-2.5 font-bold text-center w-[100px]">Products</th>
                            <th className="px-6 py-2.5 font-bold text-center w-[100px]">Orders</th>
                            <th className="px-6 py-2.5 font-bold text-right pr-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                        {filteredVendors.map((vendor, i) => (
                            <tr
                                key={vendor.id}
                                onClick={() => openDetails(vendor.id)}
                                className="group hover:bg-[#F9FAFB]/60 transition-colors cursor-pointer"
                            >
                                {/* Index */}
                                <td className="px-6 py-2.5 text-center font-bold text-[#9CA3AF] text-[12px]">
                                    {i + 1}
                                </td>

                                {/* Vendor Partner */}
                                <td className="px-6 py-2.5">
                                    <div className="flex items-center gap-3">
                                        {/* Avatar Box */}
                                        <div className="w-[42px] h-[42px] rounded-[10px] bg-[#F3F4F6] overflow-hidden shrink-0 border border-[#E5E7EB] flex items-center justify-center">
                                            {vendor.logoUrl ? (
                                                <Image
                                                    src={vendor.logoUrl}
                                                    alt={vendor.businessName}
                                                    width={42}
                                                    height={42}
                                                    sizes="42px"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <span className="text-[15px] font-black text-[#299E60]">
                                                    {vendor.businessName.charAt(0)}
                                                </span>
                                            )}
                                        </div>
                                        {/* Details */}
                                        <div className="min-w-0">
                                            <p className="text-[14px] font-bold text-[#111827] truncate group-hover:text-[#299E60] transition-colors">
                                                {vendor.businessName}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {/* Rating badge */}
                                                <div className="flex items-center gap-0.5">
                                                    <Star size={11} fill="#F59E0B" className="text-[#F59E0B]" />
                                                    <span className="text-[11px] font-bold text-[#4B5563]">{Number(vendor.rating).toFixed(1)}</span>
                                                </div>
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#E5E7EB]"></span>
                                                {/* Verified badge */}
                                                <AdminStatusBadge
                                                    variant={vendor.isVerified ? 'verified' : 'pending'}
                                                    className="normal-case"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </td>

                                {/* Owner */}
                                <td className="px-6 py-2.5 text-[13px] font-bold text-[#374151]">
                                    {vendor.user.fullName}
                                </td>

                                {/* Contact Information */}
                                <td className="px-6 py-2.5">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[13px] font-medium text-[#4B5563] truncate block max-w-[200px]">{vendor.user.email}</span>
                                        {vendor.user.phone && (
                                            <span className="text-[11px] text-[#9CA3AF] font-semibold font-mono">{vendor.user.phone}</span>
                                        )}
                                    </div>
                                </td>

                                {/* Products Count */}
                                <td className="px-6 py-2.5 text-center font-bold text-[#111827] text-[14px]">
                                    {vendor._count.products}
                                </td>

                                {/* Orders Count */}
                                <td className="px-6 py-2.5 text-center font-bold text-[#111827] text-[14px]">
                                    {vendor._count.orders}
                                </td>

                                {/* Action buttons */}
                                <td className="px-6 py-2.5 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            disabled={impersonateLoading}
                                            onClick={(e) => viewAsVendor(e, vendor.id)}
                                            className="h-[34px] px-3 bg-[#299E60] text-white rounded-[8px] text-[12px] font-bold hover:bg-[#238a54] active:scale-97 transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-[#299E60]/5 whitespace-nowrap disabled:opacity-60"
                                        >
                                            <LayoutDashboard size={12} />
                                            <span>View as Vendor</span>
                                            <ArrowUpRight size={12} className="opacity-70" />
                                        </button>
                                        <Link
                                            href={`/admin/vendors/${vendor.id}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="h-[34px] px-3 bg-white border border-[#E5E7EB] text-[#374151] rounded-[8px] text-[12px] font-bold hover:bg-[#F9FAFB] transition-all flex items-center justify-center whitespace-nowrap"
                                        >
                                            Details
                                        </Link>
                                        {!vendor.isVerified && canEditVendors && (
                                            <AdminVerifyPartnerButton
                                                vendorId={vendor.id}
                                                compact
                                                onVerified={() => handleVendorVerified(vendor.id)}
                                            />
                                        )}
                                        {(canEditVendors || canDeleteVendors) && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (activeMenu?.id === vendor.id) {
                                                        setActiveMenu(null);
                                                        return;
                                                    }
                                                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                                    setActiveMenu({
                                                        id: vendor.id,
                                                        top: rect.bottom + 6,
                                                        right: window.innerWidth - rect.right,
                                                    });
                                                }}
                                                className={cn(
                                                    'w-[34px] h-[34px] flex items-center justify-center rounded-[10px] transition-all shadow-sm',
                                                    activeMenu?.id === vendor.id
                                                        ? 'bg-gray-100 text-gray-900 border border-gray-200'
                                                        : 'bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:bg-gray-50',
                                                )}
                                            >
                                                <MoreVertical size={16} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            )
            )}

            {activeMenu && typeof window !== 'undefined' && createPortal(
                <div
                    style={{ position: 'fixed', top: activeMenu.top, right: activeMenu.right, zIndex: 12000 }}
                    className="w-44 bg-white rounded-[8px] shadow-xl border border-gray-100 py-1 overflow-hidden animate-in fade-in zoom-in duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    {(() => {
                        const v = vendors.find((x) => x.id === activeMenu.id);
                        if (!v) return null;
                        return (
                            <>
                                {canEditVendors && (
                                    <button
                                        onClick={() => toggleVendorActive(v.id, v.isActive)}
                                        className="w-full flex items-center gap-3 px-4 py-2 text-[13px] font-semibold text-[#4B4B4B] hover:bg-gray-50 transition-colors text-left"
                                    >
                                        {v.isActive ? <UserX size={14} className="text-red-400" /> : <UserCheck size={14} className="text-green-400" />}
                                        {v.isActive ? 'Deactivate' : 'Activate'}
                                    </button>
                                )}
                                {canDeleteVendors && (
                                    <button
                                        onClick={() => deleteVendor(v.id, v.businessName)}
                                        className="w-full flex items-center gap-3 px-4 py-2 text-[13px] font-semibold text-red-500 hover:bg-red-50 transition-colors text-left"
                                    >
                                        <Trash2 size={14} />
                                        Delete permanently
                                    </button>
                                )}
                            </>
                        );
                    })()}
                </div>,
                document.body,
            )}

            {/* Add Vendor wizard modal overlay */}
            {showCreate && (
                <AddVendorWizard
                    onClose={() => setShowCreate(false)}
                    onCreated={(vendor) => {
                        setVendors((prev) => [
                            {
                                id: vendor.id,
                                businessName: vendor.businessName,
                                slug: vendor.slug,
                                logoUrl: null,
                                rating: 0,
                                isVerified: true,
                                isActive: true,
                                creditEnabled: false,
                                createdAt: new Date().toISOString(),
                                user: { id: vendor.user.id, fullName: vendor.user.fullName, email: vendor.user.email, phone: null },
                                _count: { products: 0, orders: 0 },
                            } as AdminVendor,
                            ...prev,
                        ]);
                        setShowCreate(false);
                    }}
                />
            )}
        </div>
    );
}
