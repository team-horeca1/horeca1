'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, ChevronRight, ChevronLeft, Store, Truck, Package, Users, Rocket, Sparkles,
  Warehouse, CreditCard, Wallet, Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ImageUpload } from '@/components/ui/ImageUpload';

type ApiStepKey = 'profile' | 'delivery' | 'products' | 'inventory' | 'credit' | 'payment_modes' | 'team' | 'go_live';

const API_STEPS: ApiStepKey[] = [
  'profile', 'delivery', 'products', 'inventory', 'credit', 'payment_modes', 'team', 'go_live',
];

const STEPS = [
  { key: null as ApiStepKey | null, title: 'Welcome', subtitle: 'Your store is approved and ready to set up', icon: Sparkles, optional: false },
  { key: 'profile' as const, title: 'Store Profile', subtitle: 'Logo, banner and description', icon: Store, optional: false },
  { key: 'delivery' as const, title: 'Delivery Setup', subtitle: 'Service areas and delivery slots', icon: Truck, optional: false },
  { key: 'products' as const, title: 'Add Products', subtitle: 'Upload your catalog', icon: Package, optional: false },
  { key: 'inventory' as const, title: 'Inventory', subtitle: 'Set stock levels for your SKUs', icon: Warehouse, optional: true },
  { key: 'credit' as const, title: 'Credit Rules', subtitle: 'Configure DiSCCO customer credit', icon: CreditCard, optional: true },
  { key: 'payment_modes' as const, title: 'Payment Modes', subtitle: 'COD, prepaid, credit, cheque', icon: Wallet, optional: true },
  { key: 'team' as const, title: 'Invite Team', subtitle: 'Add staff to help run your store', icon: Users, optional: true },
  { key: 'go_live' as const, title: 'Go Live!', subtitle: "Open your store to buyers", icon: Rocket, optional: false },
];

