'use client';

// /admin/promotions — Coupon, Cashback Wallet, Cashback UPI.
// Programs stay in code but are hidden from the tab bar.

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Plus, Pencil, Trash2, Gift, Ticket, IndianRupee, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AudienceUserPicker, CouponScopeFields } from '@/components/features/promo/CouponScopePickers';
import { CashbackUpiPanel } from '@/components/features/promo/CashbackUpiPanel';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CouponRow {
    id: string;
    code: string;
    name: string;
    vendorId: string | null;
    vendor: { businessName: string } | null;
    discountType: 'flat' | 'percentage';
    discountValue: string | number;
    maxDiscount: string | number | null;
    minOrderValue: string | number | null;
    startDate: string | null;
    endDate: string | null;
    usageLimit: number | null;
    perUserLimit: number | null;
    usedCount: number;
    stacksWithVendorPromo: boolean;
    stacksWithCashback: boolean;
    stacksWithWallet: boolean;
    isActive: boolean;
    categoryIds: string[];
    productIds: string[];
    brandNames: string[];
    audienceUserIds: string[];
    _count?: { redemptions: number };
}

interface CampaignRow {
    id: string;
    name: string;
    vendorId: string | null;
    vendor: { businessName: string } | null;
    cashbackType: 'flat' | 'percentage';
    cashbackValue: string | number;
    maxCashback: string | number | null;
    minOrderValue: string | number | null;
    destination: 'wallet' | 'upi';
    startDate: string | null;
    endDate: string | null;
    perUserLimit: number | null;
    totalBudget: string | number | null;
    usedAmount: string | number;
    usedCount: number;
    stacksWithCoupon: boolean;
    stacksWithWallet: boolean;
    isActive: boolean;
    _count?: { entries: number };
}


interface UserHit {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    businessName: string | null;
}

type Tab = 'coupons' | 'cashback' | 'payouts';

