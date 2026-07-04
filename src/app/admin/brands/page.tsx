'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Check, X, Search, Clock, CheckCircle, Loader2, ClipboardList, Store, Pencil,
    MessageSquare, ExternalLink, LayoutDashboard, Plus, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import BrandFormModal from '@/components/features/admin/BrandFormModal';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';

interface Brand {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    tagline: string | null;
    approvalStatus: string;
    isActive: boolean;
    createdAt: string;
    user: { id: string; fullName: string; email: string } | null;
    _count: { masterProducts: number; productMappings: number };
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function AdminBrandsPage() {
    const router = useRouter();
    const perms = useAdminPermissions();
    const confirm = useConfirm();
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const [brands, setBrands] = useState<Brand[]>([]);
    const [brandFilter, setBrandFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
    const [rejectNote, setRejectNote] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const brandsRes = await fetch('/api/v1/admin/brands');
            const brandsJson = await brandsRes.json();
            if (brandsJson.success) setBrands(brandsJson.data ?? []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const viewBrandPortal = async (brand: Brand) => {
        await fetch('/api/v1/admin/impersonate/brand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandId: brand.id }),
        });
        router.push('/brand/portal');
    };

    const handleApproveBrand = async (brand: Brand) => {
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
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Approval failed');
        } finally { setActionLoading(null); }
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
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Rejection failed');
        } finally { setActionLoading(null); setRejectTarget(null); setRejectNote(''); }
    };

