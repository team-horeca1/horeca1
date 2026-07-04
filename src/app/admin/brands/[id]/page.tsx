'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
    ChevronLeft,
    Loader2,
    Check,
    ShieldCheck,
    ShieldX,
    XCircle,
    User,
    Mail,
    Phone,
    MapPin,
    MessageSquare,
    X,
    LayoutDashboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CategoryMultiPicker } from '@/components/features/brand/CategoryMultiPicker';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { AdminPasswordResetButton } from '@/components/features/admin/AdminPasswordResetButton';
import { AdminUserTeamPanel } from '@/components/features/admin/AdminUserTeamPanel';

interface BusinessAccountReview {
    legalName: string;
    displayName: string | null;
    gstin: string | null;
    billingAddressLine: string | null;
    billingCity: string | null;
    billingState: string | null;
    billingPincode: string | null;
    businessType: string | null;
    subType: string | null;
    businessSize: string | null;
    mobilePhone: string | null;
    workPhone: string | null;
    designation: string | null;
    remarks: string | null;
}

interface Brand {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    website: string | null;
    tagline: string | null;
    categories: string[];
    bgColor: string | null;
    showcaseImages: string[];
    brandTier: string | null;
    marketplaceVisibility: string | null;
    creditSupport: boolean | null;
    leadStatus: string | null;
    brandType: string | null;
    subType: string | null;
    businessSize: string | null;
    distributionPresence: string | null;
    targetSegments: string[];
    horecaFocused: boolean | null;
    retailFocused: boolean | null;
    approvalStatus: string;
    isActive: boolean;
    user: { id: string; fullName: string; email: string; phone: string | null; gstNumber: string | null } | null;
    businessAccount: BusinessAccountReview | null;
    _count: { masterProducts: number; productMappings: number };
}

