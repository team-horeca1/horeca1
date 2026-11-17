'use client';

import React, { useState } from 'react';
import { Save, Loader2, Percent } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  vendorId: string;
  platformFeePct: number | null;
  globalDefaultPct: number;
  onSaved: () => void;
}

type Mode = 'unconfigured' | 'zero' | 'custom';

export function AdminVendorPlatformFee({ vendorId, platformFeePct, globalDefaultPct, onSaved }: Props) {
  const initial: Mode = platformFeePct == null ? 'unconfigured' : platformFeePct === 0 ? 'zero' : 'custom';
  const [mode, setMode] = useState<Mode>(initial);
  const [customPct, setCustomPct] = useState(platformFeePct != null && platformFeePct !== 0 ? String(platformFeePct) : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    let rate: number | null = null;
    if (mode === 'custom') {
      const n = Number(customPct);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        toast.error('Rate must be between 0% and 100%');
        return;
      }
      rate = n;
    } else if (mode === 'zero') {
      rate = 0;
    }
    if (reason.trim().length < 8) {
      toast.error('A reason of at least 8 characters is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformFeePct: rate, commissionReason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Save failed');
      toast.success(rate == null ? 'Commission marked as not configured' : 'Supplier commission saved');
      setReason('');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const option = (id: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      className={`flex-1 min-h-12 py-2.5 rounded-[10px] text-[12px] font-bold border transition-colors ${
        mode === id ? 'border-[#6B1D2E] bg-[#F8E8EC] text-[#6B1D2E]' : 'border-[#D1D5DB] text-[#7C7C7C]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-white rounded-[14px] border border-[#D1D5DB] shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#D1D5DB]">
        <div className="w-10 h-10 rounded-lg bg-[#F8E8EC] text-[#6B1D2E] flex items-center justify-center">
          <Percent size={20} />
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-[#181725]">Supplier commission</h3>
          <p className="text-[11px] text-[#7C7C7C]">Deducted from this supplier. The settings default of {globalDefaultPct}% is not applied here.</p>
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          {option('unconfigured', 'Not configured')}
          {option('zero', 'Explicit 0%')}
          {option('custom', 'Custom rate')}
        </div>
        {mode === 'custom' && (
          <div>
            <label htmlFor="supplier-commission-rate" className="block text-[12px] font-bold text-[#7C7C7C] mb-1">Commission (%)</label>
            <input
              id="supplier-commission-rate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={customPct}
              onChange={(e) => setCustomPct(e.target.value)}
              className="w-full h-12 px-3 rounded-[10px] border border-[#D1D5DB] text-[13px] outline-none focus:border-[#6B1D2E]/50"
            />
          </div>
        )}
        <div>
          <label htmlFor="supplier-commission-reason" className="block text-[12px] font-bold text-[#7C7C7C] mb-1">Reason</label>
          <input
            id="supplier-commission-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full h-12 px-3 rounded-[10px] border border-[#D1D5DB] text-[13px] outline-none focus:border-[#6B1D2E]/50"
          />
        </div>
        <p className="text-[12px] text-[#667085]">
          {mode === 'unconfigured'
            ? 'This supplier stays marked Commission not configured. Payables are not finalised at 0%.'
            : mode === 'zero'
              ? '0% is a real rate. Delivered, captured orders can be settled with no commission.'
              : 'This rate applies to new recognition. Lines already snapshotted keep their earlier rate.'}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 min-h-12 px-5 rounded-[10px] bg-[#6B1D2E] text-white text-[13px] font-bold hover:bg-[#5A1926] disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save commission
        </button>
      </div>
    </div>
  );
}
