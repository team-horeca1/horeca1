'use client';

import { FileText } from 'lucide-react';
import { VendorSettingsSaveBar } from './VendorSettingsSaveBar';

export interface PoliciesTabProps {
  returnPolicy: string;
  setReturnPolicy: (v: string) => void;
  cancellationPolicy: string;
  setCancellationPolicy: (v: string) => void;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}

export function PoliciesTab({ returnPolicy, setReturnPolicy, cancellationPolicy, setCancellationPolicy, saving, saved, onSave }: PoliciesTabProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 pb-1 border-b border-[#F5F5F5]">
        <FileText size={18} className="text-[#299E60]" />
        <h2 className="text-[16px] font-bold text-[#181725]">Store policies</h2>
      </div>
      <div>
        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Return policy</label>
        <textarea rows={4} value={returnPolicy} onChange={(e) => setReturnPolicy(e.target.value)} maxLength={2000} className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#299E60]/40 resize-none" />
      </div>
      <div>
        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Cancellation policy</label>
        <textarea rows={4} value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)} maxLength={2000} className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#299E60]/40 resize-none" />
      </div>
      <VendorSettingsSaveBar saving={saving} saved={saved} onSave={onSave} />
    </div>
  );
}
