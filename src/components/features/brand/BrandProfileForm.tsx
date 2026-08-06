'use client';

/**
 * Shared brand profile form — identity, market, contact, tax/location, marketing.
 */

import React, { useState, useEffect } from 'react';
import {
  Building2, User, MapPin, Globe, Target, ChevronDown, ChevronUp, Check, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddressAutocomplete, type AddressPickPayload } from '@/components/ui/AddressAutocomplete';
import {
  FormField, FormInput, FormSelect, FormTextarea, TextField, PhoneInput, PasswordInput,
} from '@/components/ui/form';
import {
  BRAND_TYPES,
  BRAND_TIERS,
  BRAND_LEAD_STATUSES,
  BUSINESS_SIZES,
  DISTRIBUTION_PRESENCE_OPTIONS,
  MARKETPLACE_VISIBILITY_OPTIONS,
  TARGET_SEGMENT_PRESETS,
  subTypesForBrandType,
  productCategoriesForSubType,
} from '@/lib/constants/brandProfile';
import {
  validateFieldBlur,
  type BrandProfileInput,
  derivedLegalName,
  derivedDisplayName,
} from '@/lib/validators/brand-profile';

export type BrandProfileValues = BrandProfileInput;

export interface VisibleSections {
  identity?: boolean;
  market?: boolean;
  contact?: boolean;
  tax?: boolean;
  address?: boolean;
  marketing?: boolean;
  auth?: boolean;
  ops?: boolean;
  /** When false, hides email in Primary Contact (e.g. admin modal uses a separate Owner Email field). */
  contactEmail?: boolean;
}

export interface BrandProfileFormProps {
  value: BrandProfileValues;
  onChange: (patch: Partial<BrandProfileValues>) => void;
  errors?: Record<string, string>;
  onFieldBlur?: (field: string, value: string) => void;
  visibleSections?: VisibleSections;
  showPassword?: boolean;
  password?: string;
  onPasswordChange?: (v: string) => void;
  showPasswordToggle?: boolean;
  passwordVisible?: boolean;
  onTogglePassword?: () => void;
  className?: string;
  layout?: 'default' | 'wide';
  /** When true, outlet/address/pincode show required markers (add-business flow). */
  requireLocationFields?: boolean;
  /**
   * Contact channel labels / required markers.
   * `relaxed` = public register with email-OR-phone (matches validateBrandProfile publicRegister).
   * Admin / add-business stay `strict` (mobile still required).
   */
  contactMode?: 'strict' | 'relaxed';
  /** Lock the OTP-verified channel so the user cannot swap to an unverified contact. */
  verifiedContact?: { channel: 'phone' | 'email'; value: string } | null;
}

function SectionHeader({
  icon: Icon,
  children,
  spanClass,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  spanClass: string;
}) {
  return (
    <h4 className={cn(
      'text-[11px] font-bold text-[#AEAEAE] pb-1.5 border-b border-gray-50 uppercase tracking-wider flex items-center gap-1.5',
      spanClass,
    )}>
      <Icon size={13} className="text-gray-400" />
      {children}
    </h4>
  );
}

