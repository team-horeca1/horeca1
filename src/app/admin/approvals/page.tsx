'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Search,
    Loader2,
    ClipboardList,
    Store,
    Package,
    Tag,
    Sparkles,
    Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApprovalReviewDrawer, type ReviewTarget } from '@/components/features/admin/ApprovalReviewDrawer';

// ── Interfaces ──

interface VendorUser {
    id: string;
    fullName: string;
    email: string;
    phone: string;
}

interface Vendor {
    id: string;
    businessName: string;
    slug: string;
    logoUrl: string | null;
    rating: number;
    isVerified: boolean;
    isActive: boolean;
    createdAt: string;
    user: VendorUser;
    _count: { products: number; orders: number };
}

interface PendingProduct {
    id: string;
    name: string;
    slug: string;
    basePrice: number;
    imageUrl: string | null;
    approvalStatus: string;
    approvalNote: string | null;
    createdAt: string;
    vendor: { id: string; businessName: string };
    category: { id: string; name: string } | null;
    kind?: 'master' | 'vendor';
    sku?: string | null;
    brand?: string | null;
}

interface PendingCategory {
    id: string;
    name: string;
    slug: string;
    approvalStatus: string;
    approvalNote: string | null;
    suggestedBy: string | null;
    createdAt: string;
    parent: { id: string; name: string } | null;
    _count?: { products: number };
}

interface PendingBrand {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    approvalStatus: string;
    createdAt: string;
    user: { id: string; fullName: string; email: string } | null;
}

type SectionTab = 'Vendors' | 'Products' | 'Categories' | 'Brands';