    const handleDeleteBrand = async (brand: Brand) => {
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
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Delete failed');
        } finally { setActionLoading(null); }
    };

    const q = searchQuery.toLowerCase();
    const filteredBrands = brands
        .filter(b => brandFilter === 'all' || b.approvalStatus === brandFilter)
        .filter(b => !q || b.name.toLowerCase().includes(q) || (b.user?.email?.toLowerCase().includes(q) ?? false));

    const pendingBrandsCount = brands.filter(b => b.approvalStatus === 'pending').length;

    const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
        pending: { bg: '#FFF7E6', text: '#F59E0B' },
        approved: { bg: '#EEF8F1', text: '#53B175' },
        rejected: { bg: '#FEF2F2', text: '#E74C3C' },
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 animate-spin text-[#299E60]" />
            </div>
        );
    }

    return (
        <div className="max-w-[1600px] mx-auto space-y-7 animate-in fade-in duration-500">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-[28px] font-[900] text-[#181725] tracking-tight">Brands</h1>
                    <p className="text-[#7C7C7C] font-medium mt-1">Review brand applications and manage storefronts</p>
                </div>
                {perms.canWriteSettings && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="h-[44px] px-5 bg-[#299E60] text-white rounded-[12px] text-[13px] font-bold hover:bg-[#238a54] transition-all shadow-sm flex items-center gap-2 shrink-0"
                    >
                        <Plus size={16} />
                        Add Brand
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                    { label: 'Total Brands', value: brands.length, icon: Store, color: '#3B82F6', bg: '#EFF6FF' },
                    { label: 'Pending Approval', value: pendingBrandsCount, icon: Clock, color: '#F59E0B', bg: '#FFF7E6' },
                    { label: 'Approved Brands', value: brands.filter(b => b.approvalStatus === 'approved').length, icon: CheckCircle, color: '#299E60', bg: '#EEF8F1' },
                ].map((stat, idx) => (
                    <div key={idx} className="bg-white p-5 rounded-[16px] border border-[#EEEEEE] shadow-sm flex items-center gap-4">
                        <div className="w-[50px] h-[50px] rounded-[14px] flex items-center justify-center shrink-0"
                            style={{ backgroundColor: stat.bg, color: stat.color }}>
                            <stat.icon size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider">{stat.label}</p>
                            <h3 className="text-[26px] font-[900] text-[#181725] leading-none mt-0.5">{stat.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <Link href="/admin/brand-distributor-invites"
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-[12px] text-[12px] font-bold text-[#7C7C7C] hover:border-[#53B175]/40 hover:text-[#53B175] transition-colors">
                    <MessageSquare size={13} /> Distributor Invites
                </Link>
            </div>

            <div className="bg-white rounded-[24px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#EEEEEE] flex items-center justify-between gap-4 flex-wrap">
                    <h2 className="text-[18px] font-[900] text-[#181725]">Brand Applications</h2>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
                                <button key={f} onClick={() => setBrandFilter(f)}
                                    className={cn('px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all capitalize',
                                        brandFilter === f ? 'bg-[#299E60] text-white' : 'bg-[#F8F9FB] text-[#AEAEAE] hover:text-[#7C7C7C]')}>
                                    {f}
                                </button>
                            ))}
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={15} />
                            <input
                                type="text"
                                placeholder="Search brands..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-[240px] bg-[#F8F9FB] border border-[#EEEEEE] rounded-[12px] py-2.5 pl-10 pr-4 text-[13px] outline-none placeholder:text-[#AEAEAE] font-medium focus:border-[#299E60]/40 focus:bg-white"
                            />
                        </div>
                    </div>
                </div>

                <div className="w-full overflow-x-auto">
                    <table className="w-full border-collapse text-left text-[13px] min-w-[960px]">
                        <thead>
                            <tr className="bg-[#F9FAFB] border-b border-[#EEEEEE] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                                <th className="px-4 py-2.5 font-bold text-center w-[48px]">#</th>
                                <th className="px-4 py-2.5 font-bold min-w-[220px]">Brand</th>
                                <th className="px-4 py-2.5 font-bold min-w-[150px]">Owner</th>
                                <th className="px-4 py-2.5 font-bold text-center w-[80px]">Products</th>
                                <th className="px-4 py-2.5 font-bold w-[110px]">Date</th>
                                <th className="px-4 py-2.5 font-bold text-right pr-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F3F4F6]">
                            {filteredBrands.map((brand, i) => {
                                const sc = STATUS_COLORS[brand.approvalStatus] ?? STATUS_COLORS.pending;
                                const isDummyEmail = brand.user?.email?.includes('brand.internal.horeca1') || !brand.user;
                                return (
                                    <tr
                                        key={brand.id}
                                        onClick={() => router.push(`/admin/brands/${brand.id}`)}
                                        className="group hover:bg-[#F9FAFB]/60 transition-colors cursor-pointer"
                                    >
                                        <td className="px-4 py-2.5 text-center font-bold text-[#9CA3AF] text-[12px]">{i + 1}</td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-[40px] h-[40px] rounded-[10px] bg-[#F3F4F6] overflow-hidden shrink-0 border border-[#E5E7EB] flex items-center justify-center">
                                                    {brand.logoUrl ? (
                                                        <img src={brand.logoUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-[15px] font-black text-[#299E60]">{getInitials(brand.name)}</span>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[14px] font-bold text-[#181725] truncate group-hover:text-[#299E60] transition-colors">{brand.name}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <Link href={`/brand/${brand.slug}`} target="_blank" onClick={(e) => e.stopPropagation()}
                                                            className="text-[11px] text-[#299E60] hover:underline flex items-center gap-0.5">
                                                            /{brand.slug} <ExternalLink size={10} />
                                                        </Link>
                                                        <span className="w-1.5 h-1.5 rounded-full bg-[#E5E7EB]" />
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                                                            style={{ backgroundColor: sc.bg, color: sc.text, borderColor: `${sc.text}20` }}>
                                                            {brand.approvalStatus}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex flex-col gap-0.5 min-w-0">
                                                {isDummyEmail ? (
                                                    <span className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-[6px] w-fit">Admin Managed</span>
                                                ) : (
                                                    <>
                                                        <span className="text-[13px] font-bold text-[#374151] truncate">{brand.user?.fullName ?? '—'}</span>
                                                        {brand.user?.email && <span className="text-[11px] text-[#9CA3AF] font-semibold truncate">{brand.user.email}</span>}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-center font-bold text-[#111827] text-[14px]">{brand._count.masterProducts}</td>
                                        <td className="px-4 py-2.5 text-[13px] text-[#7C7C7C] whitespace-nowrap">{formatDate(brand.createdAt)}</td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Link href={`/admin/brands/${brand.id}`} onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center gap-1 h-[32px] px-2.5 bg-[#EEF8F1] text-[#299E60] rounded-[8px] text-[12px] font-bold hover:bg-[#299E60] hover:text-white transition-all whitespace-nowrap shrink-0"
                                                    title={isDummyEmail ? 'Create Storefront' : 'Edit Brand Storefront'}>
                                                    {isDummyEmail ? <><Plus size={14} strokeWidth={2.5} /> Create Storefront</> : <><Pencil size={13} /> Edit</>}
                                                </Link>
                                                <button onClick={(e) => { e.stopPropagation(); viewBrandPortal(brand); }}
                                                    className="flex items-center justify-center h-[32px] w-[32px] bg-[#F0F4FF] text-[#3B82F6] rounded-[8px] hover:bg-[#3B82F6] hover:text-white transition-all shrink-0"
                                                    title="View Brand Portal">
                                                    <LayoutDashboard size={14} />
                                                </button>
                                                {brand.approvalStatus !== 'approved' && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleApproveBrand(brand); }} disabled={!!actionLoading}
                                                        className="flex items-center justify-center h-[32px] w-[32px] bg-[#299E60] text-white rounded-[8px] disabled:opacity-50 transition-all shrink-0" title="Approve brand">
                                                        {actionLoading === brand.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                    </button>
                                                )}
                                                {brand.approvalStatus !== 'rejected' && (
                                                    <button onClick={(e) => { e.stopPropagation(); setRejectTarget({ id: brand.id, name: brand.name }); }}
                                                        className="flex items-center justify-center h-[32px] w-[32px] bg-[#E74C3C] text-white rounded-[8px] transition-all shrink-0" title="Reject brand">
                                                        <X size={14} />
                                                    </button>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteBrand(brand); }} disabled={actionLoading === brand.id}
                                                    title="Delete brand permanently"
                                                    className="flex items-center justify-center h-[32px] w-[32px] bg-[#FEF2F2] text-[#E74C3C] rounded-[8px] hover:bg-[#E74C3C] hover:text-white transition-all disabled:opacity-50 shrink-0">
                                                    {actionLoading === brand.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredBrands.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-16 text-center">
                                        <ClipboardList size={36} className="mx-auto text-[#EEEEEE] mb-2" />
                                        <p className="text-[#AEAEAE] font-bold text-[14px]">No brands found</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-5 bg-[#FDFDFD] border-t border-[#EEEEEE]">
                    <p className="text-[11px] text-[#AEAEAE] font-bold uppercase tracking-wider">
                        {filteredBrands.length} brand{filteredBrands.length !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

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
                            <button onClick={() => handleRejectBrand(rejectTarget.id, rejectNote)} disabled={!!actionLoading}
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
