'use client';

/**
 * Shared vendor profile form — identity, contact, tax, addresses, ops (Tier A).
 * Bank / pincodes / docs stay in wizard steps 5–7.
 */

import React from 'react';
import { Building2, MapPin, Receipt, User, ShieldCheck, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddressAutocomplete, type AddressPickPayload } from '@/components/ui/AddressAutocomplete';
import {
  FormField, FormInput, FormSelect, FormTextarea, TextField, SectionLabel, inputClass, PasswordField,
} from '@/components/ui/form';
import {
  BUSINESS_SIZES, COVERAGE_OPTIONS, MONTHLY_SUPPLY_BANDS, VENDOR_LEAD_STATUSES,
  categoryPresetsForSelections,
} from '@/lib/constants/vendorProfile';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
import {
  validateFieldBlur,
  type VendorProfileInput,
  getEffectiveVendorTypeSelections,
} from '@/lib/validators/vendor-profile';
import { VendorTypeMatrix } from './VendorTypeMatrix';
import { SALUTATIONS, INDIAN_STATES } from '@/lib/constants/customerProfile';

export type VendorProfileValues = VendorProfileInput;

export interface VisibleSections {
  identity?: boolean;
  contact?: boolean;
  auth?: boolean;
  tax?: boolean;
  billing?: boolean;
  pickup?: boolean;
  ops?: boolean;
  admin?: boolean;
  remarks?: boolean;
}

export interface VendorProfileFormProps {
  value: VendorProfileValues;
  onChange: (patch: Partial<VendorProfileValues>) => void;
  errors?: Record<string, string>;
  onFieldBlur?: (field: string, value: string) => void;
  visibleSections?: VisibleSections;
  showPassword?: boolean;
  password?: string;
  onPasswordChange?: (v: string) => void;
  showPasswordToggle?: boolean;
  passwordVisible?: boolean;
  onTogglePassword?: () => void;
  pickupSameAsBilling?: boolean;
  onPickupSameAsBillingChange?: (v: boolean) => void;
  className?: string;
  layout?: 'default' | 'wide';
  /** Show the optional Display Name field in the identity section (Businesses pages). */
  showDisplayName?: boolean;
}

function SectionHeader({ icon: Icon, children, spanClass }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  spanClass: string;
}) {
  return (
    <h4 className={cn('text-[11px] font-bold text-[#AEAEAE] pb-1.5 border-b border-gray-50 uppercase tracking-wider flex items-center gap-1.5', spanClass)}>
      <Icon size={13} className="text-gray-400" />
      {children}
    </h4>
  );
}

