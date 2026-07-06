'use client';

import { Building2, Eye, EyeOff, Settings2 } from 'lucide-react';
import { VendorSettingsSaveBar } from './VendorSettingsSaveBar';

export interface PaymentsTabProps {
  paymentModes: string[];
  setPaymentModes: React.Dispatch<React.SetStateAction<string[]>>;
  bankAccountName: string;
  setBankAccountName: (v: string) => void;
  bankAccountNumber: string;
  setBankAccountNumber: (v: string) => void;
  bankShowNumber: boolean;
  setBankShowNumber: (v: boolean | ((prev: boolean) => boolean)) => void;
  bankIfsc: string;
  setBankIfsc: (v: string) => void;
  bankName: string;
  setBankName: (v: string) => void;
  bankAccountType: 'current' | 'savings' | '';
  setBankAccountType: (v: 'current' | 'savings' | '') => void;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}

export function PaymentsTab(props: PaymentsTabProps) {
  const {
    paymentModes, setPaymentModes,
    bankAccountName, setBankAccountName, bankAccountNumber, setBankAccountNumber,
    bankShowNumber, setBankShowNumber, bankIfsc, setBankIfsc, bankName, setBankName,
    bankAccountType, setBankAccountType, saving, saved, onSave,
  } = props;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={18} className="text-orange-500" />
          <h2 className="text-[16px] font-bold text-[#181725]">Accepted payment modes</h2>
        </div>
        <div className="space-y-3">
          {[
            { value: 'cod', label: 'COD', description: 'Cash on delivery' },
            { value: 'prepaid', label: 'Prepaid', description: 'Online (UPI, card, net banking)' },
            { value: 'credit', label: 'Vendor credit', description: 'Purchase on credit' },
            { value: 'cheque', label: 'Cheque', description: 'Cheque payments' },
          ].map(({ value, label, description }) => {
            const enabled = paymentModes.includes(value);
            return (
              <div key={value} className="flex items-center justify-between gap-4 py-2 border-b border-[#F5F5F5] last:border-0">
                <div>
                  <p className="text-[14px] font-bold text-[#181725]">{label}</p>
                  <p className="text-[12px] text-[#7C7C7C]">{description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentModes((prev) => (prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]))}
                  className={`relative inline-flex h-[24px] w-[44px] shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-orange-500' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-[#F5F5F5] pt-6">
        <div className="flex items-center gap-2 mb-2">
          <Building2 size={18} className="text-[#299E60]" />
          <h2 className="text-[16px] font-bold text-[#181725]">Bank account</h2>
        </div>
        <p className="text-[12px] text-[#7C7C7C] mb-4">Settlement payouts — must match registered business account</p>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Account holder name</label>
            <input type="text" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40" />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Account number</label>
            <div className="relative">
              <input type={bankShowNumber ? 'text' : 'password'} value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} maxLength={30} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 pr-12 text-[14px] font-mono outline-none focus:border-[#299E60]/40" />
              <button type="button" onClick={() => setBankShowNumber((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AEAEAE] hover:text-[#181725]">
                {bankShowNumber ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-bold text-[#181725] mb-1.5">IFSC</label>
              <input type="text" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} maxLength={11} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-mono outline-none focus:border-[#299E60]/40" />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Bank name</label>
              <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            {(['current', 'savings'] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="bankAccountType" checked={bankAccountType === t} onChange={() => setBankAccountType(t)} className="accent-[#299E60] w-4 h-4" />
                <span className="text-[14px] font-medium text-[#181725] capitalize">{t}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <VendorSettingsSaveBar saving={saving} saved={saved} onSave={onSave} />
    </div>
  );
}
