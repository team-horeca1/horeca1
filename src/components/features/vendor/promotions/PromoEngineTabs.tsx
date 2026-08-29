'use client';

// Promo Engine Phase 1 — vendor-side Coupons + Cashback tabs, rendered inside
// /vendor/promotions. Everything is scoped server-side to the resolved vendor;
// a vendor coupon/campaign can only ever discount that vendor's own orders.

import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CouponScopeFields } from '@/components/features/promo/CouponScopePickers';

interface VendorCouponRow {
    id: string;
    code: string;
    name: string;
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
}

interface VendorCampaignRow {
    id: string;
    name: string;
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
}

const inr = (v: string | number | null | undefined) => `₹${Number(v ?? 0).toLocaleString('en-IN')}`;
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—');
const num = (v: string): number | undefined => {
    if (v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};
const toIsoStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const toIsoEnd = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : undefined);

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] font-medium focus:outline-none focus:border-[#299E60]';
const labelCls = 'block text-[11px] font-bold text-gray-500 mb-1';
const thCls = 'px-3 py-2.5 text-left text-[10px] uppercase tracking-wider font-bold text-gray-400';
const tdCls = 'px-3 py-2.5 text-[12px] font-medium text-gray-700';

// ─── Coupons tab ────────────────────────────────────────────────────────────

interface CouponForm {
    code: string; name: string; discountType: 'flat' | 'percentage'; discountValue: string;
    maxDiscount: string; minOrderValue: string; startDate: string; endDate: string;
    usageLimit: string; perUserLimit: string;
    stacksWithVendorPromo: boolean; stacksWithCashback: boolean; stacksWithWallet: boolean; isActive: boolean;
    categoryIds: string[]; productIds: string[]; brandNames: string[];
}

const emptyCouponForm: CouponForm = {
    code: '', name: '', discountType: 'flat', discountValue: '', maxDiscount: '',
    minOrderValue: '', startDate: '', endDate: '', usageLimit: '', perUserLimit: '',
    stacksWithVendorPromo: true, stacksWithCashback: true, stacksWithWallet: true, isActive: true,
    categoryIds: [], productIds: [], brandNames: [],
};

export function VendorCouponsTab() {
    const [rows, setRows] = useState<VendorCouponRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<{ open: boolean; editing: VendorCouponRow | null }>({ open: false, editing: null });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/vendor/coupons');
            const json = await res.json();
            if (json?.success) setRows(json.data ?? []);
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const remove = async (c: VendorCouponRow) => {
        if (!confirm(`Delete coupon ${c.code}? Used coupons are deactivated instead.`)) return;
        const res = await fetch(`/api/v1/vendor/coupons/${c.id}`, { method: 'DELETE' });
        const json = await res.json();
        if (res.ok) {
            toast.success(json?.data?.deactivated ? 'Coupon deactivated (had redemptions)' : 'Coupon deleted');
            load();
        } else {
            toast.error(json?.error?.message || 'Delete failed');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-[16px] font-bold text-[#181725]">Store Coupons</h2>
                    <p className="text-[12px] text-[#AEAEAE]">Codes your customers apply at checkout — valid only on your store.</p>
                </div>
                <button
                    onClick={() => setModal({ open: true, editing: null })}
                    className="flex items-center gap-2 px-5 h-[38px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] transition-colors cursor-pointer"
                >
                    <Plus size={14} /> New Coupon
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-[#299E60]" size={26} /></div>
            ) : (
                <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-x-auto">
                    <table className="w-full min-w-[760px]">
                        <thead className="bg-gray-50/70 border-b border-gray-100">
                            <tr>
                                <th className={thCls}>Code</th>
                                <th className={thCls}>Name</th>
                                <th className={thCls}>Discount</th>
                                <th className={thCls}>Min Order</th>
                                <th className={thCls}>Validity</th>
                                <th className={thCls}>Used</th>
                                <th className={thCls}>Status</th>
                                <th className={thCls}></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {rows.length === 0 && (
                                <tr><td colSpan={8} className="px-3 py-10 text-center text-[13px] text-gray-400">No coupons yet — create one to share with your customers.</td></tr>
                            )}
                            {rows.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50/50">
                                    <td className={cn(tdCls, 'font-bold tracking-wide text-[#181725]')}>{c.code}</td>
                                    <td className={tdCls}>{c.name}</td>
                                    <td className={tdCls}>{c.discountType === 'flat' ? inr(c.discountValue) : `${Number(c.discountValue)}%${c.maxDiscount ? ` (max ${inr(c.maxDiscount)})` : ''}`}</td>
                                    <td className={tdCls}>{c.minOrderValue ? inr(c.minOrderValue) : '—'}</td>
                                    <td className={tdCls}>{fmtDate(c.startDate)} → {fmtDate(c.endDate)}</td>
                                    <td className={tdCls}>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                                    <td className={tdCls}>
                                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', c.isActive ? 'bg-[#EEF8F1] text-[#299E60]' : 'bg-gray-100 text-gray-400')}>
                                            {c.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className={cn(tdCls, 'whitespace-nowrap')}>
                                        <button onClick={() => setModal({ open: true, editing: c })} className="p-1.5 text-gray-400 hover:text-[#299E60] cursor-pointer" title="Edit"><Pencil size={14} /></button>
                                        <button onClick={() => remove(c)} className="p-1.5 text-gray-400 hover:text-red-500 cursor-pointer" title="Delete"><Trash2 size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modal.open && <VendorCouponModal editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />}
        </div>
    );
}

function VendorCouponModal({ editing, onClose, onSaved }: { editing: VendorCouponRow | null; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState<CouponForm>(
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
            }
            : emptyCouponForm,
    );
    const [saving, setSaving] = useState(false);
    const set = (patch: Partial<CouponForm>) => setForm((f) => ({ ...f, ...patch }));

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
            };
            const res = await fetch(editing ? `/api/v1/vendor/coupons/${editing.id}` : '/api/v1/vendor/coupons', {
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
                    <h3 className="text-[16px] font-bold text-[#181725]">{editing ? `Edit ${editing.code}` : 'New Store Coupon'}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={18} /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {!editing && (
                        <div>
                            <label className={labelCls}>Coupon Code *</label>
                            <input className={cn(inputCls, 'uppercase tracking-wide')} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="STORE10" />
                        </div>
                    )}
                    <div className={editing ? 'col-span-2' : ''}>
                        <label className={labelCls}>Name *</label>
                        <input className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="10% off this month" />
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
                        productSource="vendor"
                        focusBorder="focus:border-[#299E60]"
                        onChange={(patch) => set(patch)}
                    />
                </div>
                <div className="mt-4 space-y-2">
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#299E60]" checked={form.stacksWithVendorPromo} onChange={(e) => set({ stacksWithVendorPromo: e.target.checked })} />
                        Can be clubbed with my store offers
                    </label>
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#299E60]" checked={form.stacksWithCashback} onChange={(e) => set({ stacksWithCashback: e.target.checked })} />
                        Can be clubbed with cashback offers
                    </label>
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#299E60]" checked={form.stacksWithWallet} onChange={(e) => set({ stacksWithWallet: e.target.checked })} />
                        Can be clubbed with H1 Wallet
                    </label>
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#299E60]" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
                        Active
                    </label>
                </div>
                <button
                    onClick={submit}
                    disabled={saving}
                    className="mt-5 w-full py-2.5 rounded-xl bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] disabled:opacity-50 transition-colors cursor-pointer"
                >
                    {saving ? <Loader2 size={15} className="animate-spin mx-auto" /> : editing ? 'Save Changes' : 'Create Coupon'}
                </button>
            </div>
        </div>
    );
}

// ─── Cashback tab ───────────────────────────────────────────────────────────

interface CampaignForm {
    name: string; cashbackType: 'flat' | 'percentage'; cashbackValue: string;
    maxCashback: string; minOrderValue: string;
    startDate: string; endDate: string; perUserLimit: string; totalBudget: string;
    stacksWithCoupon: boolean; stacksWithWallet: boolean; isActive: boolean;
}

const emptyCampaignForm: CampaignForm = {
    name: '', cashbackType: 'flat', cashbackValue: '', maxCashback: '', minOrderValue: '',
    startDate: '', endDate: '', perUserLimit: '', totalBudget: '',
    stacksWithCoupon: true, stacksWithWallet: true, isActive: true,
};

export function VendorCashbackTab() {
    const [rows, setRows] = useState<VendorCampaignRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<{ open: boolean; editing: VendorCampaignRow | null }>({ open: false, editing: null });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/vendor/cashback');
            const json = await res.json();
            if (json?.success) setRows(json.data ?? []);
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const remove = async (c: VendorCampaignRow) => {
        if (!confirm(`Delete campaign "${c.name}"? Used campaigns are deactivated instead.`)) return;
        const res = await fetch(`/api/v1/vendor/cashback/${c.id}`, { method: 'DELETE' });
        const json = await res.json();
        if (res.ok) {
            toast.success(json?.data?.deactivated ? 'Campaign deactivated (had earnings)' : 'Campaign deleted');
            load();
        } else {
            toast.error(json?.error?.message || 'Delete failed');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-[16px] font-bold text-[#181725]">Cashback Wallet</h2>
                    <p className="text-[12px] text-[#AEAEAE]">Reward repeat orders — e.g. “Buy from my store, get ₹300 back”. Credited after delivery.</p>
                </div>
                <button
                    onClick={() => setModal({ open: true, editing: null })}
                    className="flex items-center gap-2 px-5 h-[38px] rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] transition-colors cursor-pointer"
                >
                    <Plus size={14} /> New Campaign
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-[#299E60]" size={26} /></div>
            ) : (
                <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-x-auto">
                    <table className="w-full min-w-[760px]">
                        <thead className="bg-gray-50/70 border-b border-gray-100">
                            <tr>
                                <th className={thCls}>Campaign</th>
                                <th className={thCls}>Cashback</th>
                                <th className={thCls}>Min Order</th>
                                <th className={thCls}>Destination</th>
                                <th className={thCls}>Budget Used</th>
                                <th className={thCls}>Validity</th>
                                <th className={thCls}>Earns</th>
                                <th className={thCls}>Status</th>
                                <th className={thCls}></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {rows.length === 0 && (
                                <tr><td colSpan={9} className="px-3 py-10 text-center text-[13px] text-gray-400">No cashback campaigns yet.</td></tr>
                            )}
                            {rows.map((c) => (
                                <tr key={c.id} className="hover:bg-gray-50/50">
                                    <td className={cn(tdCls, 'font-bold text-[#181725]')}>{c.name}</td>
                                    <td className={tdCls}>{c.cashbackType === 'flat' ? inr(c.cashbackValue) : `${Number(c.cashbackValue)}%${c.maxCashback ? ` (max ${inr(c.maxCashback)})` : ''}`}</td>
                                    <td className={tdCls}>{c.minOrderValue ? inr(c.minOrderValue) : '—'}</td>
                                    <td className={tdCls}>{c.destination === 'wallet' ? 'H1 Wallet' : 'UPI (legacy)'}</td>
                                    <td className={tdCls}>{c.totalBudget ? `${inr(c.usedAmount)} / ${inr(c.totalBudget)}` : inr(c.usedAmount)}</td>
                                    <td className={tdCls}>{fmtDate(c.startDate)} → {fmtDate(c.endDate)}</td>
                                    <td className={tdCls}>{c.usedCount}</td>
                                    <td className={tdCls}>
                                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', c.isActive ? 'bg-[#EEF8F1] text-[#299E60]' : 'bg-gray-100 text-gray-400')}>
                                            {c.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className={cn(tdCls, 'whitespace-nowrap')}>
                                        <button onClick={() => setModal({ open: true, editing: c })} className="p-1.5 text-gray-400 hover:text-[#299E60] cursor-pointer" title="Edit"><Pencil size={14} /></button>
                                        <button onClick={() => remove(c)} className="p-1.5 text-gray-400 hover:text-red-500 cursor-pointer" title="Delete"><Trash2 size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modal.open && <VendorCampaignModal editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={load} />}
        </div>
    );
}

function VendorCampaignModal({ editing, onClose, onSaved }: { editing: VendorCampaignRow | null; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState<CampaignForm>(
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
    const set = (patch: Partial<CampaignForm>) => setForm((f) => ({ ...f, ...patch }));

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
            const res = await fetch(editing ? `/api/v1/vendor/cashback/${editing.id}` : '/api/v1/vendor/cashback', {
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
                        <input className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="₹300 back on orders above ₹20,000" />
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
                        <input type="checkbox" className="accent-[#299E60]" checked={form.stacksWithCoupon} onChange={(e) => set({ stacksWithCoupon: e.target.checked })} />
                        Can be clubbed with coupons
                    </label>
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#299E60]" checked={form.stacksWithWallet} onChange={(e) => set({ stacksWithWallet: e.target.checked })} />
                        Can be clubbed with H1 Wallet payment
                    </label>
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
                        <input type="checkbox" className="accent-[#299E60]" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
                        Active
                    </label>
                </div>
                <button
                    onClick={submit}
                    disabled={saving}
                    className="mt-5 w-full py-2.5 rounded-xl bg-[#299E60] text-white text-[13px] font-bold hover:bg-[#238a54] disabled:opacity-50 transition-colors cursor-pointer"
                >
                    {saving ? <Loader2 size={15} className="animate-spin mx-auto" /> : editing ? 'Save Changes' : 'Create Campaign'}
                </button>
            </div>
        </div>
    );
}
