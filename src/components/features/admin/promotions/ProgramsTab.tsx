'use client';

// Admin Programs tab — singleton forms for Welcome, First Order, and Referral.
// Not a rules builder: one form per program, matching /admin/promotions patterns.

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type WelcomeReward = 'wallet_credit' | 'coupon_flat' | 'coupon_percentage' | 'free_delivery';
type SideReward = 'wallet_credit' | 'coupon_flat' | 'coupon_percentage';
type ReferralTrigger = 'signup' | 'first_order' | 'first_order_mov';

/** Legacy `cashback` issued the same H1 Wallet credit — collapse it in the UI. */
function normalizeProgramRewardType(t: string): WelcomeReward | SideReward {
    if (t === 'cashback') return 'wallet_credit';
    return t as WelcomeReward | SideReward;
}

interface WelcomeForm {
    isActive: boolean;
    rewardType: WelcomeReward;
    rewardValue: string;
    minOrderValue: string;
    validDays: string;
    maxDiscount: string;
}

interface FirstOrderForm {
    isActive: boolean;
    rewardType: SideReward;
    rewardValue: string;
    minOrderValue: string;
    validDays: string;
    maxDiscount: string;
}

interface ReferralForm {
    isActive: boolean;
    trigger: ReferralTrigger;
    minOrderValue: string;
    referrerRewardType: SideReward;
    referrerRewardValue: string;
    referrerMaxDiscount: string;
    referrerValidDays: string;
    referredRewardType: SideReward;
    referredRewardValue: string;
    referredMaxDiscount: string;
    referredValidDays: string;
}

const emptyWelcome: WelcomeForm = {
    isActive: false, rewardType: 'wallet_credit', rewardValue: '', minOrderValue: '', validDays: '', maxDiscount: '',
};
const emptyFirst: FirstOrderForm = {
    isActive: false, rewardType: 'wallet_credit', rewardValue: '', minOrderValue: '', validDays: '', maxDiscount: '',
};
const emptyReferral: ReferralForm = {
    isActive: false, trigger: 'signup', minOrderValue: '',
    referrerRewardType: 'wallet_credit', referrerRewardValue: '', referrerMaxDiscount: '', referrerValidDays: '',
    referredRewardType: 'coupon_flat', referredRewardValue: '', referredMaxDiscount: '', referredValidDays: '',
};

const WELCOME_TYPES: Array<{ id: WelcomeReward; label: string }> = [
    { id: 'wallet_credit', label: 'H1 Wallet credit' },
    { id: 'coupon_flat', label: 'Personal coupon (₹)' },
    { id: 'coupon_percentage', label: 'Personal coupon (%)' },
    { id: 'free_delivery', label: 'Free delivery (once)' },
];
const SIDE_TYPES: Array<{ id: SideReward; label: string }> = WELCOME_TYPES.filter(
    (t): t is { id: SideReward; label: string } => t.id !== 'free_delivery',
);

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] font-medium focus:outline-none focus:border-[#6B1D2E]';
const labelCls = 'block text-[11px] font-bold text-gray-500 mb-1';

const num = (v: string): number | undefined => {
    if (v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};
const dec = (v: string | number | null | undefined): string => (v == null ? '' : String(v));
const intStr = (v: number | null | undefined): string => (v == null ? '' : String(v));

function isCouponType(t: string) {
    return t === 'coupon_flat' || t === 'coupon_percentage';
}

function RewardFields({
    form,
    types,
    set,
    hideMinOrder = false,
}: {
    form: { rewardType: string; rewardValue: string; minOrderValue: string; validDays: string; maxDiscount: string };
    types: Array<{ id: string; label: string }>;
    set: (patch: Partial<{ rewardType: string; rewardValue: string; minOrderValue: string; validDays: string; maxDiscount: string }>) => void;
    hideMinOrder?: boolean;
}) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            <div className="sm:col-span-2">
                <label className={labelCls}>Reward type</label>
                <select className={inputCls} value={form.rewardType} onChange={(e) => set({ rewardType: e.target.value })}>
                    {types.map((t) => <option key={String(t.id)} value={String(t.id)}>{t.label}</option>)}
                </select>
            </div>
            {form.rewardType !== 'free_delivery' && (
                <div>
                    <label className={labelCls}>{form.rewardType === 'coupon_percentage' ? 'Value (%) *' : 'Value (₹) *'}</label>
                    <input className={inputCls} type="number" min="0" value={form.rewardValue} onChange={(e) => set({ rewardValue: e.target.value })} />
                </div>
            )}
            {form.rewardType === 'coupon_percentage' && (
                <div>
                    <label className={labelCls}>Max discount (₹)</label>
                    <input className={inputCls} type="number" min="0" value={form.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} />
                </div>
            )}
            {!hideMinOrder && (
                <div>
                    <label className={labelCls}>Min order value (₹)</label>
                    <input className={inputCls} type="number" min="0" value={form.minOrderValue} onChange={(e) => set({ minOrderValue: e.target.value })} />
                </div>
            )}
            {isCouponType(form.rewardType) && (
                <div>
                    <label className={labelCls}>Coupon valid days</label>
                    <input className={inputCls} type="number" min="1" value={form.validDays} onChange={(e) => set({ validDays: e.target.value })} placeholder="No expiry" />
                </div>
            )}
        </div>
    );
}