function getInitials(name: string): string {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatLabel(value: string | null | undefined): string {
    if (value == null || value === '') return '—';
    return value;
}

function formatBool(value: boolean | null | undefined): string {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    return '—';
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#FFF7E6', text: '#F59E0B' },
    approved: { bg: '#EEF8F1', text: '#299E60' },
    rejected: { bg: '#FEF2F2', text: '#E74C3C' },
};

export default function AdminBrandEditPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const params = useParams<{ id: string }>();
    const { data: session } = useSession();
    const id = params.id;

    const fromApprovals = searchParams.get('from') === 'approvals';
    const isReviewMode = searchParams.get('edit') === 'true' || fromApprovals;

    const perms = (session?.user as { permissions?: string[] } | undefined)?.permissions;
    const canApprove = perms?.includes('brands.approve') ?? false;
    const canEditBrand = perms?.includes('brands.edit') ?? false;

    const viewBrandPortal = async () => {
        if (!brand) return;
        await fetch('/api/v1/admin/impersonate/brand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandId: brand.id }),
        });
        router.push('/brand/portal');
    };

    const [brand, setBrand] = useState<Brand | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [approvalLoading, setApprovalLoading] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectNote, setRejectNote] = useState('');

    const [form, setForm] = useState({
        name: '',
        tagline: '',
        description: '',
        website: '',
        logoUrl: null as string | null,
        bannerUrl: null as string | null,
        categories: [] as string[],
        bgColor: '#f0faf4' as string,
        showcaseImages: [] as string[],
        brandTier: '',
        marketplaceVisibility: '',
        creditSupport: false,
        leadStatus: '',
    });

    const loadBrand = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/admin/brands/${id}`);
            const d = await res.json();
            if (!d.success) throw new Error(d.error?.message || 'Failed to load brand');
            const b: Brand = d.data;
            setBrand(b);
            setForm({
                name: b.name,
                tagline: b.tagline ?? '',
                description: b.description ?? '',
                website: b.website ?? '',
                logoUrl: b.logoUrl,
                bannerUrl: b.bannerUrl,
                categories: b.categories ?? [],
                bgColor: b.bgColor ?? '#f0faf4',
                showcaseImages: b.showcaseImages ?? [],
                brandTier: b.brandTier ?? '',
                marketplaceVisibility: b.marketplaceVisibility ?? '',
                creditSupport: b.creditSupport ?? false,
                leadStatus: b.leadStatus ?? '',
            });
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Failed to load brand');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void loadBrand();
    }, [loadBrand]);

    const afterApprovalDecision = (newStatus: string) => {
        if (fromApprovals) {
            router.push('/admin/approvals');
            return;
        }
        setBrand((prev) => (prev ? { ...prev, approvalStatus: newStatus } : prev));
    };

    const handleApprove = async () => {
        if (!brand || approvalLoading) return;
        setApprovalLoading(true);
        try {
            const res = await fetch(`/api/v1/admin/brands/${brand.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'approved' }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Approval failed');
            toast.success(`${brand.name} approved`);
            afterApprovalDecision('approved');
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Approval failed');
        } finally {
            setApprovalLoading(false);
        }
    };

    const handleReject = async () => {
        if (!brand || !rejectNote.trim() || approvalLoading) return;
        setApprovalLoading(true);
        try {
            const res = await fetch(`/api/v1/admin/brands/${brand.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rejected', reviewNote: rejectNote.trim() }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Rejection failed');
            toast.success('Brand rejected');
            setShowRejectModal(false);
            setRejectNote('');
            afterApprovalDecision('rejected');
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Rejection failed');
        } finally {
            setApprovalLoading(false);
        }
    };

    const handleRevoke = async () => {
        if (!brand || approvalLoading) return;
        setApprovalLoading(true);
        try {
            const res = await fetch(`/api/v1/admin/brands/${brand.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rejected' }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Revoke failed');
            toast.success('Brand approval revoked');
            afterApprovalDecision('rejected');
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Revoke failed');
        } finally {
            setApprovalLoading(false);
        }
    };

    const save = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/v1/admin/brands/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name || undefined,
                    tagline: form.tagline || null,
                    description: form.description || null,
                    website: form.website || null,
                    logoUrl: form.logoUrl,
                    bannerUrl: form.bannerUrl,
                    categories: form.categories,
                    bgColor: form.bgColor,
                    showcaseImages: form.showcaseImages,
                    brandTier: form.brandTier || null,
                    marketplaceVisibility: form.marketplaceVisibility || null,
                    creditSupport: form.creditSupport,
                    leadStatus: form.leadStatus || null,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Save failed');
            toast.success('Brand saved');
            await loadBrand();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-[#53B175]" />
            </div>
        );
    }

    if (!brand) {
        return <div className="min-h-screen flex items-center justify-center text-gray-500">Brand not found</div>;
    }

    const statusStyle = STATUS_STYLE[brand.approvalStatus] ?? STATUS_STYLE.pending;
    const ba = brand.businessAccount;
    const owner = brand.user;
    // Admin-created brands have no owner account (or a placeholder internal email) and
    // no submitted onboarding profile — treat those as a blank "create storefront" form.
    const isDraftStorefront = !owner || owner.email.includes('brand.internal.horeca1');
    const hasApplication = !!ba || (!!owner && !owner.email.includes('brand.internal.horeca1'));
    const billingParts = [
        ba?.billingAddressLine,
        ba?.billingCity,
        ba?.billingState,
        ba?.billingPincode,
    ].filter(Boolean);
    const billingAddress = billingParts.length > 0 ? billingParts.join(', ') : null;
    const gst = ba?.gstin ?? owner?.gstNumber ?? null;
    const phone = owner?.phone ?? ba?.mobilePhone ?? ba?.workPhone;

    const reviewFields: Array<{ label: string; value: string }> = [
        { label: 'Brand Type', value: formatLabel(brand.brandType ?? ba?.businessType) },
        { label: 'Sub Type', value: formatLabel(brand.subType ?? ba?.subType) },
        { label: 'Business Size', value: formatLabel(brand.businessSize ?? ba?.businessSize) },
        { label: 'Distribution Presence', value: formatLabel(brand.distributionPresence) },
        { label: 'Target Segments', value: brand.targetSegments?.length ? brand.targetSegments.join(', ') : '—' },
        { label: 'HoReCa Focused', value: formatBool(brand.horecaFocused) },
        { label: 'Retail Focused', value: formatBool(brand.retailFocused) },
        { label: 'Website', value: formatLabel(brand.website) },
        { label: 'Product Categories', value: brand.categories?.length ? brand.categories.join(', ') : '—' },
        { label: 'GSTIN', value: formatLabel(gst) },
        { label: 'Registered Address', value: formatLabel(billingAddress) },
        { label: 'Mobile Phone', value: formatLabel(phone) },
        { label: 'Work Phone', value: formatLabel(ba?.workPhone) },
        { label: 'Designation', value: formatLabel(ba?.designation) },
        { label: 'Remarks', value: formatLabel(ba?.remarks) },
    ];

    return (
        <div className="min-h-screen bg-[#F8F9FA]">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100">
                <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.back()}
                            className="p-2.5 hover:bg-gray-100 rounded-2xl transition-colors">
                            <ChevronLeft size={20} className="text-gray-700" />
                        </button>
                        <div>
                            <h1 className="text-[18px] font-extrabold text-[#1A1C1E]">{brand.name}</h1>
                            <p className="text-[12px] text-gray-400">
                                {isDraftStorefront ? 'Admin-managed storefront' : owner?.email} · {brand.approvalStatus}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {canEditBrand && !isDraftStorefront && (
                            <button
                                type="button"
                                onClick={() => void viewBrandPortal()}
                                className="flex items-center gap-2 px-4 py-2.5 bg-[#EDE9FE] border border-[#7C3AED]/20 text-[#7C3AED] text-[13px] font-bold rounded-2xl hover:bg-[#DDD6FE] transition-colors"
                            >
                                <LayoutDashboard size={16} />
                                View Brand Portal
                            </button>
                        )}
                        <button onClick={save} disabled={saving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[#53B175] text-white text-[14px] font-bold rounded-2xl hover:bg-[#3d9e5f] transition-colors disabled:opacity-60">
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            {isDraftStorefront ? 'Save Storefront' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8 pb-32 space-y-6">
                {fromApprovals && brand.approvalStatus === 'pending' && (
                    <div className="bg-[#FFF7E6] border border-[#F59E0B]/30 rounded-2xl px-4 py-3 text-[13px] font-semibold text-[#92400E]">
                        Review this brand application before approving.
                    </div>
                )}
                {isDraftStorefront && !fromApprovals && (
                    <div className="bg-[#EEF8F1] border border-[#299E60]/25 rounded-2xl px-4 py-3 text-[13px] font-semibold text-[#1f6b41]">
                        This is an admin-managed brand with no owner application. Fill in the storefront details below — logo, banner, info and categories — then Save to publish it.
                    </div>
                )}

                {/* Profile overview + verification actions */}
                <div className="bg-white rounded-[16px] border border-[#EEEEEE] shadow-sm overflow-hidden p-6 flex flex-col lg:flex-row items-center lg:items-stretch gap-6">
                    <div className="flex flex-col items-center justify-center shrink-0 w-[140px]">
                        <div className="w-[120px] h-[120px] rounded-[16px] bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center p-3">
                            {brand.logoUrl ? (
                                <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-contain" />
                            ) : (
                                <span className="text-[32px] font-black text-[#7C3AED]">{getInitials(brand.name)}</span>
                            )}
                        </div>
                        <span
                            className="mt-3 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider"
                            style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                        >
                            {brand.approvalStatus}
                        </span>
                    </div>

                    <div className="flex-1 min-w-0 text-center lg:text-left">
                        <div className="flex flex-col lg:flex-row lg:items-center gap-2 justify-center lg:justify-start">
                            <h2 className="text-[22px] font-black text-[#111827]">{brand.name}</h2>
                            {brand.approvalStatus === 'approved' && (
                                <div className="self-center flex items-center gap-1 bg-[#EEF8F1] border border-[#D1FAE5] px-2.5 py-0.5 rounded-full text-[10px] font-bold text-[#299E60] uppercase tracking-wide">
                                    <ShieldCheck size={11} fill="#299E60" className="text-white" />
                                    Verified Brand
                                </div>
                            )}
                        </div>
                        {brand.tagline && (
                            <p className="text-[13px] text-[#6B7280] font-medium mt-1">{brand.tagline}</p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 border-t border-[#F3F4F6] pt-4 text-left">
                            {owner ? (
                                <>
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-[30px] h-[30px] rounded-[8px] bg-[#EDE9FE] flex items-center justify-center text-[#7C3AED]">
                                            <User size={13} />
                                        </div>
                                        <div className="min-w-0">
                                            <span className="text-[10px] text-[#9CA3AF] uppercase block font-bold">Owner</span>
                                            <span className="text-[12px] font-bold text-[#374151] truncate block">{owner.fullName}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-[30px] h-[30px] rounded-[8px] bg-[#EDE9FE] flex items-center justify-center text-[#7C3AED]">
                                            <Mail size={13} />
                                        </div>
                                        <div className="min-w-0">
                                            <span className="text-[10px] text-[#9CA3AF] uppercase block font-bold">Email</span>
                                            <span className="text-[12px] font-bold text-[#374151] truncate block">{owner.email}</span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-2.5 sm:col-span-2">
                                    <div className="w-[30px] h-[30px] rounded-[8px] bg-[#F3F4F6] flex items-center justify-center text-[#9CA3AF]">
                                        <User size={13} />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="text-[10px] text-[#9CA3AF] uppercase block font-bold">Owner</span>
                                        <span className="text-[12px] font-bold text-[#9CA3AF] block">No owner account linked</span>
                                    </div>
                                </div>
                            )}
                            {phone && (
                                <div className="flex items-center gap-2.5">
                                    <div className="w-[30px] h-[30px] rounded-[8px] bg-[#EDE9FE] flex items-center justify-center text-[#7C3AED]">
                                        <Phone size={13} />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="text-[10px] text-[#9CA3AF] uppercase block font-bold">Phone</span>
                                        <span className="text-[12px] font-bold text-[#374151] block">{phone}</span>
                                    </div>
                                </div>
                            )}
                            {billingAddress && (
                                <div className="flex items-center gap-2.5">
                                    <div className="w-[30px] h-[30px] rounded-[8px] bg-[#EDE9FE] flex items-center justify-center text-[#7C3AED]">
                                        <MapPin size={13} />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="text-[10px] text-[#9CA3AF] uppercase block font-bold">Registered Office</span>
                                        <span className="text-[12px] font-bold text-[#374151] truncate block">{billingAddress}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        {owner && !isDraftStorefront && (
                            <div className="mt-4 flex justify-start">
                                <AdminPasswordResetButton
                                    user={owner}
                                    permission="brands.edit"
                                    accent="#7C3AED"
                                />
                            </div>
                        )}
                    </div>

                    {canApprove && (
                        <div className="w-full lg:w-[220px] border-t lg:border-t-0 lg:border-l border-[#F3F4F6] pt-6 lg:pt-0 lg:pl-6 flex flex-col justify-center gap-2.5">
                            <span className="text-[11px] font-bold text-[#9CA3AF] uppercase text-center lg:text-left">Verification Actions</span>
                            {brand.approvalStatus !== 'approved' && (
                                <button
                                    onClick={() => void handleApprove()}
                                    disabled={approvalLoading}
                                    className="w-full py-2.5 rounded-[10px] text-[12px] font-bold transition-all shadow-sm flex items-center justify-center gap-2 border bg-[#299E60] border-[#299E60] text-white hover:bg-[#238a54] disabled:opacity-50"
                                >
                                    {approvalLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                                    {approvalLoading ? 'Updating...' : 'Approve & Verify'}
                                </button>
                            )}
                            {brand.approvalStatus === 'approved' && (
                                <button
                                    onClick={() => void handleRevoke()}
                                    disabled={approvalLoading}
                                    className="w-full py-2.5 rounded-[10px] text-[12px] font-bold transition-all shadow-sm flex items-center justify-center gap-2 border bg-amber-500 border-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                                >
                                    {approvalLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldX size={13} />}
                                    Revoke Approval
                                </button>
                            )}
                            {brand.approvalStatus !== 'rejected' && (
                                <button
                                    onClick={() => setShowRejectModal(true)}
                                    disabled={approvalLoading}
                                    className="w-full py-2.5 rounded-[10px] text-[12px] font-bold transition-all shadow-sm flex items-center justify-center gap-2 bg-[#EF4444] border border-[#EF4444] text-white hover:bg-[#DC2626] disabled:opacity-50"
                                >
                                    <XCircle size={13} />
                                    Reject Application
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Application review (read-only) — only when there's a real submitted application */}
                {hasApplication && (isReviewMode || brand.approvalStatus === 'pending') && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
                        <h2 className="text-[15px] font-bold text-[#181725]">Application Review</h2>
                        <p className="text-[12px] text-gray-500 -mt-2">Submitted onboarding profile — review before approving.</p>
                        <div className="grid sm:grid-cols-2 gap-4">
                            {reviewFields.map((f) => (
                                <div key={f.label} className="border border-[#F3F4F6] rounded-xl px-4 py-3">
                                    <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">{f.label}</p>
                                    <p className="text-[13px] font-semibold text-[#181725] mt-1 break-words">{f.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: 'Master Products', value: brand._count.masterProducts },
                        { label: 'Mapped Products', value: brand._count.productMappings },
                        { label: 'Status', value: brand.approvalStatus },
                    ].map(s => (
                        <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
                            <p className="text-[22px] font-black text-[#181725]">{s.value}</p>
                            <p className="text-[11px] text-gray-400 font-medium mt-0.5">{s.label}</p>
                        </div>
                    ))}
                </div>

                {/* Basic info */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
                    <h2 className="text-[15px] font-bold text-[#181725]">Brand Info</h2>
                    <div className="grid sm:grid-cols-2 gap-4">
                        {[
                            { key: 'name', label: 'Brand Name', placeholder: 'e.g. Amul', full: false },
                            { key: 'tagline', label: 'Tagline', placeholder: 'e.g. The Taste of India', full: false },
                            { key: 'website', label: 'Website', placeholder: 'https://amul.com', full: true },
                        ].map(f => (
                            <div key={f.key} className={cn('space-y-1', f.full && 'sm:col-span-2')}>
                                <label className="text-[13px] font-semibold text-gray-700">{f.label}</label>
                                <input
                                    type="text"
                                    value={(form as Record<string, unknown>)[f.key] as string}
                                    onChange={(e) => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                                    placeholder={f.placeholder}
                                    className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#53B175]/30"
                                />
                            </div>
                        ))}
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-[13px] font-semibold text-gray-700">Description</label>
                            <textarea
                                value={form.description}
                                onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                                rows={3}
                                placeholder="Short brand description…"
                                className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#53B175]/30 resize-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Images */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
                    <h2 className="text-[15px] font-bold text-[#181725]">Images</h2>
                    <p className="text-[12px] text-gray-500 -mt-4">After upload, an editor opens so you can set the focal point and zoom — the part that stays visible after the site auto-crops.</p>
                    <div className="grid md:grid-cols-2 gap-6">
                        <ImageUploadField
                            label="Brand Logo"
                            value={form.logoUrl}
                            onChange={(url) => setForm(p => ({ ...p, logoUrl: url }))}
                            folder="brands"
                            aspectHint="Square PNG/WebP recommended (200×200 px)"
                            variant="brand-logo"
                        />
                        <ImageUploadField
                            label="Banner / Store Header"
                            value={form.bannerUrl}
                            onChange={(url) => setForm(p => ({ ...p, bannerUrl: url }))}
                            folder="brands"
                            aspectHint="Wide hero — 1600×400 px recommended (4:1 ratio). Renders at up to 1440×320 on desktop."
                            variant="brand-banner"
                        />
                    </div>
                    <ImageUploadField
                        label="Card Banner Image"
                        value={form.showcaseImages[0] ?? null}
                        onChange={(url) => setForm(p => ({ ...p, showcaseImages: url ? [url] : [] }))}
                        folder="brands"
                        aspectHint="Shows on the brand card top section (220×160 area)"
                        variant="brand-card-top"
                    />
                </div>

                {/* Tier B — admin ops */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
                    <h2 className="text-[15px] font-bold text-[#181725]">Admin Operations</h2>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[13px] font-semibold text-gray-700">Brand Tier</label>
                            <select value={form.brandTier} onChange={e => setForm(p => ({ ...p, brandTier: e.target.value }))}
                                className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2.5">
                                <option value="">Select tier</option>
                                {['Premium', 'Mid', 'Mass'].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[13px] font-semibold text-gray-700">Marketplace Visibility</label>
                            <select value={form.marketplaceVisibility} onChange={e => setForm(p => ({ ...p, marketplaceVisibility: e.target.value }))}
                                className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2.5">
                                <option value="">Select visibility</option>
                                {['Public', 'Restricted'].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[13px] font-semibold text-gray-700">Lead Status</label>
                            <select value={form.leadStatus} onChange={e => setForm(p => ({ ...p, leadStatus: e.target.value }))}
                                className="w-full text-[13px] border border-gray-200 rounded-xl px-3 py-2.5">
                                <option value="">Select status</option>
                                {['Lead', 'Contacted', 'Active'].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <label className="flex items-center gap-2 text-[13px] font-semibold text-gray-700 pt-6">
                            <input type="checkbox" checked={form.creditSupport}
                                onChange={e => setForm(p => ({ ...p, creditSupport: e.target.checked }))}
                                className="accent-[#299E60] w-4 h-4" />
                            Credit support enabled
                        </label>
                    </div>
                </div>

                {/* Categories */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                    <CategoryMultiPicker
                        value={form.categories}
                        onChange={(cats) => setForm(p => ({ ...p, categories: cats }))}
                        endpoint="/api/v1/admin/categories"
                        helper="Pick from existing categories. New ones added here are auto-approved (admin)."
                    />
                </div>
            </div>

            {!isDraftStorefront && (
                <AdminUserTeamPanel
                    teamEndpoint={`/api/v1/admin/brands/${id}/team`}
                    editPermission="brands.edit"
                    accent="#7C3AED"
                />
            )}

            {/* Reject modal */}
            {showRejectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRejectModal(false)}>
                    <div className="bg-white rounded-[16px] w-full max-w-[440px] p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 mb-4">
                            <MessageSquare size={20} className="text-[#E74C3C]" />
                            <h3 className="text-[16px] font-bold text-[#181725]">Reject {brand.name}</h3>
                        </div>
                        <textarea
                            value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)}
                            placeholder="Reason for rejection (required)..."
                            rows={3}
                            className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#E74C3C]/40 resize-none mb-4"
                        />
                        <div className="flex items-center gap-3 justify-end">
                            <button
                                onClick={() => { setShowRejectModal(false); setRejectNote(''); }}
                                className="h-[40px] px-5 bg-gray-100 rounded-[10px] text-[13px] font-bold text-[#7C7C7C] hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (!rejectNote.trim()) { toast.error('Please provide a reason'); return; }
                                    void handleReject();
                                }}
                                disabled={!rejectNote.trim() || approvalLoading}
                                className={cn(
                                    'h-[40px] px-5 bg-[#E74C3C] text-white rounded-[10px] text-[13px] font-bold disabled:opacity-50 flex items-center gap-1.5',
                                )}
                            >
                                {approvalLoading ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                                Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
