'use client';

import React, { useState } from 'react';
import { Save, Loader2, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { PlatformFeeCalculator } from '@/components/features/vendor/finance/EarningsBreakdown';

interface Props {
  vendorId: string;
  platformFeePct: number | null;
  globalDefaultPct: number;
  onSaved: () => void;
}

export function AdminVendorPlatformFee({ vendorId, platformFeePct, globalDefaultPct, onSaved }: Props) {
  const [useCustom, setUseCustom] = useState(platformFeePct != null);
  const [customPct, setCustomPct] = useState(platformFeePct != null ? String(platformFeePct) : '');
  const [saving, setSaving] = useState(false);

  const effectivePct = useCustom ? (Number(customPct) || globalDefaultPct) : globalDefaultPct;

  const save = async () => {
    if (useCustom) {
      const n = Number(customPct);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        toast.error('Custom rate must be between 0% and 100%');
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformFeePct: useCustom ? Number(customPct) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Save failed');
      toast.success('Platform fee updated');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-[14px] border border-[#D1D5DB] shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#D1D5DB]">
        <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
          <Percent size={20} />
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-[#181725]">Platform Fee</h3>
          <p className="text-[11px] text-[#7C7C7C]">How much HoReCa1 keeps from this vendor&apos;s sales</p>
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setUseCustom(false)}
            className={`flex-1 py-2.5 rounded-[10px] text-[12px] font-bold border transition-colors ${
              !useCustom ? 'border-[#6B1D2E] bg-[#F8E8EC] text-[#6B1D2E]' : 'border-[#D1D5DB] text-[#7C7C7C]'
            }`}
          >
            Global default ({globalDefaultPct}%)
          </button>
          <button
            type="button"
            onClick={() => setUseCustom(true)}
            className={`flex-1 py-2.5 rounded-[10px] text-[12px] font-bold border transition-colors ${
              useCustom ? 'border-[#6B1D2E] bg-[#F8E8EC] text-[#6B1D2E]' : 'border-[#D1D5DB] text-[#7C7C7C]'
            }`}
          >
            Custom rate
          </button>
        </div>
        {useCustom && (
          <div>
            <label className="block text-[12px] font-bold text-[#7C7C7C] mb-1">Custom platform fee (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={customPct}
              onChange={(e) => setCustomPct(e.target.value)}
              className="w-full h-[40px] px-3 rounded-[10px] border border-[#D1D5DB] text-[13px] outline-none focus:border-[#6B1D2E]/50"
            />
          </div>
        )}
        <PlatformFeeCalculator pct={effectivePct} />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 h-[38px] px-5 rounded-[10px] bg-[#6B1D2E] text-white text-[13px] font-bold hover:bg-[#5A1926] disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save platform fee
        </button>
      </div>
    </div>
  );
}
