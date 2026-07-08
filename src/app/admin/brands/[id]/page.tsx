'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
    Loader2,
    ShieldCheck,
    ShieldX,
    XCircle,
    User,
    Mail,
    Phone,
    MapPin,
    MessageSquare,
    X,
    Save,
    Package,
    Users,
    Building2,
    Image as ImageIcon,
    AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CategoryMultiPicker } from '@/components/features/brand/CategoryMultiPicker';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { AdminUserTeamPanel } from '@/components/features/admin/AdminUserTeamPanel';
import {
    AdminEntityDetailHeader,
    AdminEntityStatsRow,
    AdminImpersonateButton,
    AdminLoginCredentialsPanel,
    AdminStatusBadge,
    AdminEntityContactGrid,
    AdminEntityTabBar,
    AdminEntityTabPanel,
    AdminEntityTabContent,
    AdminRegistryLoadingState,
    AdminEntityHeroCard,
} from '@/components/features/admin/entity';

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
    user: { id: string; fullName: string; email: string; phone: string | null; gstNumber: string | null; adminPassword?: string | null } | null;
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

    const [brand, setBrand] = useState<Brand | null>(null);
    const [ownerPassword, setOwnerPassword] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [approvalLoading, setApprovalLoading] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectNote, setRejectNote] = useState('');
    const [activeTab, setActiveTab] = useState<'overview' | 'storefront' | 'team'>('overview');

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
            setOwnerPassword(b.user?.adminPassword ?? null);
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
        return <AdminRegistryLoadingState message="Loading brand profile..." />;
    }

    if (!brand) {
        return <div className="min-h-screen flex items-center justify-center text-gray-500">Brand not found</div>;
    }

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

    const statusVariant = brand.approvalStatus === 'approved' ? 'verified' : brand.approvalStatus === 'rejected' ? 'inactive' : 'pending';

    const stats = [
        { label: 'Master Products', value: brand._count.masterProducts, icon: Package, color: '#7C3AED' },
        { label: 'Mapped Products', value: brand._count.productMappings, icon: Building2, color: '#3B82F6' },
        { label: 'Approval Status', value: brand.approvalStatus.toUpperCase(), icon: ShieldCheck, color: '#299E60' },
        { label: 'Account', value: brand.isActive ? 'Active' : 'Inactive', icon: Users, color: brand.isActive ? '#299E60' : '#EF4444' },
    ];

    const tabs = [
        { id: 'overview' as const, label: 'Overview', icon: Building2 },
        { id: 'storefront' as const, label: 'Storefront', icon: ImageIcon },
        ...( !isDraftStorefront ? [{ id: 'team' as const, label: 'Team', icon: Users }] : []),
    ];

    return (
        <div className="space-y-6 pb-12 px-4 md:px-0">
            <AdminEntityDetailHeader
                onBack={() => router.back()}
                breadcrumbs={[
                    { label: 'Brands Registry', href: '/admin/brands' },
                    { label: brand.name },
                ]}
                actions={
                    <>
                        {canEditBrand && !isDraftStorefront && (
                            <AdminImpersonateButton
                                target="brand"
                                entityId={brand.id}
                                label="View Brand Portal"
                            />
                        )}
                        <button
                            type="button"
                            onClick={() => void save()}
                            disabled={saving}
                            className="h-[38px] px-4 rounded-[10px] text-[12px] font-bold border border-[#299E60] bg-[#299E60] text-white hover:bg-[#238a54] active:scale-97 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        >
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            {isDraftStorefront ? 'Save Storefront' : 'Save Changes'}
                        </button>
                    </>
                }
            />

            {fromApprovals && brand.approvalStatus === 'pending' && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[12px] p-4 flex items-center gap-2.5 text-[14px] font-bold text-[#B45309] shadow-sm">
                    <AlertCircle size={18} className="shrink-0" />
                    Review this brand application before approving.
                </div>
            )}
            {isDraftStorefront && !fromApprovals && (
                <div className="bg-[#EEF8F1] border border-[#299E60]/25 rounded-[12px] p-4 text-[13px] font-semibold text-[#1f6b41] shadow-sm">
                    This is an admin-managed brand with no owner application. Fill in the storefront tab — logo, banner, info and categories — then Save to publish it.
                </div>
            )}

            <AdminEntityHeroCard
                avatar={
                    <div className="w-[140px] h-[140px] rounded-[16px] bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center p-4 shadow-inner">
                        {brand.logoUrl ? (
                            <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-contain" />
                        ) : (
                            <span className="text-[42px] font-black text-[#7C3AED]">{getInitials(brand.name)}</span>
                        )}
                    </div>
                }
                avatarFooter={
                    <AdminStatusBadge variant={statusVariant} label={brand.approvalStatus} className="normal-case" />
                }
                title={brand.name}
                badges={
                    brand.approvalStatus === 'approved' ? (
                        <AdminStatusBadge variant="verified" label="Verified Brand" className="normal-case" />
                    ) : undefined
                }
                subtitle={
                    brand.tagline ? (
                        <p className="text-[13px] text-[#6B7280] font-medium mt-2">{brand.tagline}</p>
                    ) : undefined
                }
                contact={
                    <AdminEntityContactGrid
                        accent="#7C3AED"
                        accentBg="#EDE9FE"
                        className="mt-4"
                        items={[
                            ...(owner
                                ? [
                                    { icon: User, label: 'Owner', value: owner.fullName },
                                    { icon: Mail, label: 'Email', value: owner.email },
                                ]
                                : [{ icon: User, label: 'Owner', value: 'No owner account linked' }]),
                            ...(phone ? [{ icon: Phone, label: 'Phone', value: phone }] : []),
                            ...(billingAddress ? [{ icon: MapPin, label: 'Registered Office', value: billingAddress }] : []),
                        ]}
                    />
                }
                sidebar={
                    <>
                        {owner && (
                            <AdminLoginCredentialsPanel
                                user={owner}
                                adminPassword={ownerPassword}
                                permission="brands.edit"
                                accent="#7C3AED"
                                onPasswordUpdated={setOwnerPassword}
                            />
                        )}
                        {canApprove && (
                            <div className="flex flex-col gap-2.5">
                                <span className="text-[11px] font-bold text-[#9CA3AF] uppercase">Verification Actions</span>
                                {brand.approvalStatus !== 'approved' && (
                                    <button
                                        onClick={() => void handleApprove()}
                                        disabled={approvalLoading}
                                        className="w-full py-2.5 rounded-[10px] text-[12px] font-bold transition-all shadow-sm flex items-center justify-center gap-2 border bg-[#299E60] border-[#299E60] text-white hover:bg-[#238a54] disabled:opacity-50"
                                    >
                                        {approvalLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                                        Approve & Verify
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
                    </>
                }
            />

            <AdminEntityStatsRow stats={stats} />

            <AdminEntityTabPanel>
                <AdminEntityTabBar
                    activeTab={activeTab}
                    onTabChange={(id) => setActiveTab(id as typeof activeTab)}
                    tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon }))}
                />
                <AdminEntityTabContent>
                    {activeTab === 'overview' && hasApplication && (isReviewMode || brand.approvalStatus === 'pending') && (
                        <div className="space-y-4">
                            <h2 className="text-[15px] font-black text-[#111827]">Application Review</h2>
                            <p className="text-[12px] text-[#6B7280] -mt-2">Submitted onboarding profile — review before approving.</p>
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
                    {activeTab === 'overview' && !(hasApplication && (isReviewMode || brand.approvalStatus === 'pending')) && (
                        <p className="text-[14px] text-[#6B7280] font-medium">No application review data for this brand. Use the Storefront tab to edit brand profile and media.</p>
                    )}

                    {activeTab === 'storefront' && (
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <h2 className="text-[15px] font-black text-[#111827]">Brand Info</h2>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    {[
                                        { key: 'name', label: 'Brand Name', placeholder: 'e.g. Amul', full: false },
                                        { key: 'tagline', label: 'Tagline', placeholder: 'e.g. The Taste of India', full: false },
                                        { key: 'website', label: 'Website', placeholder: 'https://amul.com', full: true },
                                    ].map(f => (
                                        <div key={f.key} className={cn('space-y-1', f.full && 'sm:col-span-2')}>
                                            <label className="text-[13px] font-semibold text-[#181725]">{f.label}</label>
                                            <input
                                                type="text"
                                                value={(form as Record<string, unknown>)[f.key] as string}
                                                onChange={(e) => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                                                placeholder={f.placeholder}
                                                className="w-full text-[13px] border border-[#EEEEEE] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#299E60]/30"
                                            />
                                        </div>
                                    ))}
                                    <div className="space-y-1 sm:col-span-2">
                                        <label className="text-[13px] font-semibold text-[#181725]">Description</label>
                                        <textarea
                                            value={form.description}
                                            onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                                            rows={3}
                                            placeholder="Short brand description…"
                                            className="w-full text-[13px] border border-[#EEEEEE] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#299E60]/30 resize-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h2 className="text-[15px] font-black text-[#111827]">Images</h2>
                                <p className="text-[12px] text-gray-500 -mt-4">After upload, an editor opens so you can set the focal point and zoom.</p>
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
                                        aspectHint="Wide hero — 1600×400 px recommended (4:1 ratio)."
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

                            <div className="space-y-4">
                                <h2 className="text-[15px] font-black text-[#111827]">Admin Operations</h2>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[13px] font-semibold text-[#181725]">Brand Tier</label>
                                        <select value={form.brandTier} onChange={e => setForm(p => ({ ...p, brandTier: e.target.value }))}
                                            className="w-full text-[13px] border border-[#EEEEEE] rounded-xl px-3 py-2.5">
                                            <option value="">Select tier</option>
                                            {['Premium', 'Mid', 'Mass'].map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[13px] font-semibold text-[#181725]">Marketplace Visibility</label>
                                        <select value={form.marketplaceVisibility} onChange={e => setForm(p => ({ ...p, marketplaceVisibility: e.target.value }))}
                                            className="w-full text-[13px] border border-[#EEEEEE] rounded-xl px-3 py-2.5">
                                            <option value="">Select visibility</option>
                                            {['Public', 'Restricted'].map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[13px] font-semibold text-[#181725]">Lead Status</label>
                                        <select value={form.leadStatus} onChange={e => setForm(p => ({ ...p, leadStatus: e.target.value }))}
                                            className="w-full text-[13px] border border-[#EEEEEE] rounded-xl px-3 py-2.5">
                                            <option value="">Select status</option>
                                            {['Lead', 'Contacted', 'Active'].map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <label className="flex items-center gap-2 text-[13px] font-semibold text-[#181725] pt-6">
                                        <input type="checkbox" checked={form.creditSupport}
                                            onChange={e => setForm(p => ({ ...p, creditSupport: e.target.checked }))}
                                            className="accent-[#299E60] w-4 h-4" />
                                        Credit support enabled
                                    </label>
                                </div>
                            </div>

                            <CategoryMultiPicker
                                value={form.categories}
                                onChange={(cats) => setForm(p => ({ ...p, categories: cats }))}
                                endpoint="/api/v1/admin/categories"
                                helper="Pick from existing categories. New ones added here are auto-approved (admin)."
                            />
                        </div>
                    )}

                    {activeTab === 'team' && !isDraftStorefront && (
                        <AdminUserTeamPanel
                            teamEndpoint={`/api/v1/admin/brands/${id}/team`}
                            editPermission="brands.edit"
                            accent="#7C3AED"
                        />
                    )}
                </AdminEntityTabContent>
            </AdminEntityTabPanel>

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