function getInitials(name: string): string {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatINR(n: number): string {
    return `₹${n.toLocaleString('en-IN')}`;
}

export default function ApprovalsPage() {
    const [sectionTab, setSectionTab] = useState<SectionTab>('Vendors');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);

    // Vendor state
    const [pendingVendors, setPendingVendors] = useState<Vendor[]>([]);
    const [approvedVendors, setApprovedVendors] = useState<Vendor[]>([]);
    const [vendorTab, setVendorTab] = useState<'Pending' | 'Approved' | 'All'>('Pending');

    // Product state
    const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);

    // Category state
    const [pendingCategories, setPendingCategories] = useState<PendingCategory[]>([]);

    // Brand state
    const [pendingBrands, setPendingBrands] = useState<PendingBrand[]>([]);

    // Summary counts
    const [summary, setSummary] = useState({ pendingVendors: 0, pendingProducts: 0, pendingCategories: 0, pendingBrands: 0 });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [pendingVRes, approvedVRes, productsRes, editProductsRes, mastersRes, categoriesRes, brandsRes, summaryRes] = await Promise.all([
                fetch('/api/v1/admin/vendors?verified=false&limit=50'),
                fetch('/api/v1/admin/vendors?verified=true&limit=50'),
                fetch('/api/v1/admin/products?approvalStatus=pending&limit=50'),
                fetch('/api/v1/admin/products?approvalStatus=pending_edit&limit=50'),
                fetch('/api/v1/admin/master-products?approvalStatus=pending&limit=50'),
                fetch('/api/v1/admin/categories?approvalStatus=pending'),
                fetch('/api/v1/admin/brands?status=pending'),
                fetch('/api/v1/admin/approvals/summary'),
            ]);

            const [pv, av, pr, er, mr, cat, br, sum] = await Promise.all([
                pendingVRes.json(), approvedVRes.json(), productsRes.json(), editProductsRes.json(), mastersRes.json(), categoriesRes.json(), brandsRes.json(), summaryRes.json(),
            ]);

            if (pv.success) setPendingVendors(pv.data.vendors);
            if (av.success) setApprovedVendors(av.data.vendors);
            const vendorPending: PendingProduct[] = pr.success
                ? (pr.data.products || []).map((p: PendingProduct) => ({ ...p, kind: 'vendor' as const }))
                : [];
            const vendorEditPending: PendingProduct[] = er.success
                ? (er.data.products || []).map((p: PendingProduct) => ({ ...p, kind: 'vendor' as const }))
                : [];
            const masterPending: PendingProduct[] = mr.success
                ? (mr.data.masterProducts || []).map((m: {
                    id: string; name: string; sku: string; brand: string | null; imageUrl: string | null;
                    createdAt: string; category: { id: string; name: string } | null;
                }) => ({
                    id: m.id,
                    name: m.name,
                    slug: m.sku,
                    sku: m.sku,
                    brand: m.brand,
                    basePrice: 0,
                    imageUrl: m.imageUrl,
                    approvalStatus: 'pending',
                    approvalNote: null,
                    createdAt: m.createdAt,
                    vendor: { id: 'master', businessName: 'Master Catalog' },
                    category: m.category,
                    kind: 'master' as const,
                }))
                : [];
            setPendingProducts([...masterPending, ...vendorPending, ...vendorEditPending]);
            if (cat.success) setPendingCategories(cat.data || []);
            if (br.success) setPendingBrands(br.data || []);
            if (sum.success) setSummary(sum.data);
        } catch (err) {
            console.error('Failed to fetch approvals:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Filter logic ──
    const q = searchQuery.toLowerCase();
    const allVendors = [...pendingVendors, ...approvedVendors];
    const getDisplayVendors = () => {
        let list = vendorTab === 'Pending' ? pendingVendors : vendorTab === 'Approved' ? approvedVendors : allVendors;
        if (q) list = list.filter(v => v.businessName.toLowerCase().includes(q) || v.user.fullName.toLowerCase().includes(q));
        return list;
    };
    const filteredProducts = q
        ? pendingProducts.filter(p =>
            p.name.toLowerCase().includes(q)
            || p.vendor.businessName.toLowerCase().includes(q)
            || (p.sku && p.sku.toLowerCase().includes(q)))
        : pendingProducts;
    const filteredCategories = q ? pendingCategories.filter(c => c.name.toLowerCase().includes(q)) : pendingCategories;
    const filteredBrands = q
        ? pendingBrands.filter(b =>
            b.name.toLowerCase().includes(q) ||
            (b.user?.fullName.toLowerCase().includes(q) ?? false) ||
            (b.user?.email.toLowerCase().includes(q) ?? false))
        : pendingBrands;

    const reviewBtnCls =
        'flex items-center gap-1.5 h-[34px] px-4 bg-[#181725] text-white rounded-[8px] text-[12px] font-bold hover:bg-[#2d2d3d] transition-colors';

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 animate-spin text-[#299E60]" />
            </div>
        );
    }

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
            <h1 className="text-[clamp(1.25rem,2vw+0.5rem,1.75rem)] font-bold text-[#181725]">
                Approvals
            </h1>
            {/* Centered section tabs */}
            <div className="flex justify-center">
                <nav className="inline-flex items-center gap-0.5 border-b border-[#EEEEEE]">
                    {([
                        { key: 'Vendors' as SectionTab, icon: Store, count: summary.pendingVendors },
                        { key: 'Products' as SectionTab, icon: Package, count: summary.pendingProducts },
                        { key: 'Categories' as SectionTab, icon: Tag, count: summary.pendingCategories },
                        { key: 'Brands' as SectionTab, icon: Sparkles, count: summary.pendingBrands },
                    ]).map(({ key, icon: Icon, count }) => {
                        const isActive = sectionTab === key;
                        return (
                        <button
                            key={key}
                            onClick={() => { setSectionTab(key); setSearchQuery(''); }}
                            className={cn(
                                'flex items-center gap-2 px-6 py-3 text-[14px] font-bold transition-all border-b-2 -mb-px',
                                isActive
                                    ? 'border-[#299E60] text-[#299E60] bg-[#EEF8F1]/60'
                                    : 'border-transparent text-[#181725] hover:text-[#299E60] hover:bg-[#F8F9FB]',
                            )}
                        >
                            <Icon
                                size={18}
                                strokeWidth={2.5}
                                className={cn(isActive ? 'text-[#299E60]' : 'text-[#181725]')}
                            />
                            {key}
                            {count > 0 && (
                                <span className={cn(
                                    'px-2 py-0.5 rounded-[6px] text-[11px] font-[900]',
                                    isActive ? 'bg-[#E74C3C] text-white' : 'bg-[#181725] text-white',
                                )}>
                                    {count}
                                </span>
                            )}
                        </button>
                        );
                    })}
                </nav>
            </div>

            {/* Main Content Card */}
            <div className="bg-white rounded-[24px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                {/* Search */}
                <div className="p-6 border-b border-[#EEEEEE] flex items-center justify-between gap-4">
                    <h2 className="text-[18px] font-[900] text-[#181725]">
                        {sectionTab === 'Vendors' ? `${vendorTab} Vendors` : `Pending ${sectionTab}`}
                    </h2>
                    <div className="relative min-w-[280px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={16} />
                        <input
                            type="text"
                            placeholder={`Search ${sectionTab.toLowerCase()}...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[12px] py-2.5 pl-10 pr-4 text-[13px] outline-none placeholder:text-[#AEAEAE] font-medium focus:border-[#299E60]/40 focus:bg-white"
                        />
                    </div>
                </div>

                {/* Vendor sub-tabs */}
                {sectionTab === 'Vendors' && (
                    <div className="px-6 pt-4 flex gap-2">
                        {(['Pending', 'Approved', 'All'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setVendorTab(tab)}
                                className={cn(
                                    'px-4 py-1.5 rounded-[8px] text-[13px] font-bold transition-all',
                                    vendorTab === tab ? 'bg-[#299E60] text-white' : 'bg-[#F8F9FB] text-[#AEAEAE] hover:text-[#7C7C7C]',
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── VENDORS TABLE ── */}
                {sectionTab === 'Vendors' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-[#F8F9FB]">
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Vendor</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Owner</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Products</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Date</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Status</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F5]">
                                {getDisplayVendors().map(vendor => (
                                    <tr key={vendor.id} className="hover:bg-[#FAFAFA] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {vendor.logoUrl ? (
                                                    <img src={vendor.logoUrl} alt="" className="w-9 h-9 rounded-full object-cover border" />
                                                ) : (
                                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold bg-[#EEF8F1] text-[#299E60]">
                                                        {getInitials(vendor.businessName)}
                                                    </div>
                                                )}
                                                <span className="text-[14px] font-bold text-[#181725]">{vendor.businessName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-[13px] font-semibold text-[#181725]">{vendor.user.fullName}</td>
                                        <td className="px-6 py-4 text-[13px] font-bold text-[#181725]">{vendor._count.products}</td>
                                        <td className="px-6 py-4 text-[13px] text-[#7C7C7C]">{formatDate(vendor.createdAt)}</td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                'text-[11px] font-[900] px-2.5 py-1 rounded-[6px] uppercase',
                                                vendor.isVerified ? 'bg-[#EEF8F1] text-[#299E60]' : 'bg-[#FFF7E6] text-[#F59E0B]',
                                            )}>
                                                {vendor.isVerified ? 'Verified' : 'Pending'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setReviewTarget({ type: 'vendor', id: vendor.id })}
                                                className={reviewBtnCls}
                                            >
                                                <Eye size={14} /> Review
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {getDisplayVendors().length === 0 && (
                                    <tr><td colSpan={6} className="py-16 text-center">
                                        <ClipboardList size={36} className="mx-auto text-[#EEEEEE] mb-2" />
                                        <p className="text-[#AEAEAE] font-bold text-[14px]">No {vendorTab.toLowerCase()} vendors</p>
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── PRODUCTS TABLE ── */}
                {sectionTab === 'Products' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-[#F8F9FB]">
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Product</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Vendor</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Category</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Price</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Submitted</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F5]">
                                {filteredProducts.map(product => (
                                    <tr key={product.id} className="hover:bg-[#FAFAFA] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {product.imageUrl ? (
                                                    <img src={product.imageUrl} alt="" className="w-9 h-9 rounded-[8px] object-cover border" />
                                                ) : (
                                                    <div className="w-9 h-9 rounded-[8px] bg-[#F8F9FB] flex items-center justify-center text-[#AEAEAE]">
                                                        <Package size={16} />
                                                    </div>
                                                )}
                                                <div>
                                                    <span className="text-[14px] font-bold text-[#181725]">{product.name}</span>
                                                    {product.sku && (
                                                        <p className="text-[11px] text-[#AEAEAE] font-medium">SKU: {product.sku}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                'text-[13px] font-semibold',
                                                product.kind === 'master' ? 'text-[#299E60]' : 'text-[#181725]',
                                            )}>
                                                {product.kind === 'master' ? 'Master Catalog' : product.vendor.businessName}
                                            </span>
                                            {product.brand && (
                                                <p className="text-[11px] text-[#AEAEAE]">{product.brand}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-[13px] text-[#7C7C7C]">{product.category?.name || '—'}</td>
                                        <td className="px-6 py-4 text-[13px] font-bold text-[#181725]">
                                            {product.kind === 'master' ? '—' : formatINR(Number(product.basePrice))}
                                        </td>
                                        <td className="px-6 py-4 text-[13px] text-[#7C7C7C]">{formatDate(product.createdAt)}</td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setReviewTarget({
                                                    type: 'product',
                                                    id: product.id,
                                                    kind: product.kind ?? 'vendor',
                                                })}
                                                className={reviewBtnCls}
                                            >
                                                <Eye size={14} /> Review
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredProducts.length === 0 && (
                                    <tr><td colSpan={6} className="py-16 text-center">
                                        <Package size={36} className="mx-auto text-[#EEEEEE] mb-2" />
                                        <p className="text-[#AEAEAE] font-bold text-[14px]">No pending products</p>
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── CATEGORIES TABLE ── */}
                {sectionTab === 'Categories' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-[#F8F9FB]">
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Category</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Parent</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Submitted</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F5]">
                                {filteredCategories.map(cat => (
                                    <tr key={cat.id} className="hover:bg-[#FAFAFA] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-[8px] bg-[#F3F0FF] flex items-center justify-center text-[#8B5CF6]">
                                                    <Tag size={16} />
                                                </div>
                                                <span className="text-[14px] font-bold text-[#181725]">{cat.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-[13px] text-[#7C7C7C]">{cat.parent?.name || 'Top-level'}</td>
                                        <td className="px-6 py-4 text-[13px] text-[#7C7C7C]">{formatDate(cat.createdAt)}</td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setReviewTarget({ type: 'category', id: cat.id })}
                                                className={reviewBtnCls}
                                            >
                                                <Eye size={14} /> Review
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredCategories.length === 0 && (
                                    <tr><td colSpan={4} className="py-16 text-center">
                                        <Tag size={36} className="mx-auto text-[#EEEEEE] mb-2" />
                                        <p className="text-[#AEAEAE] font-bold text-[14px]">No pending categories</p>
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── BRANDS TABLE ── */}
                {sectionTab === 'Brands' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-[#F8F9FB]">
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Brand</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Owner</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Email</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Submitted</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-[#7C7C7C] uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F5F5F5]">
                                {filteredBrands.map(brand => (
                                    <tr key={brand.id} className="hover:bg-[#FAFAFA] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {brand.logoUrl ? (
                                                    <img src={brand.logoUrl} alt="" className="w-9 h-9 rounded-full object-cover border" />
                                                ) : (
                                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold bg-[#EDE9FE] text-[#7C3AED]">
                                                        {getInitials(brand.name)}
                                                    </div>
                                                )}
                                                <span className="text-[14px] font-bold text-[#181725]">{brand.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-[13px] font-semibold text-[#181725]">{brand.user?.fullName ?? '—'}</td>
                                        <td className="px-6 py-4 text-[13px] text-[#7C7C7C]">{brand.user?.email ?? 'Label-only brand'}</td>
                                        <td className="px-6 py-4 text-[13px] text-[#7C7C7C]">{formatDate(brand.createdAt)}</td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setReviewTarget({ type: 'brand', id: brand.id })}
                                                className={reviewBtnCls}
                                            >
                                                <Eye size={14} /> Review
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredBrands.length === 0 && (
                                    <tr><td colSpan={5} className="py-16 text-center">
                                        <Sparkles size={36} className="mx-auto text-[#EEEEEE] mb-2" />
                                        <p className="text-[#AEAEAE] font-bold text-[14px]">No pending brands</p>
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Footer */}
                <div className="p-6 bg-[#FDFDFD] border-t border-[#EEEEEE]">
                    <p className="text-[12px] text-[#AEAEAE] font-bold uppercase tracking-wider">
                        {sectionTab === 'Vendors' && `${getDisplayVendors().length} vendor${getDisplayVendors().length !== 1 ? 's' : ''}`}
                        {sectionTab === 'Products' && `${filteredProducts.length} pending product${filteredProducts.length !== 1 ? 's' : ''}`}
                        {sectionTab === 'Categories' && `${filteredCategories.length} pending categor${filteredCategories.length !== 1 ? 'ies' : 'y'}`}
                        {sectionTab === 'Brands' && `${filteredBrands.length} pending brand${filteredBrands.length !== 1 ? 's' : ''}`}
                    </p>
                </div>
            </div>

            <ApprovalReviewDrawer
                target={reviewTarget}
                onClose={() => setReviewTarget(null)}
                onComplete={() => { setReviewTarget(null); void fetchData(); }}
            />
        </div>
    );
}
