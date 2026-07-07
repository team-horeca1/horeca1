'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Settings, Bell, Building2, User, Save, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlatformFeeCalculator } from '@/components/features/vendor/finance/EarningsBreakdown';

export default function SettingsPage() {
    const { data: session } = useSession();

    // General Settings
    const [platformName, setPlatformName] = useState('HoReCa1');
    const [contactEmail, setContactEmail] = useState('support@horeca1.com');
    const [supportPhone, setSupportPhone] = useState('+91 98765 43210');

    // Business Settings
    const [platformFeePct, setPlatformFeePct] = useState('10');
    const [minOrderValue, setMinOrderValue] = useState('500');
    const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState('2000');

    // Notification Preferences
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [smsNotifications, setSmsNotifications] = useState(true);
    const [pushNotifications, setPushNotifications] = useState(false);

    // Toast state
    const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Load the saved platform settings on mount
    useEffect(() => {
        fetch('/api/v1/admin/settings', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
                const d = json?.data;
                if (!d) return;
                setPlatformName(d.platformName ?? '');
                setContactEmail(d.contactEmail ?? '');
                setSupportPhone(d.supportPhone ?? '');
                setPlatformFeePct(String(d.defaultCommissionPct ?? ''));
                setMinOrderValue(String(d.minOrderValue ?? ''));
                setFreeDeliveryThreshold(String(d.freeDeliveryThreshold ?? ''));
                setEmailNotifications(!!d.emailNotifications);
                setSmsNotifications(!!d.smsNotifications);
                setPushNotifications(!!d.pushNotifications);
            })
            .catch(() => { /* keep defaults if the fetch fails */ });
    }, []);

    const patchSettings = async (payload: Record<string, unknown>, successMsg: string) => {
        try {
            const res = await fetch('/api/v1/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('save failed');
            showToast(successMsg, 'success');
        } catch {
            showToast('Could not save — please try again', 'error');
        }
    };

    const handleSaveGeneral = () =>
        patchSettings({ platformName, contactEmail, supportPhone }, 'General settings saved');

    const handleSaveBusiness = () =>
        patchSettings(
            {
                defaultCommissionPct: Number(platformFeePct) || 0,
                minOrderValue: Number(minOrderValue) || 0,
                freeDeliveryThreshold: Number(freeDeliveryThreshold) || 0,
            },
            'Business settings saved',
        );

    const handleSaveNotifications = () =>
        patchSettings({ emailNotifications, smsNotifications, pushNotifications }, 'Notification preferences saved');

    return (
        <div className="max-w-[960px] space-y-8 pb-12">
            {/* Page Header */}
            <div>
                <h1 className="text-[26px] font-medium text-[#000000]">Settings</h1>
                <p className="text-[#000000] text-[12px] font-light">Manage your platform configuration</p>
            </div>

            {/* General Settings */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm">
                <div className="flex items-center gap-3 px-8 py-6 border-b border-[#EEEEEE]">
                    <div className="w-11 h-11 rounded-lg bg-green-50 text-[#299E60] flex items-center justify-center shrink-0">
                        <Settings size={22} />
                    </div>
                    <div>
                        <h2 className="text-[18px] font-bold text-[#181725]">General Settings</h2>
                        <p className="text-[12px] text-[#7C7C7C] font-medium">Basic platform information</p>
                    </div>
                </div>

                <div className="px-8 py-6 space-y-5">
                    <div>
                        <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Platform Name</label>
                        <input
                            type="text"
                            value={platformName}
                            onChange={(e) => setPlatformName(e.target.value)}
                            className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725] outline-none focus:border-[#299E60]/40 focus:bg-white transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Contact Email</label>
                        <input
                            type="email"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725] outline-none focus:border-[#299E60]/40 focus:bg-white transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Support Phone</label>
                        <input
                            type="tel"
                            value={supportPhone}
                            onChange={(e) => setSupportPhone(e.target.value)}
                            className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725] outline-none focus:border-[#299E60]/40 focus:bg-white transition-all"
                        />
                    </div>
                </div>

                <div className="px-8 py-5 border-t border-[#EEEEEE] flex justify-end">
                    <button
                        onClick={handleSaveGeneral}
                        className="flex items-center gap-2 h-[42px] px-6 bg-[#299E60] text-white rounded-[10px] text-[14px] font-bold hover:bg-[#238a54] transition-colors shadow-sm shadow-[#299E60]/20"
                    >
                        <Save size={16} />
                        Save Changes
                    </button>
                </div>
            </div>

            {/* Business Settings */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm">
                <div className="flex items-center gap-3 px-8 py-6 border-b border-[#EEEEEE]">
                    <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Building2 size={22} />
                    </div>
                    <div>
                        <h2 className="text-[18px] font-bold text-[#181725]">Business Settings</h2>
                        <p className="text-[12px] text-[#7C7C7C] font-medium">Platform fee and order thresholds</p>
                    </div>
                </div>

                <div className="px-8 py-6 space-y-5">
                    <div>
                        <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Default Platform Fee (%)</label>
                        <input
                            type="number"
                            min="0"
                            max="25"
                            step="0.5"
                            value={platformFeePct}
                            onChange={(e) => setPlatformFeePct(e.target.value)}
                            className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725] outline-none focus:border-[#299E60]/40 focus:bg-white transition-all"
                        />
                        <p className="text-[11px] text-[#AEAEAE] mt-1.5">
                            Deducted from vendor earnings on each delivered order. Override per vendor on their detail page.
                        </p>
                        <PlatformFeeCalculator pct={Number(platformFeePct) || 10} />
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Minimum Order Value (&#8377;)</label>
                        <input
                            type="number"
                            min="0"
                            value={minOrderValue}
                            onChange={(e) => setMinOrderValue(e.target.value)}
                            className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725] outline-none focus:border-[#299E60]/40 focus:bg-white transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Free Delivery Threshold (&#8377;)</label>
                        <input
                            type="number"
                            min="0"
                            value={freeDeliveryThreshold}
                            onChange={(e) => setFreeDeliveryThreshold(e.target.value)}
                            className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725] outline-none focus:border-[#299E60]/40 focus:bg-white transition-all"
                        />
                    </div>
                </div>

                <div className="px-8 py-5 border-t border-[#EEEEEE] flex justify-end">
                    <button
                        onClick={handleSaveBusiness}
                        className="flex items-center gap-2 h-[42px] px-6 bg-[#299E60] text-white rounded-[10px] text-[14px] font-bold hover:bg-[#238a54] transition-colors shadow-sm shadow-[#299E60]/20"
                    >
                        <Save size={16} />
                        Save Changes
                    </button>
                </div>
            </div>

            {/* Notification Preferences */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm">
                <div className="flex items-center gap-3 px-8 py-6 border-b border-[#EEEEEE]">
                    <div className="w-11 h-11 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center shrink-0">
                        <Bell size={22} />
                    </div>
                    <div>
                        <h2 className="text-[18px] font-bold text-[#181725]">Notification Preferences</h2>
                        <p className="text-[12px] text-[#7C7C7C] font-medium">Control how you receive alerts</p>
                    </div>
                </div>

                <div className="px-8 py-6 space-y-4">
                    {/* Email Notifications */}
                    <div className="flex items-center justify-between py-3 border-b border-[#F5F5F5] last:border-b-0">
                        <div>
                            <p className="text-[14px] font-bold text-[#181725]">Email Notifications</p>
                            <p className="text-[12px] text-[#7C7C7C] font-medium">Receive order updates and alerts via email</p>
                        </div>
                        <button
                            onClick={() => setEmailNotifications(!emailNotifications)}
                            className={cn(
                                "relative w-[52px] h-[28px] rounded-full transition-colors duration-200 shrink-0",
                                emailNotifications ? "bg-[#299E60]" : "bg-[#D9D9D9]"
                            )}
                        >
                            <span className={cn(
                                "absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-transform duration-200",
                                emailNotifications ? "translate-x-[27px]" : "translate-x-[3px]"
                            )} />
                        </button>
                    </div>

                    {/* SMS Notifications */}
                    <div className="flex items-center justify-between py-3 border-b border-[#F5F5F5] last:border-b-0">
                        <div>
                            <p className="text-[14px] font-bold text-[#181725]">SMS Notifications</p>
                            <p className="text-[12px] text-[#7C7C7C] font-medium">Get critical alerts via text message</p>
                        </div>
                        <button
                            onClick={() => setSmsNotifications(!smsNotifications)}
                            className={cn(
                                "relative w-[52px] h-[28px] rounded-full transition-colors duration-200 shrink-0",
                                smsNotifications ? "bg-[#299E60]" : "bg-[#D9D9D9]"
                            )}
                        >
                            <span className={cn(
                                "absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-transform duration-200",
                                smsNotifications ? "translate-x-[27px]" : "translate-x-[3px]"
                            )} />
                        </button>
                    </div>

                    {/* Push Notifications */}
                    <div className="flex items-center justify-between py-3">
                        <div>
                            <p className="text-[14px] font-bold text-[#181725]">Push Notifications</p>
                            <p className="text-[12px] text-[#7C7C7C] font-medium">Browser push notifications for real-time updates</p>
                        </div>
                        <button
                            onClick={() => setPushNotifications(!pushNotifications)}
                            className={cn(
                                "relative w-[52px] h-[28px] rounded-full transition-colors duration-200 shrink-0",
                                pushNotifications ? "bg-[#299E60]" : "bg-[#D9D9D9]"
                            )}
                        >
                            <span className={cn(
                                "absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-transform duration-200",
                                pushNotifications ? "translate-x-[27px]" : "translate-x-[3px]"
                            )} />
                        </button>
                    </div>
                </div>

                <div className="px-8 py-5 border-t border-[#EEEEEE] flex justify-end">
                    <button
                        onClick={handleSaveNotifications}
                        className="flex items-center gap-2 h-[42px] px-6 bg-[#299E60] text-white rounded-[10px] text-[14px] font-bold hover:bg-[#238a54] transition-colors shadow-sm shadow-[#299E60]/20"
                    >
                        <Save size={16} />
                        Save Changes
                    </button>
                </div>
            </div>

            {/* Account */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm">
                <div className="flex items-center gap-3 px-8 py-6 border-b border-[#EEEEEE]">
                    <div className="w-11 h-11 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
                        <User size={22} />
                    </div>
                    <div>
                        <h2 className="text-[18px] font-bold text-[#181725]">Account</h2>
                        <p className="text-[12px] text-[#7C7C7C] font-medium">Your admin account details</p>
                    </div>
                </div>

                <div className="px-8 py-6 space-y-5">
                    <div>
                        <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Name</label>
                        <div className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725]">
                            {session?.user?.name || 'Admin'}
                        </div>
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Email</label>
                        <div className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725]">
                            {session?.user?.email || 'admin@horeca1.com'}
                        </div>
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Role</label>
                        <div className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725] capitalize">
                            {(session?.user as { role?: string })?.role || 'admin'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Toast Notification */}
            {toast && (
                <div className="fixed bottom-10 right-10 z-[100] animate-in slide-in-from-bottom-5 duration-300">
                    <div className="bg-[#181725] text-white px-6 py-4 rounded-[16px] shadow-2xl flex items-center gap-3 border border-white/10">
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", toast.type === 'error' ? "bg-red-500" : "bg-[#299E60]")}>
                            {toast.type === 'error' ? <AlertCircle size={18} className="text-white" /> : <Check size={18} className="text-white" />}
                        </div>
                        <p className="text-[14px] font-bold">{toast.message}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
