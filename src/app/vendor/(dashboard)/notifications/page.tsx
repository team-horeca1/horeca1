'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Loader2, CheckCheck, AlertCircle, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
    handleVendorNotificationClick,
    vendorNotificationAccent,
    getVendorNotificationHref,
} from '@/components/features/vendor/VendorNotificationBell';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorNotification {
    id: string;
    type: string;
    title: string | null;
    body: string | null;
    status: string;
    readAt: string | null;
    createdAt: string;
    referenceId: string | null;
    referenceType: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTIF_EVENTS: { key: string; label: string }[] = [
    { key: 'new_order',        label: 'New Order' },
    { key: 'sla_breach',       label: 'Order SLA Breach' },
    { key: 'payment_received', label: 'Payment Received' },
    { key: 'overdue_alert',    label: 'Overdue Alert' },
    { key: 'low_stock',        label: 'Low Stock' },
    { key: 'delivery_delayed', label: 'Delivery Delayed' },
    { key: 'return_request',   label: 'Return Request' },
    { key: 'settlement',       label: 'Settlement' },
];

const CHANNELS: { key: string; label: string }[] = [
    { key: 'push',      label: 'App Push' },
    { key: 'sms',       label: 'SMS' },
    { key: 'email',     label: 'Email' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeColor(title: string | null, type: string) {
    return vendorNotificationAccent(title, type);
}

function relativeTime(isoStr: string) {
    const diff = Date.now() - new Date(isoStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return new Date(isoStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function VendorNotificationsPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'feed' | 'preferences'>('feed');

    // Feed state
    const [notifications, setNotifications] = useState<VendorNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [markingRead, setMarkingRead] = useState(false);

    // Preferences state
    const [notifPrefs, setNotifPrefs] = useState<Record<string, string[]>>({});
    const [prefsSaving, setPrefsSaving] = useState(false);
    const [prefsLoading, setPrefsLoading] = useState(true);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/vendor/notifications');
            const json = await res.json();
            if (json.success) {
                setNotifications(json.data.notifications);
                setUnreadCount(json.data.unreadCount);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchPreferences = useCallback(async () => {
        setPrefsLoading(true);
        try {
            const res = await fetch('/api/v1/vendor/settings');
            const json = await res.json();
            if (json.success && json.data.notificationPrefs && typeof json.data.notificationPrefs === 'object') {
                const prefs = json.data.notificationPrefs as Record<string, unknown>;
                const parsed: Record<string, string[]> = {};
                for (const [k, v] of Object.entries(prefs)) {
                    if (Array.isArray(v)) {
                        parsed[k] = v.filter((c): c is string => typeof c === 'string');
                    }
                }
                setNotifPrefs(parsed);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setPrefsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        fetchPreferences();
    }, [fetchNotifications, fetchPreferences]);

    const markAllRead = async () => {
        if (unreadCount === 0) return;
        setMarkingRead(true);
        try {
            await fetch('/api/v1/vendor/notifications', { method: 'PATCH' });
            setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
            setUnreadCount(0);
        } catch (err) {
            console.error(err);
        } finally {
            setMarkingRead(false);
        }
    };

    function togglePref(event: string, channel: string) {
        setNotifPrefs(prev => {
            const current = prev[event] ?? [];
            const updated = current.includes(channel)
                ? current.filter(c => c !== channel)
                : [...current, channel];
            return { ...prev, [event]: updated };
        });
    }

    const savePreferences = async () => {
        setPrefsSaving(true);
        try {
            const res = await fetch('/api/v1/vendor/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationPrefs: notifPrefs }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Save failed');
            toast.success('Notification preferences saved');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setPrefsSaving(false);
        }
    };

    const onNotificationClick = async (n: VendorNotification) => {
        if (!n.readAt) {
            setNotifications((prev) =>
                prev.map((item) =>
                    item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item
                )
            );
            setUnreadCount((c) => Math.max(0, c - 1));
        }
        await handleVendorNotificationClick(n, router);
    };

    return (
        <div className="space-y-5 pb-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[24px] font-bold text-[#181725]">Notifications</h1>
                    <p className="text-[12px] text-[#AEAEAE]">
                        {activeTab === 'feed'
                            ? (unreadCount > 0 ? `${unreadCount} unread` : 'All caught up')
                            : 'Choose which events notify you and how'}
                    </p>
                </div>
                {activeTab === 'feed' && unreadCount > 0 && (
                    <button
                        onClick={markAllRead}
                        disabled={markingRead}
                        className="h-[36px] px-4 rounded-[10px] border border-[#EEEEEE] bg-white text-[12px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {markingRead ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                        Mark all read
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex items-center border-b border-[#EEEEEE] gap-6">
                {(['feed', 'preferences'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            'pb-3 text-[14px] font-bold transition-colors capitalize border-b-2 -mb-px',
                            activeTab === tab
                                ? 'text-orange-500 border-orange-500'
                                : 'text-[#7C7C7C] border-transparent hover:text-[#181725]'
                        )}
                    >
                        {tab === 'feed' ? 'Notification Feed' : 'Preferences'}
                    </button>
                ))}
            </div>

            {/* Feed tab */}
            {activeTab === 'feed' && (
                <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="animate-spin text-[#299E60]" size={28} />
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="py-16 text-center">
                            <Bell size={36} className="text-[#E5E7EB] mx-auto mb-3" />
                            <p className="text-[14px] font-bold text-[#AEAEAE]">No notifications yet</p>
                            <p className="text-[12px] text-[#AEAEAE] mt-1">Order events, low-stock alerts, and payment updates will appear here</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-[#F5F5F5]">
                            {notifications.map(n => {
                                const href = getVendorNotificationHref(n);
                                return (
                                <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => void onNotificationClick(n)}
                                    disabled={!href}
                                    className={cn(
                                        'w-full text-left flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[#FAFAFA]',
                                        !n.readAt && 'bg-blue-50/20',
                                        !href && 'cursor-default'
                                    )}
                                >
                                    <div className={cn('mt-0.5 w-8 h-8 rounded-[8px] shrink-0 flex items-center justify-center text-[10px] font-bold uppercase', typeColor(n.title, n.type))}>
                                        {(n.title ?? n.type).slice(0, 2)}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-3">
                                            <p className={cn('text-[13px] leading-snug', n.readAt ? 'text-[#7C7C7C]' : 'font-bold text-[#181725]')}>
                                                {n.title ?? n.type}
                                            </p>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {!n.readAt && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                                                <span className="text-[11px] text-[#AEAEAE]">{relativeTime(n.createdAt)}</span>
                                            </div>
                                        </div>
                                        {n.body && (
                                            <p className="text-[12px] text-[#AEAEAE] mt-0.5 line-clamp-2">{n.body}</p>
                                        )}
                                        {href && (
                                            <p className="text-[11px] font-bold text-[#299E60] mt-1">Open product</p>
                                        )}
                                        {n.status === 'failed' && (
                                            <div className="flex items-center gap-1 mt-1">
                                                <AlertCircle size={11} className="text-[#E74C3C]" />
                                                <span className="text-[10px] text-[#E74C3C] font-bold">Delivery failed</span>
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );})}
                        </div>
                    )}
                </div>
            )}

            {/* Preferences tab */}
            {activeTab === 'preferences' && (
                <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                    {prefsLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="animate-spin text-[#299E60]" size={28} />
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[520px]">
                                    <thead>
                                        <tr className="border-b border-[#EEEEEE]">
                                            <th className="text-left px-6 py-4 text-[12px] font-bold text-[#7C7C7C] w-[40%]">Event</th>
                                            {CHANNELS.map(ch => (
                                                <th key={ch.key} className="px-4 py-4 text-[12px] font-bold text-[#7C7C7C] text-center">{ch.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#F5F5F5]">
                                        {NOTIF_EVENTS.map(ev => (
                                            <tr key={ev.key} className="hover:bg-[#FAFAFA] transition-colors">
                                                <td className="px-6 py-4 text-[13px] font-bold text-[#181725]">{ev.label}</td>
                                                {CHANNELS.map(ch => {
                                                    const checked = notifPrefs[ev.key]?.includes(ch.key) ?? false;
                                                    return (
                                                        <td key={ch.key} className="px-4 py-4 text-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => togglePref(ev.key, ch.key)}
                                                                className="w-[16px] h-[16px] accent-orange-500 cursor-pointer rounded"
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-6 py-4 border-t border-[#EEEEEE] flex items-center gap-3">
                                <button
                                    onClick={savePreferences}
                                    disabled={prefsSaving}
                                    className="h-[40px] px-6 bg-orange-500 text-white rounded-[10px] text-[13px] font-bold hover:bg-orange-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {prefsSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                    {prefsSaving ? 'Saving...' : 'Save Preferences'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
