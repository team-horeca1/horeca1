'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
    Star,
    Mail,
    Phone,
    Loader2,
    LayoutGrid,
    List,
    LayoutDashboard,
    Plus,
    Users,
    Boxes,
    ShoppingBag,
    ShieldCheck,
    Building2,
    ArrowUpRight,
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
  AdminRegistryPageHeader,
  AdminRegistryStatsGrid,
  AdminRegistryFilterBar,
  registryFilterPillClass,
  AdminRegistryLoadingState,
  AdminRegistryEmptyState,
  AdminRegistryTableShell,
  AdminRegistryTableHead,
  AdminRegistryTableBody,
  AdminRegistryRowActions,
  AdminRegistryOverflowMenu,
  AdminRegistryOverflowMenuItem,
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
    const [vendorFilter, setVendorFilter] = useState<'all' | 'pending' | 'verified'>('all');
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
        return vendors.filter((vendor) => {
            if (vendorFilter === 'pending' && vendor.isVerified) return false;
            if (vendorFilter === 'verified' && !vendor.isVerified) return false;
            return (
                (vendor.businessName || '').toLowerCase().includes(query) ||
                (vendor.user?.email || '').toLowerCase().includes(query) ||
                (vendor.user?.fullName || '').toLowerCase().includes(query)
            );
        });
    }, [vendors, searchQuery, vendorFilter]);

    // Calculate metrics for stats cards using useMemo to optimize re-renders
    const { totalVendors, pendingVerification, totalProducts, totalOrders } = React.useMemo(() => {
        const totalVendors = vendors.length;
        const pendingVerification = vendors.filter(v => !v.isVerified).length;
        const totalProducts = vendors.reduce((sum, v) => sum + (v._count?.products || 0), 0);
        const totalOrders = vendors.reduce((sum, v) => sum + (v._count?.orders || 0), 0);
        return { totalVendors, pendingVerification, totalProducts, totalOrders };
    }, [vendors]);

    if (loading) {
        return <AdminRegistryLoadingState message="Loading vendors registry..." />;
    }

    const registryStats = [
        { label: 'Total Sellers', value: totalVendors, icon: Users, iconBg: 'bg-[#EEF8F1]', iconColor: 'text-[#299E60]' },
        { label: 'Pending Approval', value: pendingVerification, icon: ShieldCheck, iconBg: 'bg-[#FFF8EB]', iconColor: 'text-[#D97706]' },
        { label: 'Total Products', value: totalProducts, icon: Boxes, iconBg: 'bg-[#EFF6FF]', iconColor: 'text-[#3B82F6]' },
        { label: 'Orders Placed', value: totalOrders, icon: ShoppingBag, iconBg: 'bg-[#FDF2F2]', iconColor: 'text-[#EF4444]' },
    ];

    return (
        <div className="space-y-8 pb-10 px-4 md:px-0">
            <AdminRegistryPageHeader
                title="Vendors Registry"
                subtitle="Manage and audit commercial supplier profiles, catalog size, and onboarding verification"
                actions={
                    canWriteSettings ? (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="h-[44px] px-5 bg-[#299E60] text-white rounded-[12px] text-[13px] font-bold hover:bg-[#238a54] active:scale-95 transition-all shadow-md shadow-[#299E60]/10 flex items-center gap-2 shrink-0"
                        >
                            <Plus size={16} />
                            Add Vendor
                        </button>
                    ) : undefined
                }
            />

            <AdminRegistryStatsGrid stats={registryStats} />

            <AdminRegistryFilterBar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search by vendor, owner, email..."
                leftSlot={
                    <>
                        {(
                            [
                                { id: 'all' as const, label: 'All' },
                                { id: 'pending' as const, label: 'Pending' },
                                { id: 'verified' as const, label: 'Verified' },
                            ] as const
                        ).map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setVendorFilter(f.id)}
                                className={registryFilterPillClass(vendorFilter === f.id)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </>
                }
                trailingSlot={
                    <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase mr-1 hidden md:inline">View:</span>
                        <div className="flex items-center bg-[#F3F4F6] border border-[#E5E7EB] rounded-[10px] p-1">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={cn(
                                    'p-2 rounded-[8px] transition-all flex items-center gap-1.5 text-[12px] font-bold',
                                    viewMode === 'grid' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#111827]',
                                )}
                            >
                                <LayoutGrid size={15} />
                                <span className="hidden sm:inline">Cards</span>
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={cn(
                                    'p-2 rounded-[8px] transition-all flex items-center gap-1.5 text-[12px] font-bold',
                                    viewMode === 'table' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#111827]',
                                )}
                            >
                                <List size={15} />
                                <span className="hidden sm:inline">Table</span>
                            </button>
                        </div>
                    </div>
                }
            />

            {filteredVendors.length === 0 ? (
                <AdminRegistryEmptyState
                    icon={Building2}
                    title={searchQuery || vendorFilter !== 'all' ? 'No matched results' : 'No vendors registered yet'}
                    subtitle={
                        searchQuery || vendorFilter !== 'all'
                            ? 'Try adjusting your search or filter.'
                            : 'Click the "Add Vendor" button to register your first seller partner.'
                    }
                />
            ) : viewMode === 'grid' ? (
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
                                Impersonate
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
            <AdminRegistryTableShell minWidth="1100px">
                <AdminRegistryTableHead>
                    <th className="px-6 py-3.5 font-bold text-center w-[60px] border-r border-[#D1D5DB]">#</th>
                    <th className="px-6 py-3.5 font-bold min-w-[280px] border-r border-[#D1D5DB]">Vendor Partner</th>
                    <th className="px-6 py-3.5 font-bold min-w-[150px] border-r border-[#D1D5DB]">Owner</th>
                    <th className="px-6 py-3.5 font-bold min-w-[220px] border-r border-[#D1D5DB]">Contact Information</th>
                    <th className="px-6 py-3.5 font-bold text-center w-[100px] border-r border-[#D1D5DB]">Products</th>
                    <th className="px-6 py-3.5 font-bold text-center w-[100px] border-r border-[#D1D5DB]">Orders</th>
                    <th className="px-6 py-3.5 font-bold text-left min-w-[360px]">Actions</th>
                </AdminRegistryTableHead>
                <AdminRegistryTableBody>
                        {filteredVendors.map((vendor, i) => (
                            <tr
                                key={vendor.id}
                                onClick={() => openDetails(vendor.id)}
                                className="group hover:bg-[#F9FAFB]/60 transition-colors cursor-pointer"
                            >
                                {/* Index */}
                                <td className="px-6 py-3 text-center font-bold text-[#9CA3AF] text-[12px] align-middle border-r border-[#D1D5DB]">
                                    {i + 1}
                                </td>

                                {/* Vendor Partner */}
                                <td className="px-6 py-3 align-middle border-r border-[#D1D5DB]">
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
                                <td className="px-6 py-3 text-[13px] font-bold text-[#374151] align-middle border-r border-[#D1D5DB]">
                                    {vendor.user.fullName}
                                </td>

                                {/* Contact Information */}
                                <td className="px-6 py-3 align-middle border-r border-[#D1D5DB]">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[13px] font-medium text-[#4B5563] truncate block max-w-[200px]">{vendor.user.email}</span>
                                        {vendor.user.phone && (
                                            <span className="text-[11px] text-[#9CA3AF] font-semibold font-mono">{vendor.user.phone}</span>
                                        )}
                                    </div>
                                </td>

                                {/* Products Count */}
                                <td className="px-6 py-3 text-center font-bold text-[#111827] text-[14px] align-middle border-r border-[#D1D5DB]">
                                    {vendor._count.products}
                                </td>

                                {/* Orders Count */}
                                <td className="px-6 py-3 text-center font-bold text-[#111827] text-[14px] align-middle border-r border-[#D1D5DB]">
                                    {vendor._count.orders}
                                </td>

                                <td className="px-6 py-3 text-left align-middle">
                                    <AdminRegistryRowActions
                                        detailsHref={`/admin/vendors/${vendor.id}`}
                                        onDetailsClick={(e) => e.stopPropagation()}
                                        impersonateButton={
                                            <button
                                                type="button"
                                                disabled={impersonateLoading}
                                                onClick={(e) => viewAsVendor(e, vendor.id)}
                                                className="h-[34px] px-3 bg-[#299E60] text-white rounded-[8px] text-[12px] font-bold hover:bg-[#238a54] active:scale-97 transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-[#299E60]/5 whitespace-nowrap disabled:opacity-60"
                                            >
                                                <LayoutDashboard size={12} />
                                                <span>Impersonate</span>
                                                <ArrowUpRight size={12} className="opacity-70" />
                                            </button>
                                        }
                                        extraActions={
                                            !vendor.isVerified && canEditVendors ? (
                                                <AdminVerifyPartnerButton
                                                    vendorId={vendor.id}
                                                    compact
                                                    onVerified={() => handleVendorVerified(vendor.id)}
                                                />
                                            ) : undefined
                                        }
                                        menuOpen={activeMenu?.id === vendor.id}
                                        showMenu={canEditVendors || canDeleteVendors}
                                        onMenuToggle={(e) => {
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
                                    />
                                </td>
                            </tr>
                        ))}
                </AdminRegistryTableBody>
            </AdminRegistryTableShell>
            )}

            <AdminRegistryOverflowMenu active={activeMenu}>
                {(() => {
                    const v = vendors.find((x) => x.id === activeMenu?.id);
                    if (!v) return null;
                    return (
                        <>
                            {canEditVendors && (
                                <AdminRegistryOverflowMenuItem
                                    onClick={() => toggleVendorActive(v.id, v.isActive)}
                                    icon={v.isActive ? <UserX size={14} className="text-red-400" /> : <UserCheck size={14} className="text-green-400" />}
                                    label={v.isActive ? 'Deactivate' : 'Activate'}
                                />
                            )}
                            {canDeleteVendors && (
                                <AdminRegistryOverflowMenuItem
                                    onClick={() => deleteVendor(v.id, v.businessName)}
                                    icon={<Trash2 size={14} />}
                                    label="Delete permanently"
                                    danger
                                />
                            )}
                        </>
                    );
                })()}
            </AdminRegistryOverflowMenu>

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