export default function SetupWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [vendorName, setVendorName] = useState('');

  const patchStep = useCallback(async (stepKey: ApiStepKey, completed: boolean, skipped?: boolean) => {
    const res = await fetch('/api/v1/vendor/setup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: stepKey, completed, skipped }),
    });
    const json = await res.json();
    if (json.success) setProgress(json.data as Record<string, boolean>);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [setupRes, settingsRes] = await Promise.all([
          fetch('/api/v1/vendor/setup'),
          fetch('/api/v1/vendor/settings'),
        ]);
        const setupJson = await setupRes.json();
        const settingsJson = await settingsRes.json();
        if (cancelled) return;

        if (settingsJson.success) {
          const s = settingsJson.data;
          setVendorName(s.businessName || '');
          setLogoUrl(s.logoUrl || '');
          setBannerUrl(s.bannerUrl || '');
          setDescription(s.description || '');
        }

        if (setupJson.success) {
          const prog = (setupJson.data.progress ?? {}) as Record<string, boolean>;
          setProgress(prog);
          if (setupJson.data.wizardComplete) {
            router.replace('/vendor/dashboard');
            return;
          }
          const firstIncomplete = STEPS.findIndex((s, i) => {
            if (i === 0) return false;
            const k = s.key;
            return k && !prog[k];
          });
          setStep(firstIncomplete >= 1 ? firstIncomplete + 1 : 1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await fetch('/api/v1/vendor/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logoUrl: logoUrl || null,
          bannerUrl: bannerUrl || null,
          description: description || null,
        }),
      });
    } finally { setSaving(false); }
  };

  const current = STEPS[step - 1];
  const completedCount = API_STEPS.filter((k) => progress[k]).length;
  const progressPct = (completedCount / API_STEPS.length) * 100;

  const finish = async () => {
    await patchStep('go_live', true);
    router.push('/vendor/dashboard');
  };

  const next = async () => {
    const key = current.key;
    if (key === 'profile') await saveProfile();
    if (key) await patchStep(key, true);
    if (step === STEPS.length) { await finish(); return; }
    setStep((s) => Math.min(STEPS.length, s + 1));
  };

  const skip = async () => {
    const key = current.key;
    if (key && current.optional) await patchStep(key, true, true);
    if (step === STEPS.length) { await finish(); return; }
    setStep((s) => Math.min(STEPS.length, s + 1));
  };

  const back = () => setStep((s) => Math.max(1, s - 1));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]">
        <Loader2 className="animate-spin text-[#299E60]" size={32} />
      </div>
    );
  }

  const Icon = current.icon;

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex flex-col items-center justify-start py-10 px-4">
      <div className="mb-8">
        <span className="text-[22px] font-extrabold text-[#299E60]">Horeca1</span>
        <span className="text-[14px] text-[#7C7C7C] ml-2">Vendor Setup</span>
      </div>

      <div className="w-full max-w-2xl mb-8">
        <div className="h-2 bg-[#EEEEEE] rounded-full overflow-hidden mb-2">
          <div className="h-full bg-[#299E60] transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="text-[12px] text-[#AEAEAE] text-center">
          Step {step} of {STEPS.length} · {completedCount}/{API_STEPS.length} completed
        </p>
      </div>

      <div className="w-full max-w-2xl bg-white rounded-[20px] border border-[#EEEEEE] shadow-sm p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[#EEF8F1] flex items-center justify-center mb-4">
            <Icon size={28} className="text-[#299E60]" />
          </div>
          <h1 className="text-[24px] font-extrabold text-[#181725]">{current.title}</h1>
          <p className="text-[14px] text-[#7C7C7C] mt-1">{current.subtitle}</p>
        </div>

        {step === 1 && (
          <div className="text-center">
            <p className="text-[16px] text-[#181725] mb-2">Welcome{vendorName ? `, ${vendorName}` : ''}!</p>
            <p className="text-[14px] text-[#7C7C7C] leading-relaxed">
              Let&apos;s set up your store in a few quick steps. Required steps are profile, delivery, and products — the rest can be skipped and done later.
            </p>
          </div>
        )}

        {current.key === 'profile' && (
          <div className="space-y-5">
            <div>
              <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Store Logo</label>
              <ImageUpload value={logoUrl} onChange={setLogoUrl} />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Store Banner</label>
              <ImageUpload value={bannerUrl} onChange={setBannerUrl} />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Store Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Tell buyers what you sell..."
                className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#299E60]/40 resize-none"
              />
            </div>
          </div>
        )}

        {current.key === 'delivery' && (
          <div className="text-center">
            <p className="text-[14px] text-[#7C7C7C] mb-6">Configure pincodes and delivery time slots.</p>
            <Link href="/vendor/settings?tab=delivery" className="inline-flex items-center gap-2 bg-[#299E60] text-white px-6 py-3 rounded-[12px] text-[14px] font-bold hover:bg-[#238a54]">
              Configure Delivery <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {current.key === 'products' && (
          <div className="text-center space-y-3">
            <Link href="/vendor/products" className="inline-flex items-center gap-2 bg-[#299E60] text-white px-6 py-3 rounded-[12px] text-[14px] font-bold hover:bg-[#238a54]">
              Add Products <ChevronRight size={16} />
            </Link>
            <p className="text-[12px] text-[#AEAEAE]">Use bulk import for large catalogs</p>
          </div>
        )}

        {current.key === 'inventory' && (
          <div className="text-center">
            <Link href="/vendor/inventory" className="inline-flex items-center gap-2 bg-[#299E60] text-white px-6 py-3 rounded-[12px] text-[14px] font-bold hover:bg-[#238a54]">
              Manage Inventory <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {current.key === 'credit' && (
          <div className="text-center">
            <Link href="/vendor/credit" className="inline-flex items-center gap-2 bg-[#299E60] text-white px-6 py-3 rounded-[12px] text-[14px] font-bold hover:bg-[#238a54]">
              Credit & Collections <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {current.key === 'payment_modes' && (
          <div className="text-center">
            <Link href="/vendor/settings?tab=payments" className="inline-flex items-center gap-2 bg-[#299E60] text-white px-6 py-3 rounded-[12px] text-[14px] font-bold hover:bg-[#238a54]">
              Payment Settings <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {current.key === 'team' && (
          <div className="text-center">
            <Link href="/vendor/team" className="inline-flex items-center gap-2 bg-[#299E60] text-white px-6 py-3 rounded-[12px] text-[14px] font-bold hover:bg-[#238a54]">
              Invite Team <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {current.key === 'go_live' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-[#EEF8F1] flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={40} className="text-[#299E60]" />
            </div>
            <p className="text-[16px] font-bold text-[#181725] mb-2">Your store is ready!</p>
            <p className="text-[14px] text-[#7C7C7C] mb-6">Buyers in your service area can find and order from you.</p>
            <button type="button" onClick={finish} className="inline-flex items-center gap-2 bg-[#299E60] text-white px-8 py-3 rounded-[12px] text-[15px] font-bold hover:bg-[#238a54] shadow-md">
              Go to Dashboard <ChevronRight size={18} />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#F5F5F5]">
          <button type="button" onClick={back} disabled={step === 1} className={cn('flex items-center gap-1.5 text-[14px] font-bold text-[#7C7C7C]', step === 1 && 'invisible')}>
            <ChevronLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-3">
            {current.optional && current.key !== 'go_live' && (
              <button type="button" onClick={skip} className="text-[13px] text-[#AEAEAE] hover:text-[#7C7C7C]">Skip</button>
            )}
            {current.key !== 'go_live' && (
              <button type="button" onClick={next} disabled={saving} className="flex items-center gap-2 bg-[#299E60] text-white px-6 py-2.5 rounded-[10px] text-[14px] font-bold hover:bg-[#238a54] disabled:opacity-50">
                {saving ? 'Saving...' : 'Continue'} <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
