'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, Check, Save, Users, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CategoryMultiPicker } from '@/components/features/brand/CategoryMultiPicker';
import { ImagePreview } from '@/components/ui/ImagePreview';

interface BrandProfile {
    id: string;
    name: string;
    slug: string;
    tagline: string | null;
    description: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    website: string | null;
    categories: string[];
    bgColor: string | null;
    showcaseImages: string[];
    approvalStatus: string;
}

export default function BrandSettingsPage() {
    const [profile, setProfile] = useState<BrandProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [form, setForm] = useState({ name: '', tagline: '', description: '', logoUrl: '' as string | null, bannerUrl: '' as string | null, website: '', categories: [] as string[], bgColor: '#f0faf4', showcaseImages: [] as string[] });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/v1/brand/profile')
            .then(r => r.json())
            .then(json => {
                if (json.success) {
                    setProfile(json.data);
                    setForm({
                        name: json.data.name ?? '',
                        tagline: json.data.tagline ?? '',
                        description: json.data.description ?? '',
                        logoUrl: json.data.logoUrl ?? null,
                        bannerUrl: json.data.bannerUrl ?? null,
                        website: json.data.website ?? '',
                        categories: json.data.categories ?? [],
                        bgColor: json.data.bgColor ?? '#f0faf4',
                        showcaseImages: json.data.showcaseImages ?? [],
                    });
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true); setSaved(false); setError(null);
        try {
            // The brand profile schema validates URL fields as `z.string().url().optional()`,
            // which rejects both empty strings and `null`. Send only non-empty URLs so a blank
            // field doesn't fail validation. (NOTE: clearing an image therefore does not persist —
            // that needs the validator to accept null on logoUrl/bannerUrl. See report.)
            const res = await fetch('/api/v1/brand/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name || undefined,
                    tagline: form.tagline || undefined,
                    description: form.description || undefined,
                    logoUrl: form.logoUrl || undefined,
                    bannerUrl: form.bannerUrl || undefined,
                    website: form.website || undefined,
                    categories: form.categories,
                    bgColor: form.bgColor,
                    showcaseImages: form.showcaseImages,
                }),
            });
            const json = await res.json();
            if (json.success) {
                setSaved(true);
                toast.success('Brand profile saved');
                setTimeout(() => setSaved(false), 3000);
            } else {
                const msg = json.error?.message ?? 'Failed to save';
                setError(msg);
                toast.error(msg);
            }
        } catch {
            setError('Network error — please try again');
            toast.error('Network error — please try again');
        }
        finally { setSaving(false); }
    };

    // Hooks must run on every render — do not put after early return below.
    const logoRef = useRef<HTMLInputElement>(null);
    const bannerRef = useRef<HTMLInputElement>(null);
    const showcaseRef = useRef<HTMLInputElement>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingBanner, setUploadingBanner] = useState(false);
    const [uploadingShowcase, setUploadingShowcase] = useState(false);

    if (loading) {
        return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
    }

    // ── Image upload helper ──────────────────────────────────
    const uploadImage = async (file: File): Promise<string> => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', 'brands');
        const res = await fetch('/api/v1/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || 'Upload failed');
        return json.data.url as string;
    };

    const handleLogoFile = async (file: File) => {
        setUploadingLogo(true);
        try { setForm(p => ({ ...p, logoUrl: '' })); const url = await uploadImage(file); setForm(p => ({ ...p, logoUrl: url })); toast.success('Logo uploaded'); }
        catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Upload failed'); }
        finally { setUploadingLogo(false); }
    };

    const handleBannerFile = async (file: File) => {
        setUploadingBanner(true);
        try { const url = await uploadImage(file); setForm(p => ({ ...p, bannerUrl: url })); toast.success('Banner uploaded'); }
        catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Upload failed'); }
        finally { setUploadingBanner(false); }
    };

    const handleShowcaseFile = async (file: File) => {
        if (form.showcaseImages.length >= 5) { toast.error('Max 5 showcase images'); return; }
        setUploadingShowcase(true);
        try { const url = await uploadImage(file); setForm(p => ({ ...p, showcaseImages: [...p.showcaseImages, url] })); toast.success('Image added'); }
        catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Upload failed'); }
        finally { setUploadingShowcase(false); }
    };

    return (
        <div className="max-w-[700px] mx-auto space-y-6 animate-in fade-in duration-500">
            <div>
                <h1 className="text-[26px] font-[900] text-[#181725] tracking-tight">Brand Settings</h1>
                <p className="text-[#7C7C7C] font-medium mt-0.5 text-[14px]">Update your brand profile and team</p>
            </div>

            {profile && (
                <div className="flex items-center gap-3 p-3 bg-[#F8F9FB] rounded-[12px] border border-[#EEEEEE]">
                    <div className="text-[11px] font-bold text-[#AEAEAE] uppercase tracking-wider">Brand Slug</div>
                    <code className="text-[13px] font-bold text-primary">{profile.slug}</code>
                    <div className={cn('ml-auto text-[11px] font-[900] px-2 py-0.5 rounded-[6px]',
                        profile.approvalStatus === 'approved' ? 'bg-primary-light text-primary' : 'bg-[#FFF7E6] text-amber-600')}>
                        {profile.approvalStatus.toUpperCase()}
                    </div>
                </div>
            )}

            {/* Basic info */}
            <div className="bg-white rounded-[20px] border border-[#EEEEEE] p-6 space-y-4">
                <h2 className="text-[15px] font-bold text-[#181725]">Brand Info</h2>
                {[
                    { key: 'name', label: 'Brand Name *', placeholder: 'Your brand name' },
                    { key: 'tagline', label: 'Tagline', placeholder: 'Short brand description' },
                    { key: 'website', label: 'Website', placeholder: 'https://yourbrand.com' },
                ].map(f => (
                    <div key={f.key}>
                        <label className="block text-[12px] font-bold text-[#7C7C7C] mb-1.5 uppercase tracking-wider">{f.label}</label>
                        <input type="text" value={(form as Record<string, unknown>)[f.key] as string}
                            onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-2.5 text-[14px] font-medium outline-none focus:border-primary/50 bg-[#FAFAFA] focus:bg-white transition-colors" />
                    </div>
                ))}
                <div>
                    <label className="block text-[12px] font-bold text-[#7C7C7C] mb-1.5 uppercase tracking-wider">Description</label>
                    <textarea value={form.description}
                        onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Tell buyers about your brand..." rows={3}
                        className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] font-medium outline-none focus:border-primary/50 bg-[#FAFAFA] focus:bg-white transition-colors resize-none" />
                </div>
            </div>

            {/* Images */}
            <div className="bg-white rounded-[20px] border border-[#EEEEEE] p-6">
                <h2 className="text-[15px] font-bold text-[#181725] mb-5">Images</h2>
                <div className="grid lg:grid-cols-[1fr_240px] gap-6">
                    <div className="space-y-5 min-w-0">

                {/* Logo */}
                <div className="space-y-2">
                    <label className="block text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wider">Brand Logo <span className="font-normal normal-case text-gray-400">(square, 200×200px)</span></label>
                    <div className="flex items-center gap-4">
                        <div onClick={() => logoRef.current?.click()}
                            className="w-[80px] h-[80px] rounded-xl border-2 border-dashed border-gray-200 hover:border-primary transition-colors cursor-pointer flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                            {uploadingLogo ? <Loader2 size={20} className="animate-spin text-primary" /> :
                                form.logoUrl ? <Image src={form.logoUrl} alt="logo" width={80} height={80} className="object-cover w-full h-full" /> :
                                <Upload size={20} className="text-gray-400" />}
                        </div>
                        <div className="flex-1 space-y-2">
                            <button type="button" onClick={() => logoRef.current?.click()}
                                className="block text-[13px] font-bold text-primary hover:underline">Upload file</button>
                            <input type="url" value={form.logoUrl ?? ''} onChange={e => setForm(p => ({ ...p, logoUrl: e.target.value || null }))}
                                placeholder="Or paste URL…"
                                className="w-full border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-[12px] focus:outline-none focus:border-primary/50 bg-[#FAFAFA]" />
                        </div>
                        {form.logoUrl && <button type="button" onClick={() => setForm(p => ({ ...p, logoUrl: null }))} className="text-gray-400 hover:text-red-500"><X size={16} /></button>}
                    </div>
                    <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = ''; }} />
                </div>

                {/* Banner */}
                <div className="space-y-2">
                    <label className="block text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wider">Store Banner <span className="font-normal normal-case text-gray-400">(1200×400px)</span></label>
                    <div onClick={() => bannerRef.current?.click()}
                        className={cn('relative border-2 border-dashed border-gray-200 hover:border-primary transition-colors cursor-pointer rounded-xl overflow-hidden',
                            form.bannerUrl ? 'h-[120px]' : 'h-[80px] flex items-center justify-center bg-gray-50')}>
                        {uploadingBanner ? <Loader2 size={20} className="animate-spin text-primary" /> :
                            form.bannerUrl ? <>
                                <Image src={form.bannerUrl} alt="banner" fill className="object-cover" sizes="700px" />
                                <button type="button" onClick={e => { e.stopPropagation(); setForm(p => ({ ...p, bannerUrl: null })); }}
                                    className="absolute top-2 right-2 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center shadow"><X size={12} /></button>
                            </> :
                            <div className="flex items-center gap-2 text-gray-400"><Upload size={18} /><span className="text-[13px] font-medium">Click to upload banner</span></div>}
                    </div>
                    <input ref={bannerRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleBannerFile(f); e.target.value = ''; }} />
                    <input type="url" value={form.bannerUrl ?? ''} onChange={e => setForm(p => ({ ...p, bannerUrl: e.target.value || null }))}
                        placeholder="Or paste banner URL…"
                        className="w-full border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-[12px] focus:outline-none focus:border-primary/50 bg-[#FAFAFA]" />
                </div>

                {/* Card Banner Image — single image shown on the brand card */}
                <div className="space-y-2">
                    <label className="block text-[12px] font-bold text-[#7C7C7C] uppercase tracking-wider">Card Banner Image <span className="font-normal normal-case text-gray-400">(shows on brand card top section)</span></label>
                    <div onClick={() => showcaseRef.current?.click()}
                        className={cn('relative border-2 border-dashed border-gray-200 hover:border-primary transition-colors cursor-pointer rounded-xl overflow-hidden',
                            form.showcaseImages[0] ? 'h-[120px]' : 'h-[80px] flex items-center justify-center bg-gray-50')}>
                        {uploadingShowcase ? <Loader2 size={20} className="animate-spin text-primary" /> :
                            form.showcaseImages[0] ? <>
                                <Image src={form.showcaseImages[0]} alt="card banner" fill className="object-cover" sizes="700px" />
                                <button type="button" onClick={e => { e.stopPropagation(); setForm(p => ({ ...p, showcaseImages: [] })); }}
                                    className="absolute top-2 right-2 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center shadow"><X size={12} /></button>
                            </> :
                            <div className="flex items-center gap-2 text-gray-400"><Upload size={18} /><span className="text-[13px] font-medium">Click to upload card banner</span></div>}
                    </div>
                    <input ref={showcaseRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) {
                                // Replace any existing — single image only
                                setForm(p => ({ ...p, showcaseImages: [] }));
                                handleShowcaseFile(f);
                            }
                            e.target.value = '';
                        }} />
                </div>
                    </div>

                    {/* Live preview column — shows exactly how each image renders on the live site */}
                    <div className="bg-[#FAFAFA] border border-[#EEEEEE] rounded-2xl p-4 space-y-5 self-start lg:sticky lg:top-6">
                        <p className="text-[12px] font-bold text-gray-700 uppercase tracking-wider">Live preview</p>
                        <ImagePreview src={form.logoUrl} variant="brand-logo" />
                        <ImagePreview src={form.bannerUrl} variant="brand-banner" />
                        <ImagePreview src={form.showcaseImages[0] ?? null} variant="brand-card-top" />
                    </div>
                </div>
            </div>

            {/* Categories */}
            <div className="bg-white rounded-[20px] border border-[#EEEEEE] p-6">
                <CategoryMultiPicker
                    value={form.categories}
                    onChange={(cats) => setForm(p => ({ ...p, categories: cats }))}
                    endpoint="/api/v1/brand/categories/suggest"
                    helper="Pick from existing categories. To request a new one, type it and tap 'Request' — admin reviews before it goes live."
                />
            </div>

            <div className="flex items-center justify-between gap-4">
                <p className="text-[13px] text-[#E74C3C] font-bold px-1">{error ?? ''}</p>
                <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-[10px] text-[13px] font-bold disabled:opacity-60 hover:bg-primary-dark transition-colors shrink-0">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
                    {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
                </button>
            </div>

            {/* ── TEAM MEMBERS REDIRECT ── */}
            <div className="bg-white rounded-[20px] border border-[#EEEEEE] p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center text-primary shrink-0">
                        <Users size={20} />
                    </div>
                    <div>
                        <h2 className="text-[16px] font-bold text-[#181725]">Team Management</h2>
                        <p className="text-[13px] text-[#7C7C7C] mt-0.5">Invite staff, manage permissions and roles</p>
                    </div>
                </div>
                <Link href="/brand/portal/team" className="h-[36px] px-4 bg-primary-light hover:bg-[#E2F4E7] text-primary rounded-[10px] text-[13px] font-bold transition-colors flex items-center justify-center shrink-0">
                    Manage Team
                </Link>
            </div>
        </div>
    );
}