const inr = (v: string | number | null | undefined) => `₹${Number(v ?? 0).toLocaleString('en-IN')}`;
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const num = (v: string): number | undefined => {
    if (v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};
const toIsoStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const toIsoEnd = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : undefined);

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] font-medium focus:outline-none focus:border-[#53B175]';
const labelCls = 'block text-[11px] font-bold text-gray-500 mb-1';
const thCls = 'px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-bold text-gray-400';
const tdCls = 'px-3 py-2.5 text-[12px] font-medium text-gray-700';

// ─── Coupon form modal ──────────────────────────────────────────────────────

interface CouponFormState {
    code: string; name: string; discountType: 'flat' | 'percentage'; discountValue: string;
    maxDiscount: string; minOrderValue: string; startDate: string; endDate: string;
    usageLimit: string; perUserLimit: string;
    stacksWithVendorPromo: boolean; stacksWithCashback: boolean; stacksWithWallet: boolean; isActive: boolean;
    categoryIds: string[]; productIds: string[]; brandNames: string[]; audienceUserIds: string[];
}

const emptyCouponForm: CouponFormState = {
    code: '', name: '', discountType: 'flat', discountValue: '',
    maxDiscount: '', minOrderValue: '', startDate: '', endDate: '',
    usageLimit: '', perUserLimit: '',
    stacksWithVendorPromo: true, stacksWithCashback: true, stacksWithWallet: true, isActive: true,
    categoryIds: [], productIds: [], brandNames: [], audienceUserIds: [],
};

function CouponModal({ editing, onClose, onSaved }: { editing: CouponRow | null; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState<CouponFormState>(
        editing
            ? {
                code: editing.code,
                name: editing.name,
                discountType: editing.discountType,
                discountValue: String(editing.discountValue ?? ''),
                maxDiscount: editing.maxDiscount != null ? String(editing.maxDiscount) : '',
                minOrderValue: editing.minOrderValue != null ? String(editing.minOrderValue) : '',
                startDate: editing.startDate ? editing.startDate.slice(0, 10) : '',
                endDate: editing.endDate ? editing.endDate.slice(0, 10) : '',
                usageLimit: editing.usageLimit != null ? String(editing.usageLimit) : '',
                perUserLimit: editing.perUserLimit != null ? String(editing.perUserLimit) : '',
                stacksWithVendorPromo: editing.stacksWithVendorPromo,
                stacksWithCashback: editing.stacksWithCashback,
                stacksWithWallet: editing.stacksWithWallet !== false,
                isActive: editing.isActive,
                categoryIds: editing.categoryIds ?? [],
                productIds: editing.productIds ?? [],
                brandNames: editing.brandNames ?? [],
                audienceUserIds: editing.audienceUserIds ?? [],
            }
            : emptyCouponForm,
    );
    const [saving, setSaving] = useState(false);
    const set = (patch: Partial<CouponFormState>) => setForm((f) => ({ ...f, ...patch }));

    const submit = async () => {
        if (!form.name.trim() || !form.discountValue.trim() || (!editing && !form.code.trim())) {
            toast.error('Code, name and discount value are required');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...(editing ? {} : { code: form.code.trim().toUpperCase() }),
                name: form.name.trim(),
                discountType: form.discountType,
                discountValue: num(form.discountValue),
                maxDiscount: num(form.maxDiscount) ?? null,
                minOrderValue: num(form.minOrderValue) ?? null,
                startDate: toIsoStart(form.startDate) ?? null,
                endDate: toIsoEnd(form.endDate) ?? null,
                usageLimit: num(form.usageLimit) ?? null,
                perUserLimit: num(form.perUserLimit) ?? null,
                stacksWithVendorPromo: form.stacksWithVendorPromo,
                stacksWithCashback: form.stacksWithCashback,
                stacksWithWallet: form.stacksWithWallet,
                isActive: form.isActive,
                categoryIds: form.categoryIds,
                productIds: form.productIds,
                brandNames: form.brandNames,
                audienceUserIds: form.audienceUserIds,
            };
            const res = await fetch(editing ? `/api/v1/admin/promotions/coupons/${editing.id}` : '/api/v1/admin/promotions/coupons', {
                method: editing ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error?.message || 'Save failed');
            toast.success(editing ? 'Coupon updated' : 'Coupon created');
            onSaved();
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[16px] font-bold text-[#181725]">{editing ? `Edit ${editing.code}` : 'New Platform Coupon'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={18} /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {!editing && (
                        <div>
                            <label className={labelCls}>Coupon Code *</label>
                            <input className={cn(inputCls, 'uppercase tracking-wide')} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="WELCOME500" />
                        </div>
                    )}
                    <div className={editing ? 'col-span-2' : ''}>
                        <label className={labelCls}>Name *</label>
                        <input className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Welcome offer" />
                    </div>
                    <div>
                        <label className={labelCls}>Discount Type</label>
                        <select className={inputCls} value={form.discountType} onChange={(e) => set({ discountType: e.target.value as 'flat' | 'percentage' })}>
                            <option value="flat">Flat (₹)</option>
                            <option value="percentage">Percentage (%)</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>{form.discountType === 'flat' ? 'Discount (₹) *' : 'Discount (%) *'}</label>
                        <input className={inputCls} type="number" min="0" value={form.discountValue} onChange={(e) => set({ discountValue: e.target.value })} />
                    </div>
                    {form.discountType === 'percentage' && (
                        <div>
                            <label className={labelCls}>Max Discount (₹)</label>
                            <input className={inputCls} type="number" min="0" value={form.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} />
                        </div>
                    )}
                    <div>
                        <label className={labelCls}>Min Order Value (₹)</label>
                        <input className={inputCls} type="number" min="0" value={form.minOrderValue} onChange={(e) => set({ minOrderValue: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelCls}>Start Date</label>
                        <input className={inputCls} type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelCls}>End Date</label>
                        <input className={inputCls} type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelCls}>Total Usage Limit</label>
                        <input className={inputCls} type="number" min="1" value={form.usageLimit} onChange={(e) => set({ usageLimit: e.target.value })} placeholder="Unlimited" />
                    </div>
                    <div>
                        <label className={labelCls}>Per-User Limit</label>
                        <input className={inputCls} type="number" min="1" value={form.perUserLimit} onChange={(e) => set({ perUserLimit: e.target.value })} placeholder="Unlimited" />
                    </div>
                    <CouponScopeFields
                        categoryIds={form.categoryIds}
                        productIds={form.productIds}
                        brandNames={form.brandNames}
                        productSource="admin"
                        onChange={(patch) => set(patch)}
                    />
                    <AudienceUserPicker
                        userIds={form.audienceUserIds}
                        onChange={(audienceUserIds) => set({ audienceUserIds })}
                    />
                </div>
                <div className="mt-4 space-y-2">
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#53B175]" checked={form.stacksWithVendorPromo} onChange={(e) => set({ stacksWithVendorPromo: e.target.checked })} />
                        Can be clubbed with vendor store discounts
                    </label>
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#53B175]" checked={form.stacksWithCashback} onChange={(e) => set({ stacksWithCashback: e.target.checked })} />
                        Can be clubbed with cashback offers
                    </label>
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#53B175]" checked={form.stacksWithWallet} onChange={(e) => set({ stacksWithWallet: e.target.checked })} />
                        Can be clubbed with H1 Wallet
                    </label>
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#53B175]" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
                        Active
                    </label>
                </div>
                <button
                    onClick={submit}
                    disabled={saving}
                    className="mt-5 w-full py-2.5 rounded-xl bg-[#53B175] text-white text-[13px] font-bold hover:bg-[#48a068] disabled:opacity-50 transition-colors cursor-pointer"
                >
                    {saving ? <Loader2 size={15} className="animate-spin mx-auto" /> : editing ? 'Save Changes' : 'Create Coupon'}
                </button>
            </div>
        </div>
    );
}

// ─── Cashback campaign form modal ───────────────────────────────────────────

interface CampaignFormState {
    name: string; cashbackType: 'flat' | 'percentage'; cashbackValue: string;
    maxCashback: string; minOrderValue: string;
    startDate: string; endDate: string; perUserLimit: string; totalBudget: string;
    stacksWithCoupon: boolean; stacksWithWallet: boolean; isActive: boolean;
}

const emptyCampaignForm: CampaignFormState = {
    name: '', cashbackType: 'flat', cashbackValue: '', maxCashback: '', minOrderValue: '',
    startDate: '', endDate: '', perUserLimit: '', totalBudget: '',
    stacksWithCoupon: true, stacksWithWallet: true, isActive: true,
};

function CampaignModal({ editing, onClose, onSaved }: { editing: CampaignRow | null; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState<CampaignFormState>(
        editing
            ? {
                name: editing.name,
                cashbackType: editing.cashbackType,
                cashbackValue: String(editing.cashbackValue ?? ''),
                maxCashback: editing.maxCashback != null ? String(editing.maxCashback) : '',
                minOrderValue: editing.minOrderValue != null ? String(editing.minOrderValue) : '',
                startDate: editing.startDate ? editing.startDate.slice(0, 10) : '',
                endDate: editing.endDate ? editing.endDate.slice(0, 10) : '',
                perUserLimit: editing.perUserLimit != null ? String(editing.perUserLimit) : '',
                totalBudget: editing.totalBudget != null ? String(editing.totalBudget) : '',
                stacksWithCoupon: editing.stacksWithCoupon,
                stacksWithWallet: editing.stacksWithWallet !== false,
                isActive: editing.isActive,
            }
            : emptyCampaignForm,
    );
    const [saving, setSaving] = useState(false);
    const set = (patch: Partial<CampaignFormState>) => setForm((f) => ({ ...f, ...patch }));

    const submit = async () => {
        if (!form.name.trim() || !form.cashbackValue.trim()) {
            toast.error('Name and cashback value are required');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                cashbackType: form.cashbackType,
                cashbackValue: num(form.cashbackValue),
                maxCashback: num(form.maxCashback) ?? null,
                minOrderValue: num(form.minOrderValue) ?? null,
                startDate: toIsoStart(form.startDate) ?? null,
                endDate: toIsoEnd(form.endDate) ?? null,
                perUserLimit: num(form.perUserLimit) ?? null,
                totalBudget: num(form.totalBudget) ?? null,
                stacksWithCoupon: form.stacksWithCoupon,
                stacksWithWallet: form.stacksWithWallet,
                isActive: form.isActive,
            };
            const res = await fetch(editing ? `/api/v1/admin/promotions/cashback/${editing.id}` : '/api/v1/admin/promotions/cashback', {
                method: editing ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error?.message || 'Save failed');
            toast.success(editing ? 'Campaign updated' : 'Campaign created');
            onSaved();
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[16px] font-bold text-[#181725]">{editing ? `Edit ${editing.name}` : 'New Cashback Campaign'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={18} /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                        <label className={labelCls}>Campaign Name *</label>
                        <input className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Spend ₹20,000 get ₹500" />
                    </div>
                    <div>
                        <label className={labelCls}>Cashback Type</label>
                        <select className={inputCls} value={form.cashbackType} onChange={(e) => set({ cashbackType: e.target.value as 'flat' | 'percentage' })}>
                            <option value="flat">Flat (₹)</option>
                            <option value="percentage">Percentage (%)</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>{form.cashbackType === 'flat' ? 'Cashback (₹) *' : 'Cashback (%) *'}</label>
                        <input className={inputCls} type="number" min="0" value={form.cashbackValue} onChange={(e) => set({ cashbackValue: e.target.value })} />
                    </div>
                    {form.cashbackType === 'percentage' && (
                        <div>
                            <label className={labelCls}>Max Cashback (₹)</label>
                            <input className={inputCls} type="number" min="0" value={form.maxCashback} onChange={(e) => set({ maxCashback: e.target.value })} />
                        </div>
                    )}
                    <div>
                        <label className={labelCls}>Min Order Value (₹)</label>
                        <input className={inputCls} type="number" min="0" value={form.minOrderValue} onChange={(e) => set({ minOrderValue: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelCls}>Total Budget (₹)</label>
                        <input className={inputCls} type="number" min="0" value={form.totalBudget} onChange={(e) => set({ totalBudget: e.target.value })} placeholder="Unlimited" />
                    </div>
                    <div>
                        <label className={labelCls}>Start Date</label>
                        <input className={inputCls} type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelCls}>End Date</label>
                        <input className={inputCls} type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelCls}>Per-User Limit</label>
                        <input className={inputCls} type="number" min="1" value={form.perUserLimit} onChange={(e) => set({ perUserLimit: e.target.value })} placeholder="Unlimited" />
                    </div>
                </div>
                <p className="mt-3 text-[11px] text-gray-400 font-medium">Credits the customer&apos;s H1 Wallet after delivery.</p>
                <div className="mt-4 space-y-2">
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#53B175]" checked={form.stacksWithCoupon} onChange={(e) => set({ stacksWithCoupon: e.target.checked })} />
                        Can be clubbed with coupons
                    </label>
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#53B175]" checked={form.stacksWithWallet} onChange={(e) => set({ stacksWithWallet: e.target.checked })} />
                        Can be clubbed with H1 Wallet payment
                    </label>
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#53B175]" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
                        Active
                    </label>
                </div>
                <button
                    onClick={submit}
                    disabled={saving}
                    className="mt-5 w-full py-2.5 rounded-xl bg-[#53B175] text-white text-[13px] font-bold hover:bg-[#48a068] disabled:opacity-50 transition-colors cursor-pointer"
                >
                    {saving ? <Loader2 size={15} className="animate-spin mx-auto" /> : editing ? 'Save Changes' : 'Create Campaign'}
                </button>
            </div>
        </div>
    );
}

// ─── Direct grant modal (User Cashback — individual incentive) ─────────────

function GrantModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<UserHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<UserHit | null>(null);
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const search = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const res = await fetch(`/api/v1/admin/users?search=${encodeURIComponent(query.trim())}&limit=8`);
            const json = await res.json();
            const users = (json?.data?.users ?? json?.data ?? []) as UserHit[];
            setHits(Array.isArray(users) ? users : []);
        } catch {
            setHits([]);
        } finally {
            setSearching(false);
        }
    };

    const submit = async () => {
        if (!selected || !num(amount)) {
            toast.error('Pick a user and enter an amount');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/v1/admin/promotions/grant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: selected.id, amount: num(amount), destination: 'wallet', notes: notes.trim() || null }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error?.message || 'Grant failed');
            const key = typeof json?.data?.trackingKey === 'string' ? json.data.trackingKey : null;
            toast.success(key ? `Incentive credited to H1 Wallet · ${key}` : 'Incentive credited to H1 Wallet');
            onSaved();
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Grant failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[16px] font-bold text-[#181725]">Instant H1 Wallet grant</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={18} /></button>
                </div>

                {selected ? (
                    <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 mb-4">
                        <div className="min-w-0">
                            <p className="text-[13px] font-bold text-[#181725] truncate">{selected.fullName || selected.businessName || '—'}</p>
                            <p className="text-[11px] text-gray-500 truncate">{selected.phone || selected.email}</p>
                        </div>
                        <button onClick={() => setSelected(null)} className="text-[11px] font-bold text-red-500 hover:underline shrink-0 ml-3 cursor-pointer">Change</button>
                    </div>
                ) : (
                    <div className="mb-4">
                        <label className={labelCls}>Find user (name / phone / email / HCID)</label>
                        <div className="flex gap-2">
                            <input className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} placeholder="98765… or name" />
                            <button onClick={search} disabled={searching} className="shrink-0 px-3 rounded-lg bg-[#181725] text-white cursor-pointer disabled:opacity-50">
                                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                            </button>
                        </div>
                        {hits.length > 0 && (
                            <ul className="mt-2 border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-[200px] overflow-y-auto">
                                {hits.map((u) => (
                                    <li key={u.id}>
                                        <button onClick={() => { setSelected(u); setHits([]); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer">
                                            <p className="text-[12px] font-bold text-[#181725]">{u.fullName || u.businessName || '—'}</p>
                                            <p className="text-[10px] text-gray-400">{u.phone || u.email}</p>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls}>Amount (₹) *</label>
                        <input className={inputCls} type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                        <label className={labelCls}>Notes (internal)</label>
                        <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. loyalty reward — June campaign" />
                    </div>
                </div>
                <p className="mt-3 text-[11px] text-gray-400 font-medium">Credits H1 Wallet immediately. For UPI, create a payout link instead.</p>
                <button
                    onClick={submit}
                    disabled={saving || !selected}
                    className="mt-5 w-full py-2.5 rounded-xl bg-[#53B175] text-white text-[13px] font-bold hover:bg-[#48a068] disabled:opacity-50 transition-colors cursor-pointer"
                >
                    {saving ? <Loader2 size={15} className="animate-spin mx-auto" /> : 'Credit H1 Wallet'}
                </button>
            </div>
        </div>
    );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminPromotionsPage() {
    const searchParams = useSearchParams();
    const tabFromUrl = searchParams.get('tab');
    const [tab, setTab] = useState<Tab>(
        tabFromUrl === 'payouts' || tabFromUrl === 'cashback' || tabFromUrl === 'coupons'
            ? tabFromUrl
            : 'coupons',
    );
    const [loading, setLoading] = useState(true);
    const [coupons, setCoupons] = useState<CouponRow[]>([]);
    const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
    const [couponModal, setCouponModal] = useState<{ open: boolean; editing: CouponRow | null }>({ open: false, editing: null });
    const [campaignModal, setCampaignModal] = useState<{ open: boolean; editing: CampaignRow | null }>({ open: false, editing: null });
    const [grantOpen, setGrantOpen] = useState(false);

    const load = useCallback(async (which: Tab) => {
        if (which === 'payouts') {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            if (which === 'coupons') {
                const res = await fetch('/api/v1/admin/promotions/coupons');
                const json = await res.json();
                if (json?.success) setCoupons(json.data ?? []);
                else toast.error(json?.error?.message || 'Failed to load coupons');
            } else {
                const res = await fetch('/api/v1/admin/promotions/cashback');
                const json = await res.json();
                if (json?.success) setCampaigns(json.data ?? []);
                else toast.error(json?.error?.message || 'Failed to load campaigns');
            }
        } catch {
            toast.error('Failed to load promotions data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(tab);
    }, [tab, load]);

    const refresh = () => load(tab);

    const deleteCoupon = async (c: CouponRow) => {
        if (!confirm(`Delete coupon ${c.code}? Used coupons are deactivated instead.`)) return;
        const res = await fetch(`/api/v1/admin/promotions/coupons/${c.id}`, { method: 'DELETE' });
        const json = await res.json();
        if (res.ok) {
            toast.success(json?.data?.deactivated ? 'Coupon deactivated (had redemptions)' : 'Coupon deleted');
            refresh();
        } else {
            toast.error(json?.error?.message || 'Delete failed');
        }
    };

    const deleteCampaign = async (c: CampaignRow) => {
        if (!confirm(`Delete campaign "${c.name}"? Used campaigns are deactivated instead.`)) return;
        const res = await fetch(`/api/v1/admin/promotions/cashback/${c.id}`, { method: 'DELETE' });
        const json = await res.json();
        if (res.ok) {
            toast.success(json?.data?.deactivated ? 'Campaign deactivated (had earnings)' : 'Campaign deleted');
            refresh();
        } else {
            toast.error(json?.error?.message || 'Delete failed');
        }
    };

    const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
        { id: 'coupons', label: 'Coupon', icon: Ticket },
        { id: 'cashback', label: 'Cashback Wallet', icon: Gift },
        { id: 'payouts', label: 'Cashback UPI', icon: IndianRupee },
    ];

    return (
        <div className="w-full min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-[clamp(1.2rem,1.5vw+0.6rem,1.6rem)] font-bold text-[#181725]">Promotions</h1>
                    <p className="text-[12px] text-gray-400 font-medium">Coupons, wallet cashback, and UPI payout links.</p>
                </div>
                <div className="flex gap-2">
                    {tab === 'coupons' && (
                        <button onClick={() => setCouponModal({ open: true, editing: null })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#53B175] text-white text-[12px] font-bold hover:bg-[#48a068] transition-colors cursor-pointer">
                            <Plus size={14} /> New Coupon
                        </button>
                    )}
                    {tab === 'cashback' && (
                        <>
                            <button onClick={() => setGrantOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-[#181725] text-[12px] font-bold hover:bg-gray-50 transition-colors cursor-pointer">
                                Instant H1 Wallet grant
                            </button>
                            <button onClick={() => setCampaignModal({ open: true, editing: null })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#53B175] text-white text-[12px] font-bold hover:bg-[#48a068] transition-colors cursor-pointer">
                                <Plus size={14} /> New Campaign
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-bold transition-colors cursor-pointer',
                            tab === t.id ? 'bg-white text-[#181725] shadow-sm' : 'text-gray-500 hover:text-gray-700',
                        )}
                    >
                        <t.icon size={14} /> {t.label}
                    </button>
                ))}
            </div>

            {tab === 'payouts' ? (
                <CashbackUpiPanel
                    listUrl="/api/v1/admin/promotions/payout-invites"
                    createUrl="/api/v1/admin/promotions/payout-invites"
                    detailHref={(key) => `/admin/promotions/payouts/${encodeURIComponent(key)}`}
                    markPaidUrl={(row) => row.entryId ? `/api/v1/admin/promotions/entries/${row.entryId}` : null}
                />
            ) : loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={28} className="text-[#53B175] animate-spin" />
                </div>
            ) : tab === 'coupons' ? (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                        <thead className="bg-gray-50/70 border-b border-gray-100">
                            <tr>
                                <th className={thCls}>Code</th>
                                <th className={thCls}>Name</th>
                                <th className={thCls}>Owner</th>
                                <th className={thCls}>Discount</th>
                                <th className={thCls}>Min Order</th>
                                <th className={thCls}>Validity</th>
                                <th className={thCls}>Used</th>
                                <th className={thCls}>Stacking</th>
                                <th className={thCls}>Status</th>
                                <th className={thCls}></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {coupons.length === 0 && (
                                <tr><td colSpan={10} className="px-3 py-10 text-center text-[13px] text-gray-400">No coupons yet — create the first one.</td></tr>
                            )}
                            {coupons.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50/50">
                                    <td className={cn(tdCls, 'font-bold tracking-wide text-[#181725]')}>{c.code}</td>
                                    <td className={tdCls}>{c.name}</td>
                                    <td className={tdCls}>{c.vendor?.businessName ?? <span className="text-[#53B175] font-bold">Platform</span>}</td>
                                    <td className={tdCls}>
                                        {c.discountType === 'flat' ? inr(c.discountValue) : `${Number(c.discountValue)}%${c.maxDiscount ? ` (max ${inr(c.maxDiscount)})` : ''}`}
                                    </td>
                                    <td className={tdCls}>{c.minOrderValue ? inr(c.minOrderValue) : '—'}</td>
                                    <td className={tdCls}>{fmtDate(c.startDate)} → {fmtDate(c.endDate)}</td>
                                    <td className={tdCls}>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                                    <td className={tdCls}>
                                        <span title="Clubs with vendor discounts" className={c.stacksWithVendorPromo ? 'text-[#53B175]' : 'text-gray-300'}>V</span>
                                        {' · '}
                                        <span title="Clubs with cashback" className={c.stacksWithCashback ? 'text-[#53B175]' : 'text-gray-300'}>C</span>
                                        {' · '}
                                        <span title="Clubs with H1 Wallet" className={c.stacksWithWallet ? 'text-[#53B175]' : 'text-gray-300'}>W</span>
                                    </td>
                                    <td className={tdCls}>
                                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', c.isActive ? 'bg-green-50 text-[#53B175]' : 'bg-gray-100 text-gray-400')}>
                                            {c.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className={cn(tdCls, 'whitespace-nowrap')}>
                                        <button onClick={() => setCouponModal({ open: true, editing: c })} className="p-1.5 text-gray-400 hover:text-[#53B175] cursor-pointer" title="Edit"><Pencil size={14} /></button>
                                        <button onClick={() => deleteCoupon(c)} className="p-1.5 text-gray-400 hover:text-red-500 cursor-pointer" title="Delete"><Trash2 size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : tab === 'cashback' ? (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                        <thead className="bg-gray-50/70 border-b border-gray-100">
                            <tr>
                                <th className={thCls}>Campaign</th>
                                <th className={thCls}>Owner</th>
                                <th className={thCls}>Cashback</th>
                                <th className={thCls}>Min Order</th>
                                <th className={thCls}>Destination</th>
                                <th className={thCls}>Budget</th>
                                <th className={thCls}>Validity</th>
                                <th className={thCls}>Earns</th>
                                <th className={thCls}>Status</th>
                                <th className={thCls}></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {campaigns.length === 0 && (
                                <tr><td colSpan={10} className="px-3 py-10 text-center text-[13px] text-gray-400">No cashback campaigns yet.</td></tr>
                            )}
                            {campaigns.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50/50">
                                    <td className={cn(tdCls, 'font-bold text-[#181725]')}>{c.name}</td>
                                    <td className={tdCls}>{c.vendor?.businessName ?? <span className="text-[#53B175] font-bold">Platform</span>}</td>
                                    <td className={tdCls}>
                                        {c.cashbackType === 'flat' ? inr(c.cashbackValue) : `${Number(c.cashbackValue)}%${c.maxCashback ? ` (max ${inr(c.maxCashback)})` : ''}`}
                                    </td>
                                    <td className={tdCls}>{c.minOrderValue ? inr(c.minOrderValue) : '—'}</td>
                                    <td className={tdCls}>{c.destination === 'wallet' ? 'H1 Wallet' : 'UPI (legacy)'}</td>
                                    <td className={tdCls}>{c.totalBudget ? `${inr(c.usedAmount)} / ${inr(c.totalBudget)}` : inr(c.usedAmount)}</td>
                                    <td className={tdCls}>{fmtDate(c.startDate)} → {fmtDate(c.endDate)}</td>
                                    <td className={tdCls}>{c.usedCount}</td>
                                    <td className={tdCls}>
                                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', c.isActive ? 'bg-green-50 text-[#53B175]' : 'bg-gray-100 text-gray-400')}>
                                            {c.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className={cn(tdCls, 'whitespace-nowrap')}>
                                        <button onClick={() => setCampaignModal({ open: true, editing: c })} className="p-1.5 text-gray-400 hover:text-[#53B175] cursor-pointer" title="Edit"><Pencil size={14} /></button>
                                        <button onClick={() => deleteCampaign(c)} className="p-1.5 text-gray-400 hover:text-red-500 cursor-pointer" title="Delete"><Trash2 size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}

            {couponModal.open && <CouponModal editing={couponModal.editing} onClose={() => setCouponModal({ open: false, editing: null })} onSaved={refresh} />}
            {campaignModal.open && <CampaignModal editing={campaignModal.editing} onClose={() => setCampaignModal({ open: false, editing: null })} onSaved={refresh} />}
            {grantOpen && <GrantModal onClose={() => setGrantOpen(false)} onSaved={refresh} />}
        </div>
    );
}
