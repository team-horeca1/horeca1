'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
    Loader2,
    Plus,
    Store,
    Clock,
    CheckCircle,
    Boxes,
    Trash2,
    X,
    ClipboardList,
    ExternalLink,
    ShieldCheck,
    LayoutGrid,
    List,
    Mail,
    Phone,
    Building2,
} from 'lucide-react';
import BrandFormModal from '@/components/features/admin/BrandFormModal';
import { usePermissions } from '@/hooks/usePermissions';
import { useAdminImpersonate } from '@/hooks/useAdminImpersonate';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
    AdminStatusBadge,
    AdminImpersonateButton,
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

interface Brand {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    tagline: string | null;
    approvalStatus: string;
    isActive: boolean;
    createdAt: string;
    user: { id: string; fullName: string; email: string; phone: string | null } | null;
    _count: { masterProducts: number; productMappings: number };
}

function getInitials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const STATUS_VARIANT: Record<string, 'verified' | 'pending' | 'rejected'> = {
    approved: 'verified',
    pending: 'pending',
    rejected: 'rejected',
};

const STATUS_LABEL: Record<string, string> = {
    approved: 'Approved',
    pending: 'Pending',
    rejected: 'Rejected',
};

export default function AdminBrandsPage() {
    const router = useRouter();
    const { has } = usePermissions();
    const canCreateBrand = has('brands.create');
    const canEditBrands = has('brands.edit');
    const canDeleteBrands = has('brands.delete');
    const confirm = useConfirm();
    const { start: startBrandImpersonate } = useAdminImpersonate('brand');

    const [searchQuery, setSearchQuery] = useState('');
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [brandFilter, setBrandFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    const [showCreate, setShowCreate] = useState(false);
    const [storefrontTarget, setStorefrontTarget] = useState<{ id: string; name: string } | null>(null);
    const [activeMenu, setActiveMenu] = useState<{ id: string; top: number; right: number } | null>(null);
    const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
    const [rejectNote, setRejectNote] = useState('');
    const canCreateStorefront = canCreateBrand || canEditBrands;

    // View Mode switcher
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const brandsRes = await fetch('/api/v1/admin/brands');
            const brandsJson = await brandsRes.json();
            if (brandsJson.success) setBrands(brandsJson.data ?? []);
        } catch {
            toast.error('Failed to load brands');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchData(); }, [fetchData]);

    useEffect(() => {
        const handleClickOutside = () => setActiveMenu(null);
        if (activeMenu !== null) window.addEventListener('click', handleClickOutside);
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

    const openDetails = (brandId: string) => router.push(`/admin/brands/${brandId}`);

    const handleApproveBrand = async (brand: Brand, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setActionLoading(brand.id);
        try {
            const res = await fetch(`/api/v1/admin/brands/${brand.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'approved' }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Approval failed');
            setBrands(prev => prev.map(b => b.id === brand.id ? { ...b, approvalStatus: 'approved' } : b));
            toast.success(`${brand.name} approved`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Approval failed');
        } finally {
            setActionLoading(null);
        }
    };

    const handleRejectBrand = async (id: string, note: string) => {
        setActionLoading(id);
        try {
            const res = await fetch(`/api/v1/admin/brands/${id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rejected', reviewNote: note || undefined }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Rejection failed');
            setBrands(prev => prev.map(b => b.id === id ? { ...b, approvalStatus: 'rejected' } : b));
            toast.success('Brand rejected');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Rejection failed');
        } finally {
            setActionLoading(null);
            setRejectTarget(null);
            setRejectNote('');
        }
    };

    const handleDeleteBrand = async (brand: Brand) => {
        setActiveMenu(null);
        const ok = await confirm({
            title: `Delete ${brand.name}?`,
            message: 'This permanently removes the brand along with all its catalog products, distributor links, and team members. Cannot be undone.',
            confirmText: 'Delete brand',
            tone: 'danger',
        });
        if (!ok) return;
        setActionLoading(brand.id);
        try {
            const res = await fetch(`/api/v1/admin/brands/${brand.id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Delete failed');
            setBrands(prev => prev.filter(b => b.id !== brand.id));
            toast.success(`${brand.name} deleted`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setActionLoading(null);
        }
    };

    const q = searchQuery.toLowerCase();
    const filteredBrands = brands
        .filter(b => brandFilter === 'all' || b.approvalStatus === brandFilter)
        .filter(b =>
            !q ||
            b.name.toLowerCase().includes(q) ||
            (b.user?.email?.toLowerCase().includes(q) ?? false) ||
            (b.user?.fullName?.toLowerCase().includes(q) ?? false),
        );

    const pendingBrandsCount = brands.filter(b => b.approvalStatus === 'pending').length;
    const approvedCount = brands.filter(b => b.approvalStatus === 'approved').length;
    const totalProducts = brands.reduce((sum, b) => sum + (b._count?.masterProducts || 0), 0);

    if (loading) {
        return <AdminRegistryLoadingState message="Loading brands registry..." />;
    }

    const registryStats = [
        { label: 'Total Brands', value: brands.length, icon: Store, iconBg: 'bg-[#EFF6FF]', iconColor: 'text-[#3B82F6]' },
        { label: 'Pending Approval', value: pendingBrandsCount, icon: Clock, iconBg: 'bg-[#FFF8EB]', iconColor: 'text-[#D97706]' },
        { label: 'Approved Brands', value: approvedCount, icon: CheckCircle, iconBg: 'bg-[#EEF8F1]', iconColor: 'text-[#299E60]' },
        { label: 'Master Products', value: totalProducts, icon: Boxes, iconBg: 'bg-[#FDF2F2]', iconColor: 'text-[#8B5CF6]' },
    ];

    return (
        <div className="space-y-8 pb-10 px-4 md:px-0">
            <AdminRegistryPageHeader
                title="Brands Registry"
                subtitle="Review brand applications, manage storefronts, and audit catalog mappings"
                actions={
                    canCreateBrand ? (
                            <button
                                onClick={() => setShowCreate(true)}
                                className="h-[44px] px-5 bg-[#299E60] text-white rounded-[12px] text-[13px] font-bold hover:bg-[#238a54] active:scale-95 transition-all shadow-md shadow-[#299E60]/10 flex items-center gap-2 shrink-0"
                            >
                                <Plus size={16} />
                                Add Brand
                            </button>
                    ) : undefined
                }
            />

            <AdminRegistryStatsGrid stats={registryStats} />

            <AdminRegistryFilterBar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search by brand, owner, email..."
                leftSlot={
                    <>
                        {(
                            [
                                { id: 'all' as const, label: 'All' },
                                { id: 'pending' as const, label: 'Pending' },
                                { id: 'approved' as const, label: 'Approved' },
                                { id: 'rejected' as const, label: 'Rejected' },
                            ] as const
                        ).map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setBrandFilter(f.id)}
                                className={registryFilterPillClass(brandFilter === f.id)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </>
                }
                trailingSlot={
                    <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase mr-1 hidden md:inline">View:</span>
                        <div className="flex items-center bg-[#F3F4F6] border border-[#D1D5DB] rounded-[10px] p-1">
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

            {filteredBrands.length === 0 ? (
                <AdminRegistryEmptyState
                    icon={ClipboardList}
                    title={searchQuery || brandFilter !== 'all' ? 'No matched results' : 'No brands registered yet'}
                    subtitle={
                        searchQuery || brandFilter !== 'all'
                            ? 'Try adjusting your search or filter.'
                            : 'Click "Add Brand" to register your first brand partner.'
                    }
                />
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredBrands.map((brand) => {
                        const needsStorefront = brand.user?.email?.includes('brand.internal.horeca1') || !brand.user;
                        const statusVariant = STATUS_VARIANT[brand.approvalStatus] ?? 'pending';
                        return (
                            <div
                                key={brand.id}
                                className="bg-white rounded-[16px] border border-[#D1D5DB] shadow-sm overflow-hidden flex flex-col h-full hover:shadow-md hover:border-[#299E60]/30 hover:-translate-y-0.5 transition-all w-full relative"
                            >
                                {/* Upper Section — click to view details */}
                                <div
                                    onClick={() => openDetails(brand.id)}
                                    className="p-5 flex-1 flex flex-col cursor-pointer"
                                >
                                    {/* Visual Avatar Container */}
                                    <div className="bg-[#F9FAFB] rounded-[12px] h-[120px] relative flex items-center justify-center p-4 border border-[#F3F4F6] mb-4">
                                        <AdminStatusBadge
                                            variant={statusVariant}
                                            label={STATUS_LABEL[brand.approvalStatus] ?? brand.approvalStatus}
                                            className="absolute top-2.5 right-2.5 shadow-sm normal-case text-[10px]"
                                        />

                                        {brand.logoUrl ? (
                                            <Image
                                                src={brand.logoUrl}
                                                alt={brand.name}
                                                width={80}
                                                height={80}
                                                sizes="80px"
                                                className="w-[80px] h-[80px] object-contain rounded-lg"
                                            />
                                        ) : (
                                            <div className="w-[70px] h-[70px] rounded-full bg-[#7C3AED]/10 flex items-center justify-center border border-[#7C3AED]/20">
                                                <span className="text-[26px] font-black text-[#7C3AED]">
                                                    {getInitials(brand.name)}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Name & Slug */}
                                    <div className="mb-3">
                                        <h3 className="text-[16px] font-extrabold text-[#111827] line-clamp-1 group-hover:text-[#299E60]">{brand.name}</h3>
                                        <Link
                                            href={`/brand/${brand.slug}`}
                                            target="_blank"
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-[11px] text-[#299E60] hover:underline flex items-center gap-0.5 mt-1"
                                        >
                                            /{brand.slug} <ExternalLink size={10} />
                                        </Link>
                                    </div>

                                    {/* Details Fields */}
                                    <div className="space-y-2 mt-auto pt-2 border-t border-[#F3F4F6]">
                                        <div className="flex items-center justify-between text-[12px] font-semibold">
                                            <span className="text-[#9CA3AF]">Owner:</span>
                                            {needsStorefront ? (
                                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200/50 px-1.5 py-0.5 rounded-[4px]">Admin Managed</span>
                                            ) : (
                                                <span className="text-[#374151] truncate max-w-[120px]">{brand.user?.fullName ?? '—'}</span>
                                            )}
                                        </div>
                                        {!needsStorefront && brand.user?.email && (
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Mail size={13} className="text-[#9CA3AF] shrink-0" />
                                                <span className="text-[12px] font-semibold text-[#4B5563] truncate">{brand.user.email}</span>
                                            </div>
                                        )}
                                        {brand.user?.phone && (
                                            <div className="flex items-center gap-2">
                                                <Phone size={13} className="text-[#9CA3AF] shrink-0" />
                                                <span className="text-[12px] font-semibold text-[#4B5563]">{brand.user.phone}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="flex items-center justify-around border-t border-[#F3F4F6] pt-3 mt-4 -mx-5 px-5 bg-[#F9FAFB] rounded-b-[10px] h-[52px]">
                                        <div className="text-center py-1 flex-1">
                                            <p className="text-[13px] font-black text-[#111827] leading-none">{brand._count.masterProducts}</p>
                                            <p className="text-[9px] font-bold text-[#9CA3AF] mt-1 uppercase">Products</p>
                                        </div>
                                        <div className="w-[1px] h-5 bg-[#E5E7EB]" />
                                        <div className="text-center py-1 flex-1">
                                            <p className="text-[13px] font-black text-[#111827] leading-none">{brand._count.productMappings}</p>
                                            <p className="text-[9px] font-bold text-[#9CA3AF] mt-1 uppercase">Mappings</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="p-4 border-t border-[#D1D5DB] bg-white flex flex-col gap-2 rounded-b-[16px]">
                                    <div onClick={(e) => e.stopPropagation()}>
                                        {needsStorefront && canCreateStorefront ? (
                                            <button
                                                type="button"
                                                onClick={() => setStorefrontTarget({ id: brand.id, name: brand.name })}
                                                className="w-full h-[38px] px-3 bg-[#299E60] text-white rounded-[10px] text-[12px] font-bold hover:bg-[#238a54] transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                            >
                                                <Store size={14} />
                                                Create Storefront
                                            </button>
                                        ) : (
                                            <AdminImpersonateButton
                                                target="brand"
                                                entityId={brand.id}
                                                label="Impersonate"
                                                variant="primary"
                                                className="w-full h-[38px] text-[12px] font-bold"
                                            />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Link
                                            href={`/admin/brands/${brand.id}`}
                                            className={cn(
                                                "h-[36px] bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB] rounded-[10px] text-[12px] font-bold transition-all flex items-center justify-center border border-[#E5E7EB]",
                                                brand.approvalStatus !== 'approved' && canEditBrands ? "flex-1" : "w-full"
                                            )}
                                        >
                                            Details
                                        </Link>
                                        {brand.approvalStatus !== 'approved' && canEditBrands && (
                                            <button
                                                type="button"
                                                disabled={actionLoading === brand.id}
                                                onClick={(e) => { e.stopPropagation(); void handleApproveBrand(brand, e); }}
                                                className="flex-1 h-[36px] bg-[#299E60] text-white rounded-[10px] text-[12px] font-bold hover:bg-[#238a54] transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                                            >
                                                {actionLoading === brand.id ? (
                                                    <Loader2 size={12} className="animate-spin" />
                                                ) : (
                                                    <ShieldCheck size={12} />
                                                )}
                                                Approve
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <AdminRegistryTableShell minWidth="1100px">
                    <AdminRegistryTableHead>
                        <th className="px-6 py-3.5 font-bold text-center w-[60px] border-r border-[#D1D5DB]">#</th>
                        <th className="px-6 py-3.5 font-bold min-w-[280px] border-r border-[#D1D5DB]">Brand Partner</th>
                        <th className="px-6 py-3.5 font-bold min-w-[150px] border-r border-[#D1D5DB]">Owner</th>
                        <th className="px-6 py-3.5 font-bold min-w-[220px] border-r border-[#D1D5DB]">Contact Information</th>
                        <th className="px-6 py-3.5 font-bold text-center w-[100px] border-r border-[#D1D5DB]">Products</th>
                        <th className="px-6 py-3.5 font-bold text-center w-[100px] border-r border-[#D1D5DB]">Mappings</th>
                        <th className="px-6 py-3.5 font-bold text-left min-w-[360px]">Actions</th>
                    </AdminRegistryTableHead>
                    <AdminRegistryTableBody>
                            {filteredBrands.map((brand, i) => {
                                const needsStorefront = brand.user?.email?.includes('brand.internal.horeca1') || !brand.user;
                                const statusVariant = STATUS_VARIANT[brand.approvalStatus] ?? 'pending';
                                return (
                                    <tr
                                        key={brand.id}
                                        onClick={() => openDetails(brand.id)}
                                        className="group hover:bg-[#F9FAFB]/60 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-3 text-center font-bold text-[#9CA3AF] text-[12px] align-middle border-r border-[#D1D5DB]">{i + 1}</td>
                                        <td className="px-6 py-3 align-middle border-r border-[#D1D5DB]">
                                            <div className="flex items-center gap-3">
                                                <div className="w-[42px] h-[42px] rounded-[10px] bg-[#F3F4F6] overflow-hidden shrink-0 border border-[#E5E7EB] flex items-center justify-center">
                                                    {brand.logoUrl ? (
                                                        <Image src={brand.logoUrl} alt={brand.name} width={42} height={42} sizes="42px" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-[15px] font-black text-[#7C3AED]">{getInitials(brand.name)}</span>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[14px] font-bold text-[#111827] truncate group-hover:text-[#299E60] transition-colors">{brand.name}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <Link href={`/brand/${brand.slug}`} target="_blank" onClick={(e) => e.stopPropagation()}
                                                            className="text-[11px] text-[#299E60] hover:underline flex items-center gap-0.5">
                                                            /{brand.slug} <ExternalLink size={10} />
                                                        </Link>
                                                        <span className="w-1.5 h-1.5 rounded-full bg-[#E5E7EB]" />
                                                        <AdminStatusBadge
                                                            variant={statusVariant}
                                                            label={STATUS_LABEL[brand.approvalStatus] ?? brand.approvalStatus}
                                                            className="normal-case"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-[13px] font-bold text-[#374151] align-middle border-r border-[#D1D5DB]">
                                            {needsStorefront ? (
                                                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-[6px]">Admin Managed</span>
                                            ) : (
                                                brand.user?.fullName ?? '—'
                                            )}
                                        </td>
                                        <td className="px-6 py-3 align-middle border-r border-[#D1D5DB]">
                                            <div className="flex flex-col gap-0.5">
                                                {!needsStorefront && brand.user?.email && (
                                                    <span className="text-[13px] font-medium text-[#4B5563] truncate block max-w-[200px]">{brand.user.email}</span>
                                                )}
                                                {brand.user?.phone && (
                                                    <span className="text-[11px] text-[#9CA3AF] font-semibold font-mono">{brand.user.phone}</span>
                                                )}
                                                {needsStorefront && !brand.user?.phone && (
                                                    <span className="text-[12px] text-[#9CA3AF]">—</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-center font-bold text-[#111827] text-[14px] align-middle border-r border-[#D1D5DB]">{brand._count.masterProducts}</td>
                                        <td className="px-6 py-3 text-center font-bold text-[#111827] text-[14px] align-middle border-r border-[#D1D5DB]">{brand._count.productMappings}</td>
                                        <td className="px-6 py-3 text-left align-middle">
                                            <AdminRegistryRowActions
                                                detailsHref={`/admin/brands/${brand.id}`}
                                                onDetailsClick={(e) => e.stopPropagation()}
                                                impersonateButton={
                                                    <div onClick={(e) => e.stopPropagation()}>
                                                        {needsStorefront && canCreateStorefront ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setStorefrontTarget({ id: brand.id, name: brand.name })}
                                                                className="h-[34px] px-3 bg-[#299E60] text-white rounded-[8px] text-[12px] font-bold hover:bg-[#238a54] transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm"
                                                            >
                                                                <Store size={13} />
                                                                Create Storefront
                                                            </button>
                                                        ) : (
                                                            <AdminImpersonateButton
                                                                target="brand"
                                                                entityId={brand.id}
                                                                label="Impersonate"
                                                                variant="primary"
                                                                className="h-[34px] px-3 text-[12px] whitespace-nowrap"
                                                            />
                                                        )}
                                                    </div>
                                                }
                                                extraActions={
                                                    brand.approvalStatus !== 'approved' && canEditBrands ? (
                                                        <button
                                                            type="button"
                                                            disabled={actionLoading === brand.id}
                                                            onClick={(e) => void handleApproveBrand(brand, e)}
                                                            className="h-[34px] px-3 bg-[#299E60] text-white rounded-[8px] text-[12px] font-bold hover:bg-[#238a54] transition-all flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                                                        >
                                                            {actionLoading === brand.id ? (
                                                                <Loader2 size={12} className="animate-spin" />
                                                            ) : (
                                                                <ShieldCheck size={12} />
                                                            )}
                                                            Approve
                                                        </button>
                                                    ) : undefined
                                                }
                                                menuOpen={activeMenu?.id === brand.id}
                                                showMenu={canEditBrands || canDeleteBrands || (needsStorefront && !!brand.user)}
                                                onMenuToggle={(e) => {
                                                    e.stopPropagation();
                                                    if (activeMenu?.id === brand.id) {
                                                        setActiveMenu(null);
                                                        return;
                                                    }
                                                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                                    setActiveMenu({ id: brand.id, top: rect.bottom + 6, right: window.innerWidth - rect.right });
                                                }}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                    </AdminRegistryTableBody>
                </AdminRegistryTableShell>
            )}

            <AdminRegistryOverflowMenu active={activeMenu}>
                {(() => {
                    const b = brands.find(x => x.id === activeMenu?.id);
                    if (!b) return null;
                    const needsStorefront = b.user?.email?.includes('brand.internal.horeca1') || !b.user;
                    return (
                        <>
                            {needsStorefront && !!b.user && (
                                <AdminRegistryOverflowMenuItem
                                    onClick={() => {
                                        setActiveMenu(null);
                                        void startBrandImpersonate(b.id);
                                    }}
                                    icon={<Building2 size={14} className="text-[#299E60]" />}
                                    label="Impersonate (placeholder)"
                                />
                            )}
                            {canEditBrands && b.approvalStatus !== 'rejected' && (
                                <AdminRegistryOverflowMenuItem
                                    onClick={() => { setActiveMenu(null); setRejectTarget({ id: b.id, name: b.name }); }}
                                    icon={<X size={14} className="text-red-400" />}
                                    label="Reject"
                                />
                            )}
                            {canDeleteBrands && (
                                <AdminRegistryOverflowMenuItem
                                    onClick={() => void handleDeleteBrand(b)}
                                    icon={<Trash2 size={14} />}
                                    label="Delete permanently"
                                    danger
                                />
                            )}
                        </>
                    );
                })()}
            </AdminRegistryOverflowMenu>

            {showCreate && (
                <BrandFormModal
                    onClose={() => setShowCreate(false)}
                    onCreated={(data) => {
                        setBrands(prev => [{ ...(data as Brand), _count: { masterProducts: 0, productMappings: 0 } }, ...prev]);
                        setShowCreate(false);
                    }}
                />
            )}

            {storefrontTarget && (
                <BrandFormModal
                    brand={storefrontTarget}
                    onClose={() => setStorefrontTarget(null)}
                    onCreated={() => {
                        setStorefrontTarget(null);
                        void fetchData();
                    }}
                />
            )}

            {rejectTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRejectTarget(null)}>
                    <div className="bg-white rounded-[16px] w-full max-w-[440px] p-6 shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-[16px] font-bold text-[#181725] mb-4">Reject: {rejectTarget.name}</h3>
                        <textarea
                            value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)}
                            placeholder="Reason for rejection (optional)..."
                            rows={3}
                            className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#E74C3C]/40 resize-none mb-4"
                        />
                        <div className="flex items-center gap-3 justify-end">
                            <button onClick={() => { setRejectTarget(null); setRejectNote(''); }}
                                className="h-[40px] px-5 bg-gray-100 rounded-[10px] text-[13px] font-bold text-[#7C7C7C] hover:bg-gray-200">Cancel</button>
                            <button onClick={() => void handleRejectBrand(rejectTarget.id, rejectNote)} disabled={!!actionLoading}
                                className="h-[40px] px-5 bg-[#E74C3C] text-white rounded-[10px] text-[13px] font-bold disabled:opacity-50 flex items-center gap-1.5">
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
