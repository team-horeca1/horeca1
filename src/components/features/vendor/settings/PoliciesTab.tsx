'use client';

import { FileText, Package } from 'lucide-react';
import { VendorSettingsSaveBar } from './VendorSettingsSaveBar';

export interface PoliciesTabProps {
  returnPolicy: string;
  setReturnPolicy: (v: string) => void;
  cancellationPolicy: string;
  setCancellationPolicy: (v: string) => void;
  autoDisableOos: boolean;
  setAutoDisableOos: (v: boolean) => void;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}

export function PoliciesTab({
  returnPolicy,
  setReturnPolicy,
  cancellationPolicy,
  setCancellationPolicy,
  autoDisableOos,
  setAutoDisableOos,
  saving,
  saved,
  onSave,
}: PoliciesTabProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 pb-1 border-b border-[#F5F5F5]">
        <FileText size={18} className="text-primary" />
        <h2 className="text-[16px] font-bold text-[#181725]">Store policies</h2>
      </div>
      <div>
        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Return policy</label>
        <textarea
          rows={4}
          value={returnPolicy}
          onChange={(e) => setReturnPolicy(e.target.value)}
          maxLength={2000}
          className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-primary/40 resize-none"
        />
      </div>
      <div>
        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Cancellation policy</label>
        <textarea
          rows={4}
          value={cancellationPolicy}
          onChange={(e) => setCancellationPolicy(e.target.value)}
          maxLength={2000}
          className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-primary/40 resize-none"
        />
      </div>

      <div className="rounded-[12px] border border-[#EEEEEE] p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-primary" />
          <h3 className="text-[14px] font-bold text-[#181725]">Inventory / out of stock</h3>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoDisableOos}
            onChange={(e) => setAutoDisableOos(e.target.checked)}
            className="mt-1 accent-primary"
          />
          <span>
            <span className="block text-[13px] font-bold text-[#181725]">
              Auto-disable product when out of stock
            </span>
            <span className="block text-[12px] text-[#7C7C7C] mt-0.5">
              When sellable stock reaches zero across all locations, mark the product inactive so
              customers cannot order it. Leave off to keep the product listed as out of stock.
            </span>
          </span>
        </label>
      </div>

      <VendorSettingsSaveBar saving={saving} saved={saved} onSave={onSave} />
    </div>
  );
}
