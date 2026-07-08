'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
    Search,
    Loader2,
    Plus,
    Store,
    Clock,
    CheckCircle,
    Boxes,
    MoreVertical,
    Trash2,
    X,
    MessageSquare,
    ClipboardList,
    ExternalLink,
    ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import BrandFormModal from '@/components/features/admin/BrandFormModal';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import {
    AdminStatusBadge,
    AdminImpersonateButton,
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

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_VARIANT: Record<string, 'verified' | 'pending' | 'inactive'> = {
    approved: 'verified',
    pending: 'pending',
    rejected: 'inactive',
};

export default function AdminBrandsPage() {
    const router = useRouter();
    const { has } = usePermissions();
    const canCreateBrand = has('brands.create');
    const canEditBrands = has('brands.edit');
    const canDeleteBrands = has('brands.delete');
    const confirm = useConfirm();

    const [searchQuery, setSearchQuery] = useState('');
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [brandFilter, setBrandFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    const [showCreate, setShowCreate] = useState(false);
    const [activeMenu, setActiveMenu] = useState<{ id: string; top: number; right: number } | null>(null);
    const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
    const [rejectNote, setRejectNote] = useState('');

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
            message: 'This permanently removes the brand along with all its catalog products, distributor links, team members, and distributor invites. Cannot be undone.',
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
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 bg-white rounded-[24px] border border-[#EEEEEE] shadow-sm py-24 m-8">
                <Loader2 className="animate-spin text-[#299E60]" size={40} />
                <span className="text-[13px] font-bold text-[#6B7280]">Loading brands registry...</span>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10 px-4 md:px-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[#EEEEEE] pb-5">
                <div>
                    <h1 className="text-[30px] font-extrabold text-[#111827] tracking-tight mb-1">Brands Registry</h1>
                    <p className="text-[#6B7280] text-[14px] font-medium">Review brand applications, manage storefronts, and audit catalog mappings</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <Link
                        href="/admin/brand-distributor-invites"
                        className="h-[44px] px-4 bg-white border border-[#E5E7EB] hover:bg-gray-50 text-[#374151] rounded-[12px] text-[13px] font-bold flex items-center gap-2 transition-colors shadow-sm"
                    >
                        <MessageSquare size={16} /> Distributor Invites
                    </Link>
                    {canCreateBrand && (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="h-[44px] px-5 bg-[#299E60] text-white rounded-[12px] text-[13px] font-bold hover:bg-[#238a54] active:scale-95 transition-all shadow-md shadow-[#299E60]/10 flex items-center gap-2 shrink-0"
                        >
                            <Plus size={16} />
                            Add Brand
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] bg-[#EFF6FF] flex items-center justify-center text-[#3B82F6]">
                        <Store size={22} />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Total Brands</span>
                        <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{brands.length}</span>
                    </div>
                </div>
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] bg-[#FFF8EB] flex items-center justify-center text-[#D97706]">
                        <Clock size={22} />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Pending Approval</span>
                        <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{pendingBrandsCount}</span>
                    </div>
                </div>
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] bg-[#EEF8F1] flex items-center justify-center text-[#299E60]">
                        <CheckCircle size={22} />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Approved Brands</span>
                        <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{approvedCount}</span>
                    </div>
                </div>
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] bg-[#FDF2F2] flex items-center justify-center text-[#8B5CF6]">
                        <Boxes size={22} />
                    </div>
                    <div>
                        <span className="text-[12px] font-bold text-[#9CA3AF] uppercase tracking-wider block">Master Products</span>
                        <span className="text-[22px] font-black text-[#1F2937] leading-none mt-1 inline-block">{totalProducts}</span>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-[16px] border border-[#EEEEEE] shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-1 flex-wrap">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setBrandFilter(f)}
                            className={cn(
                                'px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all capitalize',
                                brandFilter === f ? 'bg-[#299E60] text-white' : 'bg-[#F3F4F6] text-[#6B7280] hover:text-[#111827]',
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>
                <div className="relative group w-full sm:w-[320px]">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={16} />
                    <input
                        type="text"
                        placeholder="Search by brand, owner, email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-[42px] w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] pl-10 pr-4 text-[13px] outline-none transition-all placeholder:text-[#9CA3AF] font-medium focus:border-[#299E60]/50 focus:bg-white focus:shadow-sm"
                    />
                </div>
            </div>

            {filteredBrands.length === 0 ? (
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] p-24 text-center text-[#6B7280] font-medium shadow-sm">
                    <ClipboardList className="mx-auto text-[#D1D5DB] mb-3" size={40} />
                    {searchQuery || brandFilter !== 'all' ? (
                        <>
                            <h4 className="text-[15px] font-bold text-[#374151]">No matched results</h4>
                            <p className="text-[13px] text-[#9CA3AF] mt-1">Try adjusting your search or filter.</p>
                        </>
                    ) : (
                        <>
                            <h4 className="text-[15px] font-bold text-[#374151]">No brands registered yet</h4>
                            <p className="text-[13px] text-[#9CA3AF] mt-1">Click &quot;Add Brand&quot; to register your first brand partner.</p>
                        </>
                    )}
                </div>
            ) : (
                <div className="w-full overflow-x-auto rounded-[16px] border border-[#EEEEEE] bg-white shadow-sm">
                    <table className="w-full border-collapse text-left text-[13px] min-w-[1100px]">
                        <thead>
                            <tr className="bg-[#F9FAFB] border-b border-[#EEEEEE] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                                <th className="px-6 py-2.5 font-bold text-center w-[60px]">#</th>
                                <th className="px-6 py-2.5 font-bold min-w-[280px]">Brand Partner</th>
                                <th className="px-6 py-2.5 font-bold min-w-[150px]">Owner</th>
                                <th className="px-6 py-2.5 font-bold min-w-[220px]">Contact Information</th>
                                <th className="px-6 py-2.5 font-bold text-center w-[100px]">Products</th>
                                <th className="px-6 py-2.5 font-bold text-center w-[100px]">Mappings</th>
                                <th className="px-6 py-2.5 font-bold text-right pr-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F3F4F6]">
                            {filteredBrands.map((brand, i) => {
                                const isDummyEmail = brand.user?.email?.includes('brand.internal.horeca1') || !brand.user;
                                const statusVariant = STATUS_VARIANT[brand.approvalStatus] ?? 'pending';
                                return (
                                    <tr
                                        key={brand.id}
                                        onClick={() => openDetails(brand.id)}
                                        className="group hover:bg-[#F9FAFB]/60 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-2.5 text-center font-bold text-[#9CA3AF] text-[12px]">{i + 1}</td>
                                        <td className="px-6 py-2.5">
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
                                                        <AdminStatusBadge variant={statusVariant} label={brand.approvalStatus} className="normal-case" />
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-2.5 text-[13px] font-bold text-[#374151]">
                                            {isDummyEmail ? (
                                                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-[6px]">Admin Managed</span>
                                            ) : (
                                                brand.user?.fullName ?? '—'
                                            )}
                                        </td>
                                        <td className="px-6 py-2.5">
                                            <div className="flex flex-col gap-0.5">
                                                {!isDummyEmail && brand.user?.email && (
                                                    <span className="text-[13px] font-medium text-[#4B5563] truncate block max-w-[200px]">{brand.user.email}</span>
                                                )}
                                                {brand.user?.phone && (
                                                    <span className="text-[11px] text-[#9CA3AF] font-semibold font-mono">{brand.user.phone}</span>
                                                )}
                                                {isDummyEmail && !brand.user?.phone && (
                                                    <span className="text-[12px] text-[#9CA3AF]">—</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-2.5 text-center font-bold text-[#111827] text-[14px]">{brand._count.masterProducts}</td>
                                        <td className="px-6 py-2.5 text-center font-bold text-[#111827] text-[14px]">{brand._count.productMappings}</td>
                                        <td className="px-6 py-2.5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <AdminImpersonateButton
                                                        target="brand"
                                                        entityId={brand.id}
                                                        label="View as Brand"
                                                        variant="primary"
                                                        className="h-[34px] px-3 text-[12px] whitespace-nowrap"
                                                    />
                                                </div>
                                                <Link
                                                    href={`/admin/brands/${brand.id}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="h-[34px] px-3 bg-white border border-[#E5E7EB] text-[#374151] rounded-[8px] text-[12px] font-bold hover:bg-[#F9FAFB] transition-all flex items-center justify-center whitespace-nowrap"
                                                >
                                                    Details
                                                </Link>
                                                {brand.approvalStatus !== 'approved' && canEditBrands && (
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
                                                )}
                                                {(canEditBrands || canDeleteBrands) && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (activeMenu?.id === brand.id) {
                                                                setActiveMenu(null);
                                                                return;
                                                            }
                                                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                                            setActiveMenu({ id: brand.id, top: rect.bottom + 6, right: window.innerWidth - rect.right });
                                                        }}
                                                        className={cn(
                                                            'w-[34px] h-[34px] flex items-center justify-center rounded-[10px] transition-all shadow-sm',
                                                            activeMenu?.id === brand.id
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
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {activeMenu && typeof window !== 'undefined' && createPortal(
                <div
                    style={{ position: 'fixed', top: activeMenu.top, right: activeMenu.right, zIndex: 12000 }}
                    className="w-44 bg-white rounded-[8px] shadow-xl border border-gray-100 py-1 overflow-hidden animate-in fade-in zoom-in duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    {(() => {
                        const b = brands.find(x => x.id === activeMenu.id);
                        if (!b) return null;
                        return (
                            <>
                                {canEditBrands && b.approvalStatus !== 'rejected' && (
                                    <button
                                        onClick={() => { setActiveMenu(null); setRejectTarget({ id: b.id, name: b.name }); }}
                                        className="w-full flex items-center gap-3 px-4 py-2 text-[13px] font-semibold text-[#4B4B4B] hover:bg-gray-50 transition-colors text-left"
                                    >
                                        <X size={14} className="text-red-400" />
                                        Reject
                                    </button>
                                )}
                                {canDeleteBrands && (
                                    <button
                                        onClick={() => void handleDeleteBrand(b)}
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

            {showCreate && (
                <BrandFormModal
                    onClose={() => setShowCreate(false)}
                    onCreated={(data) => {
                        setBrands(prev => [{ ...(data as Brand), _count: { masterProducts: 0, productMappings: 0 } }, ...prev]);
                        setShowCreate(false);
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
