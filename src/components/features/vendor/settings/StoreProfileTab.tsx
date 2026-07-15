'use client';

import { Store } from 'lucide-react';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { cn } from '@/lib/utils';
import { VendorSettingsSaveBar } from './VendorSettingsSaveBar';

export interface StoreProfileTabProps {
  businessName: string;
  setBusinessName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  logoUrl: string;
  setLogoUrl: (v: string) => void;
  bannerUrl: string;
  setBannerUrl: (v: string) => void;
  vendorType: 'distributor' | 'wholesaler' | 'dark_store';
  setVendorType: (v: 'distributor' | 'wholesaler' | 'dark_store') => void;
  /** @deprecated Always on — kept for call-site compatibility */
  multiWarehouseEnabled?: boolean;
  setMultiWarehouseEnabled?: (v: boolean) => void;
  onRequestMultiWarehouseEnable?: () => void;
  minOrderValue: string;
  setMinOrderValue: (v: string) => void;
  creditEnabled: boolean;
  setCreditEnabled: (v: boolean) => void;
  addressLine: string;
  setAddressLine: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  stateName: string;
  setStateName: (v: string) => void;
  addressPincode: string;
  setAddressPincode: (v: string) => void;
  gstNumber: string;
  setGstNumber: (v: string) => void;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  /** Admin View: settings are read-only so admins don't accidentally mutate vendor config */
  readOnly?: boolean;
}

export function StoreProfileTab(props: StoreProfileTabProps) {
  const {
    businessName, setBusinessName, description, setDescription,
    logoUrl, setLogoUrl, bannerUrl, setBannerUrl,
    vendorType, setVendorType, minOrderValue, setMinOrderValue,
    creditEnabled, setCreditEnabled,
    addressLine, setAddressLine, city, setCity, stateName, setStateName,
    addressPincode, setAddressPincode, gstNumber, setGstNumber,
    saving, saved, onSave, readOnly = false,
  } = props;

  const fieldClass = cn(
    'w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40',
    readOnly && 'bg-gray-50 text-gray-600 cursor-not-allowed',
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-1 border-b border-[#F5F5F5]">
        <Store size={18} className="text-[#299E60]" />
        <h2 className="text-[16px] font-bold text-[#181725]">Store profile</h2>
        {readOnly && (
          <span className="ml-auto text-[10px] font-extrabold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            Admin View — read only
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] gap-6 xl:gap-8">
        <div className="space-y-4 min-w-0">
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Business name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={readOnly}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              disabled={readOnly}
              className={cn(
                'w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#299E60]/40 resize-none',
                readOnly && 'bg-gray-50 text-gray-600 cursor-not-allowed',
              )}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Business type</label>
              <select
                value={vendorType}
                onChange={(e) => setVendorType(e.target.value as typeof vendorType)}
                disabled={readOnly}
                className={cn(fieldClass, 'bg-white')}
              >
                <option value="distributor">Distributor</option>
                <option value="wholesaler">Wholesaler</option>
                <option value="dark_store">Dark store</option>
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Minimum order value (₹)</label>
              <input
                type="number"
                value={minOrderValue}
                onChange={(e) => setMinOrderValue(e.target.value)}
                disabled={readOnly}
                className={fieldClass}
              />
              {readOnly && (
                <p className="mt-1 text-[11px] text-amber-700 font-medium">Locked while in Admin View</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className={cn('flex items-center gap-3', readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer')}>
              <input
                type="checkbox"
                checked={creditEnabled}
                onChange={(e) => setCreditEnabled(e.target.checked)}
                disabled={readOnly}
                className="w-5 h-5 accent-[#299E60]"
              />
              <span className="text-[14px] font-bold text-[#181725]">Enable credit for customers</span>
            </label>
            <div className="rounded-xl border border-[#E2F3E9] bg-[#F5FBF7] px-4 py-3">
              <p className="text-[14px] font-bold text-[#181725]">Multi-warehouse inventory — always on</p>
              <p className="text-[12px] text-[#7C7C7C] mt-1 leading-relaxed">
                Each outlet is a godown with its own stock. Customers see one storefront.
                At checkout we ship from the warehouse that serves their pincode and has stock
                (same model as Zoho / Hyperpure-style hubs — not separate shops).
              </p>
            </div>
          </div>
        </div>

        <div className={cn('grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4', readOnly && 'pointer-events-none opacity-80')}>
          <ImageUploadField
            label="Store logo"
            aspectHint="Square — 200×200 recommended"
            value={logoUrl || null}
            onChange={(url) => setLogoUrl(url ?? '')}
            folder="vendors"
            variant="brand-logo"
          />
          <ImageUploadField
            label="Store card image"
            aspectHint="Vendor card — 280×160 recommended"
            value={bannerUrl || null}
            onChange={(url) => setBannerUrl(url ?? '')}
            folder="vendors"
            variant="vendor-cover"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-[#EEEEEE]">
        <h3 className="text-[15px] font-bold text-[#181725] mb-1">Registered business address</h3>
        <p className="text-[12px] text-[#7C7C7C] mb-4">Bill From / Shipped From on tax invoices</p>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Street / building</label>
            <textarea
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              rows={2}
              disabled={readOnly}
              className={cn(
                'w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#299E60]/40 resize-none',
                readOnly && 'bg-gray-50 text-gray-600 cursor-not-allowed',
              )}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[13px] font-bold text-[#181725] mb-1.5">City</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} disabled={readOnly} className={fieldClass} />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#181725] mb-1.5">State</label>
              <input type="text" value={stateName} onChange={(e) => setStateName(e.target.value)} disabled={readOnly} className={fieldClass} />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Pincode</label>
              <input type="text" inputMode="numeric" maxLength={6} value={addressPincode} onChange={(e) => setAddressPincode(e.target.value.replace(/[^\d]/g, ''))} disabled={readOnly} className={fieldClass} />
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">GSTIN</label>
            <input type="text" value={gstNumber} onChange={(e) => setGstNumber(e.target.value.toUpperCase())} maxLength={15} disabled={readOnly} className={cn(fieldClass, 'font-mono')} />
          </div>
        </div>
      </div>

      {!readOnly && <VendorSettingsSaveBar saving={saving} saved={saved} onSave={onSave} />}
    </div>
  );
}
