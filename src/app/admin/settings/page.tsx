'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Settings,
  Bell,
  Building2,
  User,
  Save,
  Check,
  AlertCircle,
  X,
  Truck,
  CalendarDays,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlatformFeeCalculator } from '@/components/features/vendor/finance/EarningsBreakdown';
import { DEFAULT_GST_SLABS, normalizeGstSlabs } from '@/lib/constants/gstSlabs';
import { formatCutoffDisplay } from '@/lib/deliveryPlanMessage';

type SettingsTab = 'general' | 'business' | 'delivery' | 'notifications' | 'account';

const SETTINGS_NAV: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'business', label: 'Business' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'account', label: 'Account' },
];

const DAY_KEYS = [
  { key: 'defaultDeliversMon', label: 'Mon' },
  { key: 'defaultDeliversTue', label: 'Tue' },
  { key: 'defaultDeliversWed', label: 'Wed' },
  { key: 'defaultDeliversThu', label: 'Thu' },
  { key: 'defaultDeliversFri', label: 'Fri' },
  { key: 'defaultDeliversSat', label: 'Sat' },
  { key: 'defaultDeliversSun', label: 'Sun' },
] as const;

function parseSettingsTab(raw: string | null): SettingsTab {
  if (raw && SETTINGS_NAV.some((t) => t.id === raw)) return raw as SettingsTab;
  return 'general';
}

function AdminSettingsInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseSettingsTab(searchParams.get('tab'));

  const setTab = (tab: SettingsTab) => {
    const next = new URLSearchParams(searchParams.toString());
    if (tab === 'general') next.delete('tab');
    else next.set('tab', tab);
    const q = next.toString();
    router.replace(q ? `/admin/settings?${q}` : '/admin/settings', { scroll: false });
  };

  const [platformName, setPlatformName] = useState('Horeca1');
  const [contactEmail, setContactEmail] = useState('support@horeca1.com');
  const [supportPhone, setSupportPhone] = useState('+91 98765 43210');
  const [platformFeePct, setPlatformFeePct] = useState('5');
  const [minOrderValue, setMinOrderValue] = useState('500');
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState('2000');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [gstSlabs, setGstSlabs] = useState<number[]>([...DEFAULT_GST_SLABS]);
  const [gstDraft, setGstDraft] = useState('');
  const [deliveryDefaults, setDeliveryDefaults] = useState({
    defaultDeliversMon: true,
    defaultDeliversTue: false,
    defaultDeliversWed: true,
    defaultDeliversThu: false,
    defaultDeliversFri: true,
    defaultDeliversSat: false,
    defaultDeliversSun: false,
    defaultCutoffTime: '16:00',
  });
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' } | null>(
    null,
  );

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(null), 3000);
  };

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
        if (Array.isArray(d.gstSlabs)) setGstSlabs(normalizeGstSlabs(d.gstSlabs));
        setDeliveryDefaults({
          defaultDeliversMon: !!d.defaultDeliversMon,
          defaultDeliversTue: !!d.defaultDeliversTue,
          defaultDeliversWed: !!d.defaultDeliversWed,
          defaultDeliversThu: !!d.defaultDeliversThu,
          defaultDeliversFri: !!d.defaultDeliversFri,
          defaultDeliversSat: !!d.defaultDeliversSat,
          defaultDeliversSun: !!d.defaultDeliversSun,
          defaultCutoffTime: typeof d.defaultCutoffTime === 'string' ? d.defaultCutoffTime : '16:00',
        });
      })
      .catch(() => {
        /* keep defaults */
      });
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

  const defaultDaysLabel = DAY_KEYS.filter(({ key }) => deliveryDefaults[key])
    .map(({ label }) => label)
    .join(' · ') || 'None';

  return (
    <div className="max-w-[960px] space-y-6 pb-12">
      <div>
        <h1 className="text-[clamp(1.25rem,4vw,1.625rem)] font-semibold text-[#000000]">Settings</h1>
        <p className="text-[#667085] text-[13px] font-medium">Manage your platform configuration</p>
      </div>

      <div
        className="flex flex-wrap gap-1 p-1 rounded-[12px] bg-[#F5F5F5] border border-[#EEEEEE]"
        role="tablist"
        aria-label="Settings sections"
      >
        {SETTINGS_NAV.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setTab(tab.id)}
            className={cn(
              'h-10 px-3.5 rounded-[10px] text-[12px] font-bold transition-colors',
              activeTab === tab.id
                ? 'bg-white text-[#6B1D2E] shadow-sm border border-[#E9E3DD]'
                : 'text-[#667085] hover:text-[#181725]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm">
          <div className="flex items-center gap-3 px-4 lg:px-8 py-5 lg:py-6 border-b border-[#EEEEEE]">
            <div className="w-11 h-11 rounded-lg bg-[#F8E8EC] text-[#6B1D2E] flex items-center justify-center shrink-0">
              <Settings size={22} />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-[#181725]">General Settings</h2>
              <p className="text-[12px] text-[#7C7C7C] font-medium">Basic platform information</p>
            </div>
          </div>
          <div className="px-4 lg:px-8 py-5 lg:py-6 space-y-5">
            <div>
              <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Platform Name</label>
              <input
                type="text"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725] outline-none focus:border-[#6B1D2E]/40 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Contact Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725] outline-none focus:border-[#6B1D2E]/40 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Support Phone</label>
              <input
                type="tel"
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium text-[#181725] outline-none focus:border-[#6B1D2E]/40 focus:bg-white transition-all"
              />
            </div>
          </div>
          <div className="px-4 lg:px-8 py-5 border-t border-[#EEEEEE] flex justify-end">
            <button
              type="button"
              onClick={() =>
                patchSettings({ platformName, contactEmail, supportPhone }, 'General settings saved')
              }
              className="flex items-center justify-center gap-2 min-h-12 w-full sm:w-auto px-6 bg-[#6B1D2E] text-white rounded-[12px] text-[14px] font-semibold hover:bg-[#5A1926]"
            >
              <Save size={16} /> Save Changes
            </button>
          </div>
        </div>
      )}

      {activeTab === 'business' && (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm">
          <div className="flex items-center gap-3 px-4 lg:px-8 py-5 lg:py-6 border-b border-[#EEEEEE]">
            <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Building2 size={22} />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-[#181725]">Business Settings</h2>
              <p className="text-[12px] text-[#7C7C7C] font-medium">Fees, thresholds and tax slabs</p>
            </div>
          </div>
          <div className="px-4 lg:px-8 py-5 lg:py-6 space-y-5">
            <div>
              <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">
                Platform commission (%)
              </label>
              <input
                type="number"
                value={platformFeePct}
                onChange={(e) => setPlatformFeePct(e.target.value)}
                className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
              />
              <PlatformFeeCalculator pct={Number(platformFeePct) || 0} />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">
                Default minimum order value (₹)
              </label>
              <input
                type="number"
                value={minOrderValue}
                onChange={(e) => setMinOrderValue(e.target.value)}
                className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">
                Free delivery threshold (₹)
              </label>
              <input
                type="number"
                value={freeDeliveryThreshold}
                onChange={(e) => setFreeDeliveryThreshold(e.target.value)}
                className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#4B4B4B] mb-2">GST slabs (%)</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {gstSlabs.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] bg-[#FAF7F2] border border-[#E9E3DD] text-[13px] font-bold"
                  >
                    {n}%
                    <button
                      type="button"
                      onClick={() => setGstSlabs((prev) => normalizeGstSlabs(prev.filter((x) => x !== n)))}
                      className="text-[#AEAEAE] hover:text-[#DC2626]"
                      aria-label={`Remove ${n}% GST slab`}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={gstDraft}
                  onChange={(e) => setGstDraft(e.target.value)}
                  placeholder="Add slab"
                  className="flex-1 h-11 bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px] outline-none focus:border-[#6B1D2E]/40"
                />
                <button
                  type="button"
                  onClick={() => {
                    const n = Number(gstDraft);
                    if (!Number.isFinite(n) || n < 0 || n > 100) return;
                    setGstSlabs((prev) => normalizeGstSlabs([...prev, n]));
                    setGstDraft('');
                  }}
                  className="h-11 px-4 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
          <div className="px-4 lg:px-8 py-5 border-t border-[#EEEEEE] flex justify-end">
            <button
              type="button"
              onClick={() =>
                patchSettings(
                  {
                    defaultCommissionPct: Number(platformFeePct) || 0,
                    minOrderValue: Number(minOrderValue) || 0,
                    freeDeliveryThreshold: Number(freeDeliveryThreshold) || 0,
                    gstSlabs: normalizeGstSlabs(gstSlabs),
                  },
                  'Business settings saved',
                )
              }
              className="flex items-center justify-center gap-2 min-h-12 w-full sm:w-auto px-6 bg-[#6B1D2E] text-white rounded-[12px] text-[14px] font-semibold hover:bg-[#5A1926]"
            >
              <Save size={16} /> Save Changes
            </button>
          </div>
        </div>
      )}

      {activeTab === 'delivery' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-[18px] font-bold text-[#181725]">Delivery</h2>
            <p className="text-[13px] text-[#667085] mt-1 leading-relaxed max-w-[40rem]">
              Platform defaults for new supplier pincodes, and holidays that shape customer delivery dates.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-[14px] border border-[#6B1D2E]/25 bg-[#F8E8EC]/40 p-4 flex gap-3">
              <div className="w-10 h-10 rounded-[10px] bg-[#F8E8EC] text-[#6B1D2E] flex items-center justify-center shrink-0">
                <Truck size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[#181725]">Delivery Defaults</p>
                <p className="text-[12px] text-[#667085] mt-0.5">
                  {defaultDaysLabel} · cut-off {formatCutoffDisplay(deliveryDefaults.defaultCutoffTime)}
                </p>
                <p className="text-[11px] text-[#6B1D2E] font-semibold mt-2">Editing below</p>
              </div>
            </div>
            <Link
              href="/admin/holidays"
              className="rounded-[14px] border border-[#EEEEEE] bg-white p-4 flex gap-3 hover:border-[#6B1D2E]/30 transition-colors shadow-sm group"
            >
              <div className="w-10 h-10 rounded-[10px] bg-[#FAF7F2] text-[#6B1D2E] flex items-center justify-center shrink-0">
                <CalendarDays size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-[#181725] flex items-center gap-1">
                  Delivery Holidays
                  <ArrowRight
                    size={14}
                    className="opacity-60 group-hover:translate-x-0.5 transition-transform"
                  />
                </p>
                <p className="text-[12px] text-[#667085] mt-0.5 leading-relaxed">
                  Public holidays that suppliers skip unless they enable holiday delivery.
                </p>
                <p className="text-[12px] font-bold text-[#6B1D2E] mt-2">Manage Holidays →</p>
              </div>
            </Link>
          </div>

          <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm" id="delivery-defaults">
            <div className="flex items-center gap-3 px-4 lg:px-8 py-5 lg:py-6 border-b border-[#EEEEEE]">
              <div className="w-11 h-11 rounded-lg bg-[#F8E8EC] text-[#6B1D2E] flex items-center justify-center shrink-0">
                <Truck size={22} />
              </div>
              <div>
                <h3 className="text-[18px] font-bold text-[#181725]">Delivery Defaults</h3>
                <p className="text-[12px] text-[#7C7C7C] font-medium">
                  These defaults are applied when a Supplier adds a new delivery pincode. Suppliers can
                  customize their own schedule.
                </p>
              </div>
            </div>
            <div className="px-4 lg:px-8 py-5 lg:py-6 space-y-6">
              <div>
                <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1">
                  Default delivery days
                </label>
                <p className="text-[11px] text-[#AEAEAE] mb-2.5">
                  Pre-selected when a supplier adds a new pincode
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Default delivery days">
                  {DAY_KEYS.map(({ key, label }) => {
                    const on = deliveryDefaults[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${label} default delivery`}
                        onClick={() =>
                          setDeliveryDefaults((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                        className={cn(
                          'h-11 min-w-[52px] px-3 rounded-[10px] text-[13px] font-bold border inline-flex items-center justify-center gap-1',
                          on
                            ? 'bg-[#6B1D2E] text-white border-[#6B1D2E]'
                            : 'bg-white text-[#667085] border-[#EEEEEE] hover:border-[#6B1D2E]/30',
                        )}
                      >
                        {on ? <Check size={14} aria-hidden /> : null}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label
                  htmlFor="default-cutoff"
                  className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5"
                >
                  Default cut-off time
                </label>
                <input
                  id="default-cutoff"
                  type="time"
                  value={deliveryDefaults.defaultCutoffTime}
                  onChange={(e) =>
                    setDeliveryDefaults((prev) => ({
                      ...prev,
                      defaultCutoffTime: e.target.value || '16:00',
                    }))
                  }
                  className="w-full sm:w-48 bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium outline-none focus:border-[#6B1D2E]/40 focus:bg-white"
                />
                <p className="text-[11px] text-[#AEAEAE] mt-1.5">
                  Currently {formatCutoffDisplay(deliveryDefaults.defaultCutoffTime)}. Orders after this
                  time roll to the next scheduled delivery day.
                </p>
              </div>
              <div className="rounded-[12px] border border-[#E9E3DD] bg-[#FAF7F2] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12px] text-[#667085] leading-relaxed">
                  Platform holidays are automatically skipped unless a supplier has enabled holiday
                  delivery.
                </p>
                <Link
                  href="/admin/holidays"
                  className="inline-flex items-center gap-1 text-[13px] font-bold text-[#6B1D2E] shrink-0"
                >
                  Manage Holidays <ArrowRight size={14} />
                </Link>
              </div>
            </div>
            <div className="px-4 lg:px-8 py-5 border-t border-[#EEEEEE] flex justify-end">
              <button
                type="button"
                onClick={() =>
                  patchSettings({ ...deliveryDefaults }, 'Delivery defaults saved')
                }
                className="flex items-center justify-center gap-2 min-h-12 w-full sm:w-auto px-6 bg-[#6B1D2E] text-white rounded-[12px] text-[14px] font-semibold hover:bg-[#5A1926]"
              >
                <Save size={16} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm">
          <div className="flex items-center gap-3 px-4 lg:px-8 py-5 lg:py-6 border-b border-[#EEEEEE]">
            <div className="w-11 h-11 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center shrink-0">
              <Bell size={22} />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-[#181725]">Notification Preferences</h2>
              <p className="text-[12px] text-[#7C7C7C] font-medium">Control how you receive alerts</p>
            </div>
          </div>
          <div className="px-4 lg:px-8 py-5 lg:py-6 space-y-4">
            {(
              [
                {
                  label: 'Email Notifications',
                  desc: 'Receive order updates and alerts via email',
                  on: emailNotifications,
                  set: setEmailNotifications,
                },
                {
                  label: 'SMS Notifications',
                  desc: 'Get critical alerts via text message',
                  on: smsNotifications,
                  set: setSmsNotifications,
                },
                {
                  label: 'Push Notifications',
                  desc: 'Browser push notifications for real-time updates',
                  on: pushNotifications,
                  set: setPushNotifications,
                },
              ] as const
            ).map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between py-3 border-b border-[#F5F5F5] last:border-b-0"
              >
                <div>
                  <p className="text-[14px] font-bold text-[#181725]">{row.label}</p>
                  <p className="text-[12px] text-[#7C7C7C] font-medium">{row.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.on}
                  aria-label={row.label}
                  onClick={() => row.set(!row.on)}
                  className={cn(
                    'relative w-[52px] h-[28px] rounded-full transition-colors shrink-0',
                    row.on ? 'bg-[#6B1D2E]' : 'bg-[#D9D9D9]',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-transform',
                      row.on ? 'translate-x-[27px]' : 'translate-x-[3px]',
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
          <div className="px-4 lg:px-8 py-5 border-t border-[#EEEEEE] flex justify-end">
            <button
              type="button"
              onClick={() =>
                patchSettings(
                  { emailNotifications, smsNotifications, pushNotifications },
                  'Notification preferences saved',
                )
              }
              className="flex items-center justify-center gap-2 min-h-12 w-full sm:w-auto px-6 bg-[#6B1D2E] text-white rounded-[12px] text-[14px] font-semibold hover:bg-[#5A1926]"
            >
              <Save size={16} /> Save Changes
            </button>
          </div>
        </div>
      )}

      {activeTab === 'account' && (
        <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm">
          <div className="flex items-center gap-3 px-4 lg:px-8 py-5 lg:py-6 border-b border-[#EEEEEE]">
            <div className="w-11 h-11 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
              <User size={22} />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-[#181725]">Account</h2>
              <p className="text-[12px] text-[#7C7C7C] font-medium">Your admin account details</p>
            </div>
          </div>
          <div className="px-4 lg:px-8 py-5 lg:py-6 space-y-5">
            <div>
              <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Name</label>
              <div className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium">
                {session?.user?.name || 'Admin'}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Email</label>
              <div className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium">
                {session?.user?.email || 'admin@horeca1.com'}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#4B4B4B] mb-1.5">Role</label>
              <div className="w-full bg-[#F8F9FB] border border-[#EEEEEE] rounded-[10px] py-3 px-4 text-[14px] font-medium capitalize">
                {(session?.user as { role?: string })?.role || 'admin'}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-10 right-10 z-[100]">
          <div className="bg-[#181725] text-white px-6 py-4 rounded-[16px] shadow-2xl flex items-center gap-3 border border-white/10">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center',
                toast.type === 'error' ? 'bg-red-500' : 'bg-[#6B1D2E]',
              )}
            >
              {toast.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} />}
            </div>
            <p className="text-[14px] font-bold">{toast.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[960px] py-12 text-[13px] text-[#667085]">Loading settings…</div>
      }
    >
      <AdminSettingsInner />
    </Suspense>
  );
}