function CollapsibleSection({
  id, title, icon, defaultOpen, forceOpen, children, spanClass,
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  defaultOpen?: boolean;
  /** Opens the section when validation fails (e.g. required location fields empty). */
  forceOpen?: boolean;
  children: React.ReactNode;
  spanClass?: string;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const Icon = icon;

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <div className={cn(spanClass ?? 'sm:col-span-2', 'border border-[#EEEEEE] rounded-[12px] bg-[#FAFAFA]/30 overflow-hidden')}>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full px-4 py-3.5 flex items-center justify-between text-[12px] font-bold text-gray-700 hover:bg-[#FAFAFA]/70 transition-colors">
        <span className="flex items-center gap-2">
          <Icon size={16} className="text-[#299E60]" />
          {title}
        </span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && (
        <div id={id} className="p-4 space-y-4 bg-white border-t border-[#EEEEEE] animate-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

export function BrandProfileForm({
  value,
  onChange,
  errors = {},
  onFieldBlur,
  visibleSections = {
    identity: true,
    market: true,
    contact: true,
    tax: true,
    address: true,
    marketing: true,
  },
  showPassword,
  password = '',
  onPasswordChange,
  showPasswordToggle,
  passwordVisible,
  onTogglePassword,
  className,
  layout = 'default',
  requireLocationFields = false,
  contactMode = 'strict',
  verifiedContact = null,
}: BrandProfileFormProps) {
  const set = (patch: Partial<BrandProfileValues>) => onChange(patch);
  const blur = (field: string, v: string) => onFieldBlur?.(field, v);
  const isWide = layout === 'wide';
  const GRID = isWide
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3'
    : 'grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4';
  const SPAN_FULL = isWide ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-2';
  const relaxedContact = contactMode === 'relaxed';
  const phoneLocked = verifiedContact?.channel === 'phone';
  const emailLocked = verifiedContact?.channel === 'email';

  const handleBrandTypeChange = (brandType: string) => {
    set({ brandType, subType: '', productCategories: [] });
  };

  const handleSubTypeChange = (subType: string) => {
    set({ subType, productCategories: [] });
  };

  const handleAddressPick = (place: AddressPickPayload) => {
    const legal = derivedLegalName(value);
    const display = derivedDisplayName(value);
    const patch: Partial<BrandProfileValues> = {
      addressLine: place.fullAddress,
      billingAddressLine: place.fullAddress,
      city: place.city,
      billingCity: place.city,
      state: place.state,
      billingState: place.state,
      pincode: place.pincode,
      billingPincode: place.pincode,
      latitude: place.latitude,
      longitude: place.longitude,
      placeId: place.placeId,
    };
    if (!value.outletName?.trim() && (display || legal)) {
      patch.outletName = `${display || legal} HQ`;
    }
    set(patch);
  };

  const subTypes = subTypesForBrandType(value.brandType ?? '');
  const productCats = productCategoriesForSubType(value.brandType ?? '', value.subType ?? '');

  const toggleCategory = (cat: string) => {
    const current = value.productCategories ?? [];
    const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    set({ productCategories: next });
  };

  const toggleSegment = (seg: string) => {
    const current = value.targetSegments ?? [];
    const next = current.includes(seg) ? current.filter(s => s !== seg) : [...current, seg];
    set({ targetSegments: next });
  };

  const locationFieldErrors = !!(errors.outletName || errors.addressLine || errors.pincode);

  const addressContent = (
    <div className="space-y-4">
      <AddressAutocomplete
        label="Search address or place name"
        placeholder="e.g. Bandra office..."
        businessMode
        hint="Selecting a place auto-fills city, state, and pincode."
        onPick={handleAddressPick}
      />
      <TextField label="Primary Outlet / HQ name" required={requireLocationFields} value={value.outletName ?? ''}
        dataField="outletName"
        error={errors.outletName}
        onChange={v => set({ outletName: v })}
        onBlur={() => blur('outletName', value.outletName ?? '')}
        placeholder="e.g. Mumbai HQ" />
      <TextField label="Address Line" required={requireLocationFields} value={value.addressLine ?? value.billingAddressLine ?? ''}
        dataField="addressLine"
        error={errors.addressLine}
        onChange={v => set({ addressLine: v, billingAddressLine: v })}
        onBlur={() => blur('addressLine', value.addressLine ?? value.billingAddressLine ?? '')}
        placeholder="Building, street, area" />
      <div className={GRID}>
        <TextField label="Pincode" required={requireLocationFields} value={value.pincode ?? value.billingPincode ?? ''} maxLength={6}
          dataField="pincode"
          error={errors.pincode} placeholder="6-digit PIN" inputMode="numeric"
          onChange={v => {
            const n = v.replace(/\D/g, '').slice(0, 6);
            set({ pincode: n, billingPincode: n });
          }}
          onBlur={() => blur('pincode', value.pincode ?? value.billingPincode ?? '')} />
        <TextField label="City" value={value.city ?? value.billingCity ?? ''}
          onChange={v => set({ city: v, billingCity: v })} placeholder="City" />
        <TextField label="State" value={value.state ?? value.billingState ?? ''}
          onChange={v => set({ state: v, billingState: v })} placeholder="State" />
      </div>
      {value.latitude != null && value.longitude != null && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <Check size={12} className="text-emerald-700" strokeWidth={3} />
          </div>
          <p className="text-[11.5px] text-emerald-900/80">
            GPS coordinates captured ({value.latitude.toFixed(5)}, {value.longitude.toFixed(5)})
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn(isWide ? 'space-y-4' : 'space-y-5', className)}>
      <div className={cn(GRID, 'space-y-0')}>
        {visibleSections.identity && (
          <>
            <SectionHeader icon={Building2} spanClass={SPAN_FULL}>Brand Identity</SectionHeader>
            <TextField label="Legal Brand Name" required value={value.legalName ?? value.companyName ?? ''}
              dataField="legalName"
              error={errors.legalName}
              onChange={v => set({ legalName: v, companyName: v })}
              onBlur={() => blur('legalName', value.legalName ?? value.companyName ?? '')}
              placeholder="Kissan Foods Pvt Ltd" />
            <TextField label="Display Name" required value={value.displayName ?? value.name ?? ''}
              dataField="displayName"
              error={errors.displayName}
              onChange={v => set({ displayName: v, name: v })}
              onBlur={() => blur('displayName', value.displayName ?? value.name ?? '')}
              placeholder="Kissan" />
            <FormField label="Brand Type" required dataField="brandType">
              <FormSelect value={value.brandType ?? ''} onChange={handleBrandTypeChange} hasError={!!errors.brandType}>
                <option value="">Select brand type</option>
                {BRAND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </FormSelect>
              {errors.brandType && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.brandType}</p>}
            </FormField>
            <FormField label="Sub-Type" error={errors.subType} dataField="subType">
              <FormSelect value={value.subType ?? ''} onChange={handleSubTypeChange} disabled={!value.brandType} hasError={!!errors.subType}>
                <option value="">Select sub-type</option>
                {subTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
            </FormField>
            {productCats.length > 0 && (
              <FormField label="Product Categories" className={SPAN_FULL}>
                <div className="flex flex-wrap gap-2">
                  {productCats.map(cat => {
                    const selected = (value.productCategories ?? []).includes(cat);
                    return (
                      <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-[12px] font-bold border transition-colors',
                          selected
                            ? 'border-[#299E60] bg-[#EEF8F1] text-[#299E60]'
                            : 'border-[#EEEEEE] bg-white text-gray-500 hover:border-gray-300',
                        )}>
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </FormField>
            )}
          </>
        )}

        {visibleSections.market && (
          <>
            <SectionHeader icon={Target} spanClass={SPAN_FULL}>Market Fit</SectionHeader>
            <FormField label="Business Size">
              <FormSelect value={value.businessSize ?? ''} onChange={v => set({ businessSize: v })}>
                <option value="">Select size</option>
                {BUSINESS_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
            </FormField>
            <FormField label="Distribution Presence">
              <FormSelect value={value.distributionPresence ?? ''} onChange={v => set({ distributionPresence: v })}>
                <option value="">Select presence</option>
                {DISTRIBUTION_PRESENCE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </FormSelect>
            </FormField>
            <FormField label="HoReCa Focused">
              <FormSelect
                value={value.horecaFocused === true ? 'yes' : value.horecaFocused === false ? 'no' : ''}
                onChange={v => set({ horecaFocused: v === 'yes' ? true : v === 'no' ? false : undefined })}
              >
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </FormSelect>
            </FormField>
            <FormField label="Retail Focused">
              <FormSelect
                value={value.retailFocused === true ? 'yes' : value.retailFocused === false ? 'no' : ''}
                onChange={v => set({ retailFocused: v === 'yes' ? true : v === 'no' ? false : undefined })}
              >
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </FormSelect>
            </FormField>
            <FormField label="Target Segments" className={SPAN_FULL}>
              <div className="flex flex-wrap gap-2">
                {TARGET_SEGMENT_PRESETS.map(seg => {
                  const selected = (value.targetSegments ?? []).includes(seg);
                  return (
                    <button key={seg} type="button" onClick={() => toggleSegment(seg)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-[12px] font-bold border transition-colors',
                        selected
                          ? 'border-[#299E60] bg-[#EEF8F1] text-[#299E60]'
                          : 'border-[#EEEEEE] bg-white text-gray-500 hover:border-gray-300',
                      )}>
                      {seg}
                    </button>
                  );
                })}
              </div>
            </FormField>
          </>
        )}

        {visibleSections.contact && (
          <>
            <SectionHeader icon={User} spanClass={SPAN_FULL}>Primary Contact</SectionHeader>
            <FormField label="Contact Name" className={SPAN_FULL} dataField="firstName">
              <div className={cn('grid gap-2', isWide ? 'grid-cols-[100px_1fr_1fr]' : 'grid-cols-[110px_1fr_1fr]')}>
                <FormSelect value={value.salutation ?? ''} onChange={v => set({ salutation: v })}>
                  <option value="">Salutation</option>
                  <option value="Mr.">Mr.</option>
                  <option value="Ms.">Ms.</option>
                  <option value="Mrs.">Mrs.</option>
                  <option value="Dr.">Dr.</option>
                </FormSelect>
                <FormInput value={value.firstName ?? ''} onChange={v => set({ firstName: v })}
                  placeholder="First Name" hasError={!!errors.firstName}
                  onBlur={() => blur('firstName', value.firstName ?? '')} />
                <FormInput value={value.lastName ?? ''} onChange={v => set({ lastName: v })}
                  placeholder="Last Name" />
              </div>
              {errors.firstName && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.firstName}</p>}
            </FormField>
            <FormField
              label={relaxedContact ? 'Mobile (optional if email provided)' : 'Mobile'}
              required={!relaxedContact}
              error={errors.phone}
              dataField="phone"
              hint={phoneLocked ? 'Verified' : undefined}
            >
              <PhoneInput
                value={value.phone ?? value.mobilePhone ?? ''}
                onChange={v => {
                  if (phoneLocked) return;
                  set({ phone: v, mobilePhone: v });
                }}
                hasError={!!errors.phone}
                onBlur={() => blur('phone', value.phone ?? value.mobilePhone ?? '')}
                disabled={phoneLocked}
              />
            </FormField>
            {visibleSections.contactEmail !== false && (
              <TextField
                label={relaxedContact ? 'Email (optional if mobile provided)' : 'Email'}
                value={value.email ?? ''}
                dataField="email"
                error={errors.email}
                hint={emailLocked ? 'Verified' : undefined}
                onChange={v => {
                  if (emailLocked) return;
                  set({ email: v });
                }}
                onBlur={() => blur('email', value.email ?? '')}
                placeholder="brand@company.com"
                disabled={emailLocked}
              />
            )}
          </>
        )}

        {visibleSections.auth && showPassword && onPasswordChange && (
          <>
            <SectionHeader icon={User} spanClass={SPAN_FULL}>Owner Account</SectionHeader>
            <FormField label="Password" required error={errors.password} dataField="password">
              <PasswordInput
                value={password}
                onChange={onPasswordChange}
                placeholder="Min 6 characters"
                hasError={!!errors.password}
                autoComplete="new-password"
                onBlur={() => blur('password', password)}
              />
            </FormField>
          </>
        )}

        {visibleSections.tax && (
          <>
            <SectionHeader icon={Building2} spanClass={SPAN_FULL}>Tax</SectionHeader>
            <TextField label="GSTIN (optional)" value={value.gstin ?? ''} maxLength={15}
              dataField="gstin"
              placeholder="22ABCDE1234F1Z5" error={errors.gstin}
              onChange={v => set({ gstin: v.toUpperCase().slice(0, 15) })}
              onBlur={() => blur('gstin', value.gstin ?? '')} />
          </>
        )}

        {visibleSections.address && (
          visibleSections.tax ? (
            <CollapsibleSection id="brand-address" title="Location" icon={MapPin}
              defaultOpen={locationFieldErrors}
              forceOpen={locationFieldErrors}
              spanClass={SPAN_FULL}>
              {addressContent}
            </CollapsibleSection>
          ) : (
            <>
              <SectionHeader icon={MapPin} spanClass={SPAN_FULL}>Location</SectionHeader>
              <div className={SPAN_FULL}>{addressContent}</div>
            </>
          )
        )}

        {visibleSections.marketing && (
          <>
            <SectionHeader icon={Globe} spanClass={SPAN_FULL}>Portal Marketing</SectionHeader>
            <TextField label="Website" value={value.website ?? ''}
              onChange={v => set({ website: v })} placeholder="https://brand.in" />
            <TextField label="Tagline" value={value.tagline ?? ''}
              onChange={v => set({ tagline: v })} placeholder="Taste the difference" />
            <FormField label="Description" className={SPAN_FULL}>
              <FormTextarea value={value.description ?? ''} onChange={v => set({ description: v })}
                placeholder="Brief description of the brand..." rows={2} />
            </FormField>
          </>
        )}

        {visibleSections.ops && (
          <>
            <SectionHeader icon={ShieldCheck} spanClass={SPAN_FULL}>Admin Operations</SectionHeader>
            <FormField label="Brand Tier">
              <FormSelect value={value.brandTier ?? ''} onChange={v => set({ brandTier: v })}>
                <option value="">Select tier</option>
                {BRAND_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </FormSelect>
            </FormField>
            <FormField label="Marketplace Visibility">
              <FormSelect value={value.marketplaceVisibility ?? ''} onChange={v => set({ marketplaceVisibility: v })}>
                <option value="">Select visibility</option>
                {MARKETPLACE_VISIBILITY_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </FormSelect>
            </FormField>
            <FormField label="Lead Status">
              <FormSelect value={value.leadStatus ?? ''} onChange={v => set({ leadStatus: v })}>
                <option value="">Select status</option>
                {BRAND_LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </FormSelect>
            </FormField>
            <FormField label="Credit Support">
              <div className="flex gap-4 h-[44px] items-center">
                <label className="flex items-center gap-2 text-[14px] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.creditSupport === true}
                    onChange={e => set({ creditSupport: e.target.checked })}
                    className="accent-[#299E60] w-4 h-4"
                  />
                  Enable DiSCCO credit for this brand
                </label>
              </div>
            </FormField>
            <FormField label="Internal Remarks" className={SPAN_FULL}>
              <FormTextarea value={value.remarks ?? ''} onChange={v => set({ remarks: v })}
                placeholder="Notes for your team only — not shown to the brand owner" rows={2} />
            </FormField>
          </>
        )}
      </div>
    </div>
  );
}

export { validateFieldBlur as validateBrandFieldBlur };