export function ProgramsTab() {
    const [loading, setLoading] = useState(true);
    const [welcome, setWelcome] = useState<WelcomeForm>(emptyWelcome);
    const [first, setFirst] = useState<FirstOrderForm>(emptyFirst);
    const [referral, setReferral] = useState<ReferralForm>(emptyReferral);
    const [saving, setSaving] = useState<'welcome' | 'first-order' | 'referral' | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [w, f, r] = await Promise.all([
                fetch('/api/v1/admin/promotions/programs/welcome').then((res) => res.json()),
                fetch('/api/v1/admin/promotions/programs/first-order').then((res) => res.json()),
                fetch('/api/v1/admin/promotions/programs/referral').then((res) => res.json()),
            ]);
            if (w?.data) {
                setWelcome({
                    isActive: Boolean(w.data.isActive),
                    rewardType: normalizeProgramRewardType(String(w.data.rewardType)) as WelcomeReward,
                    rewardValue: dec(w.data.rewardValue),
                    minOrderValue: dec(w.data.minOrderValue),
                    validDays: intStr(w.data.validDays),
                    maxDiscount: dec(w.data.maxDiscount),
                });
            }
            if (f?.data) {
                setFirst({
                    isActive: Boolean(f.data.isActive),
                    rewardType: normalizeProgramRewardType(String(f.data.rewardType)) as SideReward,
                    rewardValue: dec(f.data.rewardValue),
                    minOrderValue: dec(f.data.minOrderValue),
                    validDays: intStr(f.data.validDays),
                    maxDiscount: dec(f.data.maxDiscount),
                });
            }
            if (r?.data) {
                setReferral({
                    isActive: Boolean(r.data.isActive),
                    trigger: r.data.trigger,
                    minOrderValue: dec(r.data.minOrderValue),
                    referrerRewardType: normalizeProgramRewardType(String(r.data.referrerRewardType)) as SideReward,
                    referrerRewardValue: dec(r.data.referrerRewardValue),
                    referrerMaxDiscount: dec(r.data.referrerMaxDiscount),
                    referrerValidDays: intStr(r.data.referrerValidDays),
                    referredRewardType: normalizeProgramRewardType(String(r.data.referredRewardType)) as SideReward,
                    referredRewardValue: dec(r.data.referredRewardValue),
                    referredMaxDiscount: dec(r.data.referredMaxDiscount),
                    referredValidDays: intStr(r.data.referredValidDays),
                });
            }
        } catch {
            toast.error('Failed to load programs');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const patchProgram = async (path: 'welcome' | 'first-order' | 'referral', body: Record<string, unknown>) => {
        setSaving(path);
        try {
            const res = await fetch(`/api/v1/admin/promotions/programs/${path}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error?.message || 'Save failed');
            toast.success('Program saved');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(null);
        }
    };

    const saveWelcome = () => {
        const value = welcome.rewardType === 'free_delivery' ? 1 : num(welcome.rewardValue);
        if (!value) {
            toast.error('Enter a reward value');
            return;
        }
        return patchProgram('welcome', {
            isActive: welcome.isActive,
            rewardType: welcome.rewardType,
            rewardValue: value,
            minOrderValue: num(welcome.minOrderValue) ?? null,
            validDays: num(welcome.validDays) ?? null,
            maxDiscount: num(welcome.maxDiscount) ?? null,
        });
    };

    const saveFirst = () => {
        const value = num(first.rewardValue);
        if (!value) {
            toast.error('Enter a reward value');
            return;
        }
        return patchProgram('first-order', {
            isActive: first.isActive,
            rewardType: first.rewardType,
            rewardValue: value,
            minOrderValue: num(first.minOrderValue) ?? null,
            validDays: num(first.validDays) ?? null,
            maxDiscount: num(first.maxDiscount) ?? null,
        });
    };

    const saveReferral = () => {
        const referrerValue = num(referral.referrerRewardValue);
        const referredValue = num(referral.referredRewardValue);
        if (!referrerValue || !referredValue) {
            toast.error('Enter referrer and referred reward values');
            return;
        }
        if (referral.trigger === 'first_order_mov' && !num(referral.minOrderValue)) {
            toast.error('MOV is required when the trigger is first order above MOV');
            return;
        }
        return patchProgram('referral', {
            isActive: referral.isActive,
            trigger: referral.trigger,
            minOrderValue: num(referral.minOrderValue) ?? null,
            referrerRewardType: referral.referrerRewardType,
            referrerRewardValue: referrerValue,
            referrerMaxDiscount: num(referral.referrerMaxDiscount) ?? null,
            referrerValidDays: num(referral.referrerValidDays) ?? null,
            referredRewardType: referral.referredRewardType,
            referredRewardValue: referredValue,
            referredMaxDiscount: num(referral.referredMaxDiscount) ?? null,
            referredValidDays: num(referral.referredValidDays) ?? null,
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={28} className="text-[#6B1D2E] animate-spin" />
            </div>
        );
    }

    return (
        <div className="grid gap-4 lg:grid-cols-1">
            <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <h2 className="text-[15px] font-bold text-[#181725]">Welcome offer</h2>
                        <p className="text-[12px] text-gray-400 font-medium">Issued once at registration — not after profile completion.</p>
                    </div>
                    <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600 cursor-pointer shrink-0">
                        <input type="checkbox" className="accent-[#6B1D2E]" checked={welcome.isActive} onChange={(e) => setWelcome((f) => ({ ...f, isActive: e.target.checked }))} />
                        Active
                    </label>
                </div>
                <RewardFields form={welcome} types={WELCOME_TYPES} set={(patch) => setWelcome((f) => ({
                    ...f,
                    ...(patch.rewardType !== undefined && { rewardType: patch.rewardType as WelcomeReward }),
                    ...(patch.rewardValue !== undefined && { rewardValue: patch.rewardValue }),
                    ...(patch.minOrderValue !== undefined && { minOrderValue: patch.minOrderValue }),
                    ...(patch.validDays !== undefined && { validDays: patch.validDays }),
                    ...(patch.maxDiscount !== undefined && { maxDiscount: patch.maxDiscount }),
                }))} />
                <button
                    onClick={saveWelcome}
                    disabled={saving === 'welcome'}
                    className="mt-4 px-4 py-2 rounded-xl bg-[#6B1D2E] text-white text-[12px] font-bold hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
                >
                    {saving === 'welcome' ? <Loader2 size={14} className="animate-spin" /> : 'Save welcome offer'}
                </button>
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <h2 className="text-[15px] font-bold text-[#181725]">First order offer</h2>
                        <p className="text-[12px] text-gray-400 font-medium">Eligible when the customer has zero prior successful orders (paid, or COD confirmed+).</p>
                    </div>
                    <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600 cursor-pointer shrink-0">
                        <input type="checkbox" className="accent-[#6B1D2E]" checked={first.isActive} onChange={(e) => setFirst((f) => ({ ...f, isActive: e.target.checked }))} />
                        Active
                    </label>
                </div>
                <RewardFields form={first} types={SIDE_TYPES} set={(patch) => setFirst((f) => ({
                    ...f,
                    ...(patch.rewardType !== undefined && { rewardType: patch.rewardType as SideReward }),
                    ...(patch.rewardValue !== undefined && { rewardValue: patch.rewardValue }),
                    ...(patch.minOrderValue !== undefined && { minOrderValue: patch.minOrderValue }),
                    ...(patch.validDays !== undefined && { validDays: patch.validDays }),
                    ...(patch.maxDiscount !== undefined && { maxDiscount: patch.maxDiscount }),
                }))} />
                <button
                    onClick={saveFirst}
                    disabled={saving === 'first-order'}
                    className="mt-4 px-4 py-2 rounded-xl bg-[#6B1D2E] text-white text-[12px] font-bold hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
                >
                    {saving === 'first-order' ? <Loader2 size={14} className="animate-spin" /> : 'Save first order offer'}
                </button>
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <h2 className="text-[15px] font-bold text-[#181725]">Referral program</h2>
                        <p className="text-[12px] text-gray-400 font-medium">Unique <span className="font-mono">/invite/</span> links. <span className="font-mono">/r/</span> stays return pickup.</p>
                    </div>
                    <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600 cursor-pointer shrink-0">
                        <input type="checkbox" className="accent-[#6B1D2E]" checked={referral.isActive} onChange={(e) => setReferral((f) => ({ ...f, isActive: e.target.checked }))} />
                        Active
                    </label>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label className={labelCls}>Reward trigger</label>
                        <select className={inputCls} value={referral.trigger} onChange={(e) => setReferral((f) => ({ ...f, trigger: e.target.value as ReferralTrigger }))}>
                            <option value="signup">On signup</option>
                            <option value="first_order">On first successful order</option>
                            <option value="first_order_mov">On first order above MOV</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>{referral.trigger === 'first_order_mov' ? 'MOV (₹) *' : 'MOV (₹)'}</label>
                        <input className={inputCls} type="number" min="0" value={referral.minOrderValue} onChange={(e) => setReferral((f) => ({ ...f, minOrderValue: e.target.value }))} />
                    </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                    <div className={cn('rounded-xl border border-gray-100 p-4', 'bg-gray-50/40')}>
                        <h3 className="text-[12px] font-bold text-[#181725] mb-3">Referrer reward</h3>
                        <RewardFields
                            hideMinOrder
                            form={{
                                rewardType: referral.referrerRewardType,
                                rewardValue: referral.referrerRewardValue,
                                minOrderValue: '',
                                validDays: referral.referrerValidDays,
                                maxDiscount: referral.referrerMaxDiscount,
                            }}
                            types={SIDE_TYPES}
                            set={(patch) => setReferral((f) => ({
                                ...f,
                                ...(patch.rewardType !== undefined && { referrerRewardType: patch.rewardType as SideReward }),
                                ...(patch.rewardValue !== undefined && { referrerRewardValue: patch.rewardValue }),
                                ...(patch.validDays !== undefined && { referrerValidDays: patch.validDays }),
                                ...(patch.maxDiscount !== undefined && { referrerMaxDiscount: patch.maxDiscount }),
                            }))}
                        />
                    </div>
                    <div className="rounded-xl border border-gray-100 p-4 bg-gray-50/40">
                        <h3 className="text-[12px] font-bold text-[#181725] mb-3">Referred reward</h3>
                        <RewardFields
                            hideMinOrder
                            form={{
                                rewardType: referral.referredRewardType,
                                rewardValue: referral.referredRewardValue,
                                minOrderValue: '',
                                validDays: referral.referredValidDays,
                                maxDiscount: referral.referredMaxDiscount,
                            }}
                            types={SIDE_TYPES}
                            set={(patch) => setReferral((f) => ({
                                ...f,
                                ...(patch.rewardType !== undefined && { referredRewardType: patch.rewardType as SideReward }),
                                ...(patch.rewardValue !== undefined && { referredRewardValue: patch.rewardValue }),
                                ...(patch.validDays !== undefined && { referredValidDays: patch.validDays }),
                                ...(patch.maxDiscount !== undefined && { referredMaxDiscount: patch.maxDiscount }),
                            }))}
                        />
                    </div>
                </div>
                <button
                    onClick={saveReferral}
                    disabled={saving === 'referral'}
                    className="mt-4 px-4 py-2 rounded-xl bg-[#6B1D2E] text-white text-[12px] font-bold hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
                >
                    {saving === 'referral' ? <Loader2 size={14} className="animate-spin" /> : 'Save referral program'}
                </button>
            </section>
        </div>
    );
}
