'use client';
import { CDL } from '@/lib/cdl';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Package, GitMerge, CheckCircle2, Clock, XCircle,
    ArrowRight, Loader2, AlertCircle, Mail, Phone,
    User, Globe, Tag, Sparkles, ShieldCheck, ShieldX,
    ExternalLink, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BrandProfile {
    id: string;
    name: string;
    slug: string;
    tagline: string | null;
    description: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    website: string | null;
    approvalStatus: string;
    isActive: boolean;
    createdAt: string;
    user?: {
        fullName: string;
        email: string;
    };
    _count: {
        masterProducts: number;
        productMappings: number;
    };
}

interface MasterProduct {
    id: string;
    name: string;
    packSize: string | null;
    imageUrl: string | null;
    category: string | null;
    _count: { mappings: number };
}

function getInitials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function BrandPortalDashboard() {
    const [profile, setProfile] = useState<BrandProfile | null>(null);
    const [products, setProducts] = useState<MasterProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            fetch('/api/v1/brand/profile').then(r => r.json()),
            fetch('/api/v1/brand/products').then(r => r.json()),
        ]).then(([profileJson, productsJson]) => {
            if (profileJson.success) setProfile(profileJson.data);
            else setError(profileJson.error?.message ?? 'Failed to load profile');
            if (productsJson.success) setProducts((productsJson.data?.products ?? productsJson.data ?? []).slice(0, 6));
        }).catch(() => setError('Network error'))
        .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
                <Loader2 size={36} className="animate-spin text-primary" />
                <p className="text-[14px] font-bold text-[#7C7C7C]">Loading brand dashboard...</p>
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
                <AlertCircle size={36} className="text-[#E74C3C]" />
                <p className="text-[16px] font-bold text-[#7C7C7C]">{error || 'Brand profile not found'}</p>
                <p className="text-[13px] text-[#AEAEAE]">Contact admin to get onboarded as a brand.</p>
            </div>
        );
    }

    const isApproved = profile.approvalStatus === 'approved';
    const isPending  = profile.approvalStatus === 'pending';
    const isRejected = profile.approvalStatus === 'rejected';

    const stats = [
        {
            label: 'Brand Products',
            value: profile._count.masterProducts,
            icon: Package,
            color: '#3B82F6',
            bg: '#EFF6FF',
            href: '/brand/portal/products',
        },
        {
            label: 'Active Mappings',
            value: profile._count.productMappings,
            icon: GitMerge,
            color: CDL.primary,
            bg: CDL.primaryLight,
            href: '/brand/portal/mappings',
        },
        {
            label: 'Brand Status',
            value: isApproved ? 'Live' : isPending ? 'Pending' : 'Rejected',
            icon: isApproved ? ShieldCheck : isPending ? Clock : ShieldX,
            color: isApproved ? CDL.primary : isPending ? '#F59E0B' : '#E74C3C',
            bg: isApproved ? CDL.primaryLight : isPending ? '#FFF7E6' : '#FEF2F2',
            href: '/brand/portal/settings',
        },
        {
            label: 'Coverage Rate',
            value: profile._count.masterProducts > 0
                ? `${Math.round((profile._count.productMappings / profile._count.masterProducts) * 100)}%`
                : '0%',
            icon: TrendingUp,
            color: '#8B5CF6',
            bg: '#F3F0FF',
            href: '/brand/portal/mappings',
        },
    ];

    return (
        <div className="space-y-6 pb-10 animate-in fade-in duration-500">
            {/* Breadcrumb-style header */}
            <div className="flex items-center gap-2 text-[14px] text-[#4B4B4B]">
                <span className="font-bold text-[#181725]">Dashboard</span>
                <span className="text-gray-300">·</span>
                <span className="text-[#7C7C7C]">{profile.name}</span>
            </div>

            {/* ── TOP SECTION: Brand Info Card ── */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                    {/* Left: Logo + Basic Info */}
                    <div className="p-8 flex gap-6">
                        <div className="shrink-0">
                            <div className="w-[130px] h-[130px] rounded-[16px] bg-[#F1F4F9] flex items-center justify-center p-3 border border-[#EEEEEE]">
                                {profile.logoUrl ? (
                                    <img src={profile.logoUrl} alt={profile.name} className="w-full h-full object-contain" />
                                ) : (
                                    <span className="text-[36px] font-[900] text-primary">
                                        {getInitials(profile.name)}
                                    </span>
                                )}
                            </div>
                            <Link
                                href="/brand/portal/settings"
                                className="mt-3 w-full py-2.5 px-4 rounded-[10px] text-[13px] font-bold transition-all shadow-sm flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-dark"
                            >
                                Edit Profile
                            </Link>
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h2 className="text-[22px] font-extrabold text-[#181725] leading-tight">
                                    {profile.name}
                                </h2>
                                {isApproved && (
                                    <CheckCircle2 size={20} className="text-primary shrink-0" fill={CDL.primary} stroke="white" />
                                )}
                                <span className={cn(
                                    'text-[11px] font-[900] px-2.5 py-1 rounded-[6px] uppercase',
                                    isApproved ? 'bg-primary-light text-primary' :
                                    isPending  ? 'bg-[#FFF7E6] text-[#F59E0B]' :
                                                 'bg-[#FEF2F2] text-[#E74C3C]'
                                )}>
                                    {profile.approvalStatus}
                                </span>
                            </div>

                            {profile.tagline && (
                                <p className="text-[13px] text-[#7C7C7C] font-medium mt-1 line-clamp-2">
                                    {profile.tagline}
                                </p>
                            )}

                            <div className="space-y-2.5 mt-4">
                                {profile.user?.fullName && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-[28px] h-[28px] rounded-full bg-primary-light flex items-center justify-center text-primary shrink-0">
                                            <User size={13} />
                                        </div>
                                        <span className="text-[13px] font-bold text-[#4B4B4B]">{profile.user.fullName}</span>
                                    </div>
                                )}
                                {profile.user?.email && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-[28px] h-[28px] rounded-full bg-primary-light flex items-center justify-center text-primary shrink-0">
                                            <Mail size={13} />
                                        </div>
                                        <span className="text-[13px] font-bold text-[#4B4B4B]">{profile.user.email}</span>
                                    </div>
                                )}
                                {profile.website && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-[28px] h-[28px] rounded-full bg-primary-light flex items-center justify-center text-primary shrink-0">
                                            <Globe size={13} />
                                        </div>
                                        <a href={profile.website} target="_blank" rel="noopener noreferrer"
                                            className="text-[13px] font-bold text-primary hover:underline truncate">
                                            {profile.website.replace(/^https?:\/\//, '')}
                                        </a>
                                    </div>
                                )}
                                <div className="flex items-center gap-3">
                                    <div className="w-[28px] h-[28px] rounded-full bg-primary-light flex items-center justify-center text-primary shrink-0">
                                        <Tag size={13} />
                                    </div>
                                    <code className="text-[13px] font-bold text-primary">/{profile.slug}</code>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Brand Details */}
                    <div className="p-8 border-t lg:border-t-0 lg:border-l border-[#EEEEEE]">
                        <h3 className="text-[18px] font-extrabold text-[#181725] mb-5">Brand Details</h3>
                        <div className="space-y-4">
                            {[
                                { label: 'Approval Status', value: profile.approvalStatus.charAt(0).toUpperCase() + profile.approvalStatus.slice(1) },
                                { label: 'Brand Products', value: String(profile._count.masterProducts) },
                                { label: 'Distributor Mappings', value: String(profile._count.productMappings) },
                                { label: 'Brand Slug', value: `/${profile.slug}` },
                                {
                                    label: 'Member Since',
                                    value: new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                                },
                            ].map(item => (
                                <div key={item.label} className="flex items-center justify-between py-1 border-b border-[#F5F5F5] last:border-0">
                                    <span className="text-[13px] font-medium text-[#7C7C7C]">{item.label}</span>
                                    <span className="text-[13px] font-bold text-[#181725]">{item.value}</span>
                                </div>
                            ))}
                        </div>

                        {/* View store link */}
                        <Link
                            href={`/brand/${profile.slug}`}
                            target="_blank"
                            className="mt-6 w-full py-2.5 px-4 rounded-[10px] text-[13px] font-bold flex items-center justify-center gap-2 border border-primary text-primary hover:bg-primary-light transition-colors"
                        >
                            <ExternalLink size={14} /> View Brand Store
                        </Link>
                    </div>
                </div>
            </div>

            {/* ── STATS ROW ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map(stat => (
                    <Link key={stat.label} href={stat.href}
                        className="bg-white p-5 rounded-[14px] border border-[#EEEEEE] shadow-sm flex items-center gap-4 hover:border-primary/30 hover:shadow-md transition-all group">
                        <div className="w-[48px] h-[48px] rounded-[12px] flex items-center justify-center shrink-0"
                            style={{ backgroundColor: stat.bg, color: stat.color }}>
                            <stat.icon size={22} strokeWidth={2.5} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider leading-tight">{stat.label}</p>
                            <h3 className="text-[22px] font-[900] text-[#181725] leading-none mt-0.5 truncate">{stat.value}</h3>
                        </div>
                    </Link>
                ))}
            </div>

            {/* ── APPROVAL BANNER ── */}
            {isPending && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-[12px]">
                    <Clock size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[14px] font-bold text-amber-800">Awaiting Admin Approval</p>
                        <p className="text-[12px] text-amber-600 mt-0.5">
                            Your brand is under review. You can manage your catalog in the meantime.
                        </p>
                    </div>
                </div>
            )}
            {isRejected && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-[12px]">
                    <XCircle size={18} className="text-[#E74C3C] shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[14px] font-bold text-[#E74C3C]">Brand Application Rejected</p>
                        <p className="text-[12px] text-red-400 mt-0.5">Contact admin for more information.</p>
                    </div>
                </div>
            )}

            {/* ── QUICK ACTIONS + RECENT PRODUCTS ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Quick Actions */}
                <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                    <h3 className="text-[16px] font-[900] text-[#181725] mb-4">Quick Actions</h3>
                    <div className="space-y-2">
                        {[
                            { label: 'Add New Product', sub: 'Expand your catalog', icon: Package, href: '/brand/portal/products', color: '#3B82F6', bg: '#EFF6FF' },
                            { label: 'Run Auto-Mapping', sub: 'Find distributor matches', icon: GitMerge, href: '/brand/portal/mappings', color: CDL.primary, bg: CDL.primaryLight },
                            { label: 'Edit Brand Profile', sub: 'Update logo, tagline, etc.', icon: Sparkles, href: '/brand/portal/settings', color: '#8B5CF6', bg: '#F3F0FF' },
                        ].map(action => (
                            <Link key={action.label} href={action.href}
                                className="flex items-center gap-3 p-3 rounded-[10px] hover:bg-[#F8F9FB] transition-colors group">
                                <div className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: action.bg, color: action.color }}>
                                    <action.icon size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-bold text-[#181725] group-hover:text-primary transition-colors">{action.label}</p>
                                    <p className="text-[11px] text-[#AEAEAE]">{action.sub}</p>
                                </div>
                                <ArrowRight size={14} className="text-[#AEAEAE] group-hover:text-primary transition-colors" />
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Recent Products */}
                <div className="lg:col-span-2 bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[16px] font-[900] text-[#181725]">Brand Products</h3>
                        <Link href="/brand/portal/products"
                            className="text-[13px] font-bold text-primary hover:underline flex items-center gap-1">
                            View all <ArrowRight size={13} />
                        </Link>
                    </div>

                    {products.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Package size={32} className="text-[#EEEEEE] mb-2" />
                            <p className="text-[14px] font-bold text-[#AEAEAE]">No products yet</p>
                            <Link href="/brand/portal/products"
                                className="mt-3 text-[13px] font-bold text-primary hover:underline">
                                Add your first product →
                            </Link>
                        </div>
                    ) : (
                        <div className="divide-y divide-[#F5F5F5]">
                            {products.map(p => (
                                <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                    {p.imageUrl ? (
                                        <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-[8px] object-cover border border-[#EEEEEE] shrink-0" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-[8px] bg-[#F8F9FB] flex items-center justify-center text-[#AEAEAE] shrink-0">
                                            <Package size={16} />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-bold text-[#181725] truncate">{p.name}</p>
                                        <p className="text-[11px] text-[#AEAEAE]">{p.packSize ?? p.category ?? '—'}</p>
                                    </div>
                                    <span className={cn(
                                        'text-[11px] font-[900] px-2 py-0.5 rounded-[6px] shrink-0',
                                        p._count.mappings > 0 ? 'bg-primary-light text-primary' : 'bg-[#F8F9FB] text-[#AEAEAE]'
                                    )}>
                                        {p._count.mappings} {p._count.mappings === 1 ? 'distributor' : 'distributors'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