export function VendorProfileForm({
  value,
  onChange,
  errors = {},
  onFieldBlur,
  visibleSections = {
    identity: true, contact: true, auth: true, tax: true, billing: true, ops: true,
  },
  showPassword,
  password = '',
  onPasswordChange,
  showPasswordToggle,
  passwordVisible,
  onTogglePassword,
  pickupSameAsBilling = false,
  onPickupSameAsBillingChange,
  className,
  layout = 'default',
  showDisplayName = false,
}: VendorProfileFormProps) {
  const set = (patch: Partial<VendorProfileValues>) => onChange(patch);
  const blur = (field: string, v: string) => onFieldBlur?.(field, v);
  const isWide = layout === 'wide';
  const GRID = isWide
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3'
    : 'grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4';
  const SPAN_FULL = isWide ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-2';
  const relaxedContact = isRegisterEmailOtpEnabled();
  const typeSelections = getEffectiveVendorTypeSelections(value);
  const categoryPresets = categoryPresetsForSelections(typeSelections);
  const selectedCategories = value.categoriesHandled ?? [];
  const toggleCategory = (cat: string) => {
    const next = selectedCategories.includes(cat)
      ? selectedCategories.filter(c => c !== cat)
      : [...selectedCategories, cat];
    set({ categoriesHandled: next });
  };

  const handleBillingPick = (place: AddressPickPayload) => {
    set({
      billingAddressLine: place.fullAddress,
      billingCity: place.city,
      billingState: place.state,
      billingPincode: place.pincode,
      billingAddress: {
        addressLine: place.fullAddress,
        city: place.city,
        state: place.state,
        pincode: place.pincode,
      },
    });
  };

  const billingLine = value.billingAddressLine ?? value.billingAddress?.addressLine ?? '';
  const billingCity = value.billingCity ?? value.billingAddress?.city ?? '';
  const billingState = value.billingState ?? value.billingAddress?.state ?? '';
  const billingPincode = value.billingPincode ?? value.billingAddress?.pincode ?? '';

  return (
    <div className={cn(isWide ? 'space-y-4' : 'space-y-5', className)}>
      <div className={cn(GRID, 'space-y-0')}>
        {visibleSections.identity && (
          <>
            <SectionHeader icon={Building2} spanClass={SPAN_FULL}>Business Identity</SectionHeader>
            <TextField label="Legal Business Name" required value={value.legalName ?? value.businessName ?? ''}
              dataField="legalName"
              error={errors.legalName}
              onChange={v => set({ legalName: v, businessName: v })}
              onBlur={() => blur('legalName', value.legalName ?? value.businessName ?? '')}
              placeholder="Registered company name" />
            {showDisplayName && (
              <TextField label="Display Name (optional)" value={value.displayName ?? value.tradeName ?? ''}
                dataField="displayName"
                error={errors.displayName}
                onChange={v => set({ displayName: v, tradeName: v })}
                onBlur={() => blur('displayName', value.displayName ?? value.tradeName ?? '')}
                placeholder="Shown to customers (defaults to legal name)" />
            )}
            <VendorTypeMatrix
              value={value}
              onChange={onChange}
              error={errors.vendorTypeSelections || errors.vendorBusinessType || errors.subType}
              className={SPAN_FULL}
            />
            {categoryPresets.length > 0 && (
              <FormField label="Categories Handled" className={SPAN_FULL}>
                <div className="flex flex-wrap gap-2">
                  {categoryPresets.map(cat => (
                    <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-[12px] font-bold border transition-colors',
                        selectedCategories.includes(cat)
                          ? 'border-primary bg-primary-light text-primary'
                          : 'border-[#EEEEEE] bg-white text-gray-500 hover:border-gray-300',
                      )}>
                      {cat}
                    </button>
                  ))}
                </div>
              </FormField>
            )}
          </>
        )}

        {visibleSections.contact && (
          <>
            <SectionHeader icon={User} spanClass={SPAN_FULL}>Store Contact</SectionHeader>
            <FormField label="Contact Person" className={SPAN_FULL} dataField="firstName" error={errors.firstName}>
              <div className={cn('grid gap-2', isWide ? 'grid-cols-[100px_1fr_1fr]' : 'grid-cols-[110px_1fr_1fr]')}>
                <FormSelect value={value.salutation ?? ''} onChange={v => set({ salutation: v })}>
                  {SALUTATIONS.map(s => <option key={s || 'empty'} value={s}>{s || 'Salutation'}</option>)}
                </FormSelect>
                <FormInput
                  value={value.firstName ?? ''}
                  onChange={v => {
                    const last = value.lastName ?? '';
                    const derived = [v, last].map(s => s.trim()).filter(Boolean).join(' ');
                    set({
                      firstName: v,
                      ...(derived ? { authorizedPersonName: derived, fullName: derived } : {}),
                    });
                  }}
                  placeholder="First Name"
                  hasError={!!errors.firstName}
                  onBlur={() => blur('firstName', value.firstName ?? '')}
                />
                <FormInput
                  value={value.lastName ?? ''}
                  onChange={v => {
                    const first = value.firstName ?? '';
                    const derived = [first, v].map(s => s.trim()).filter(Boolean).join(' ');
                    set({
                      lastName: v,
                      ...(derived ? { authorizedPersonName: derived, fullName: derived } : {}),
                    });
                  }}
                  placeholder="Last Name"
                  hasError={!!errors.lastName}
                  onBlur={() => blur('lastName', value.lastName ?? '')}
                />
              </div>
            </FormField>
            <TextField
              dataField="authorizedPersonPhone"
              label={relaxedContact ? 'Mobile (optional if email provided)' : 'Mobile'}
              required={!relaxedContact}
              value={value.phone ?? value.mobilePhone ?? value.authorizedPersonPhone ?? ''}
              error={errors.phone || errors.authorizedPersonPhone}
              onChange={v => {
                const p = v.replace(/\D/g, '').slice(-10);
                set({ phone: p, mobilePhone: p, authorizedPersonPhone: p });
              }}
              placeholder="10-digit mobile" inputMode="numeric" />
            <TextField
              dataField="email"
              label={relaxedContact ? 'Email (optional if mobile provided)' : 'Email'}
              required={false}
              value={value.email ?? value.authorizedPersonEmail ?? ''}
              error={errors.email}
              onChange={v => set({ email: v, authorizedPersonEmail: v })}
              placeholder="contact@vendor.com" />
          </>
        )}

        {visibleSections.auth && showPassword && onPasswordChange && (
          <>
            <SectionHeader icon={ShieldCheck} spanClass={SPAN_FULL}>Account Access</SectionHeader>
            <FormField label="Password (optional)" className={SPAN_FULL} dataField="password">
              <PasswordField
                value={password}
                onChange={onPasswordChange}
                placeholder="Min 6 characters"
                autoComplete="new-password"
                inputClassName={inputClass(!!errors.password)}
              />
              {errors.password && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.password}</p>}
            </FormField>
          </>
        )}

        {visibleSections.tax && (
          <>
            <SectionHeader icon={Receipt} spanClass={SPAN_FULL}>Tax &amp; Compliance</SectionHeader>
            <TextField label="GSTIN" value={value.gstin ?? value.gstNumber ?? ''} maxLength={15}
              error={errors.gstin}
              onChange={v => set({ gstin: v.toUpperCase().slice(0, 15), gstNumber: v.toUpperCase().slice(0, 15) })}
              onBlur={() => blur('gstin', value.gstin ?? value.gstNumber ?? '')}
              placeholder="22ABCDE1234F1Z5" />
            <TextField label="PAN" value={value.pan ?? value.panNumber ?? ''} maxLength={10}
              error={errors.pan}
              onChange={v => set({ pan: v.toUpperCase().slice(0, 10), panNumber: v.toUpperCase().slice(0, 10) })}
              onBlur={() => blur('pan', value.pan ?? value.panNumber ?? '')}
              placeholder="ABCDE1234F" />
            <TextField label="FSSAI (optional)" value={value.fssaiNumber ?? ''} maxLength={14}
              onChange={v => set({ fssaiNumber: v.replace(/\D/g, '').slice(0, 14) })} />
          </>
        )}

        {visibleSections.billing && (
          <>
            <SectionHeader icon={MapPin} spanClass={SPAN_FULL}>Billing Address</SectionHeader>
            <div className={SPAN_FULL}>
              <AddressAutocomplete
                label="Search billing address"
                placeholder="Registered office..."
                businessMode
                onPick={handleBillingPick}
              />
            </div>
            <TextField label="Address Line" required value={billingLine}
              error={errors.billingAddressLine}
              onChange={v => set({
                billingAddressLine: v,
                billingAddress: { addressLine: v, city: billingCity, state: billingState, pincode: billingPincode },
              })}
              placeholder="Full billing address" className={SPAN_FULL} />
            <TextField label="City" required value={billingCity} error={errors.billingCity}
              onChange={v => set({ billingCity: v, billingAddress: { addressLine: billingLine, city: v, state: billingState, pincode: billingPincode } })}
              placeholder="City" />
            <FormField label="State" required>
              <FormSelect value={billingState}
                onChange={v => set({ billingState: v, billingAddress: { addressLine: billingLine, city: billingCity, state: v, pincode: billingPincode } })}
                hasError={!!errors.billingState}>
                <option value="">Select state</option>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
              {errors.billingState && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.billingState}</p>}
            </FormField>
            <TextField label="Pincode" required value={billingPincode} maxLength={6}
              error={errors.billingPincode} placeholder="6-digit PIN" inputMode="numeric"
              onChange={v => {
                const n = v.replace(/\D/g, '').slice(0, 6);
                set({ billingPincode: n, billingAddress: { addressLine: billingLine, city: billingCity, state: billingState, pincode: n } });
              }}
              onBlur={() => blur('billingPincode', billingPincode)} />
          </>
        )}

        {visibleSections.pickup && onPickupSameAsBillingChange && (
          <>
            <SectionHeader icon={MapPin} spanClass={SPAN_FULL}>Pickup Address</SectionHeader>
            <FormField label="Same as billing" className={SPAN_FULL}>
              <label className="flex items-center gap-2 h-[44px] text-[14px] font-medium cursor-pointer">
                <input type="checkbox" checked={pickupSameAsBilling}
                  onChange={e => onPickupSameAsBillingChange(e.target.checked)}
                  className="accent-primary w-4 h-4" />
                Pickup address same as billing
              </label>
            </FormField>
            {!pickupSameAsBilling && (
              <>
                <TextField label="Pickup Address" value={value.pickupAddressLine ?? ''}
                  onChange={v => set({ pickupAddressLine: v })}
                  placeholder="Warehouse / pickup location" className={SPAN_FULL} />
                <TextField label="City" value={value.pickupCity ?? ''} onChange={v => set({ pickupCity: v })} />
                <TextField label="State" value={value.pickupState ?? ''} onChange={v => set({ pickupState: v })} />
                <TextField label="Pincode" value={value.pickupPincode ?? ''} maxLength={6}
                  onChange={v => set({ pickupPincode: v.replace(/\D/g, '').slice(0, 6) })}
                  onBlur={() => blur('pickupPincode', value.pickupPincode ?? '')} />
              </>
            )}
          </>
        )}

        {visibleSections.ops && (
          <>
            <SectionHeader icon={Truck} spanClass={SPAN_FULL}>Operations</SectionHeader>
            <FormField label="Business Size">
              <FormSelect value={value.businessSize ?? ''} onChange={v => set({ businessSize: v })}>
                <option value="">Select size</option>
                {BUSINESS_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
            </FormField>
            <FormField label="Coverage">
              <FormSelect value={value.coverage ?? ''} onChange={v => set({ coverage: v })}>
                <option value="">Select coverage</option>
                {COVERAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
            </FormField>
            <TextField label="Warehouse Count" value={value.warehouseCount != null ? String(value.warehouseCount) : ''}
              inputMode="numeric"
              onChange={v => set({ warehouseCount: v.replace(/\D/g, '') || undefined })} />
            <FormField label="Delivery Fleet">
              <div className="flex gap-4 h-[44px] items-center">
                {([true, false] as const).map(v => (
                  <label key={String(v)} className="flex items-center gap-2 text-[14px] font-medium cursor-pointer">
                    <input type="radio" checked={value.deliveryFleet === v}
                      onChange={() => set({ deliveryFleet: v })} className="accent-primary" />
                    {v ? 'Yes' : 'No'}
                  </label>
                ))}
              </div>
            </FormField>
            <FormField label="Monthly Supply Band">
              <FormSelect value={value.monthlySupplyBand ?? ''} onChange={v => set({ monthlySupplyBand: v })}>
                <option value="">Select band</option>
                {MONTHLY_SUPPLY_BANDS.map(s => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
            </FormField>
          </>
        )}

        {visibleSections.admin && (
          <>
            <SectionHeader icon={ShieldCheck} spanClass={SPAN_FULL}>Admin &amp; Operations</SectionHeader>
            <FormField label="Lead Status">
              <FormSelect value={value.leadStatus ?? ''} onChange={v => set({ leadStatus: v })}>
                <option value="">Select status</option>
                {VENDOR_LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
            </FormField>
          </>
        )}

        {visibleSections.remarks && (
          <FormField label="Remarks" className={SPAN_FULL}>
            <FormTextarea value={value.remarks ?? ''} onChange={v => set({ remarks: v })}
              placeholder="Internal notes..." rows={2} />
          </FormField>
        )}
      </div>
    </div>
  );
}

export { validateFieldBlur };
