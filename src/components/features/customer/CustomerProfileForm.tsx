'use client';

/**
 * Shared customer profile form sections — used by register, admin modal, add-business modal.
 * All sections share the same labels, grid, and form tokens from @/components/ui/form.
 */

import React, { useState } from 'react';
import {
  Building2, MapPin, ShieldCheck, User, Receipt, ChevronDown, ChevronUp, Check, Plus, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddressAutocomplete, type AddressPickPayload } from '@/components/ui/AddressAutocomplete';
import {
  FormField, FormInput, FormSelect, FormTextarea, TextField, PhoneInput, SectionLabel, inputClass,
  PasswordInput, PasswordToggleButton,
} from '@/components/ui/form';
import {
  SALUTATIONS, GST_TREATMENTS, PAYMENT_TERMS, LANGUAGES, INDIAN_STATES,
  BUSINESS_SIZES, BUSINESS_STRUCTURES, SERVICE_MODELS, MONTHLY_PURCHASE_BANDS,
  PROCUREMENT_FREQUENCIES, LEAD_STATUSES, CREDIT_TYPES, CUSTOMER_BUSINESS_TYPES,
  subTypesForBusinessType, cuisinesForSubType, defaultOutletName,
} from '@/lib/constants/customerProfile';
import { validateFieldBlur, type CustomerProfileInput } from '@/lib/validators/customer-profile';
import { derivedDisplayName, derivedLegalName } from '@/lib/validators/customer-profile';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';

export interface ContactPerson {
  salutation?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  workPhone?: string;
  mobile?: string;
  designation?: string;
  isPrimary?: boolean;
}

export type CustomerProfileValues = CustomerProfileInput & {
  contactPersons?: ContactPerson[];
};

export interface VisibleSections {
  contact?: boolean;
  business?: boolean;
  auth?: boolean;
  tax?: boolean;
  address?: boolean;
  admin?: boolean;
  contacts?: boolean;
  remarks?: boolean;
}

export interface CustomerProfileFormProps {
  value: CustomerProfileValues;
  onChange: (patch: Partial<CustomerProfileValues>) => void;
  errors?: Record<string, string>;
  onFieldBlur?: (field: string, value: string) => void;
  visibleSections?: VisibleSections;
  collapsedSections?: ('tax' | 'address')[];
  /** Show password field (register + admin create). */
  showPassword?: boolean;
  password?: string;
  onPasswordChange?: (v: string) => void;
  showPasswordToggle?: boolean;
  passwordVisible?: boolean;
  onTogglePassword?: () => void;
  contactPersons?: ContactPerson[];
  onContactPersonsChange?: (contacts: ContactPerson[]) => void;
  className?: string;
  /** wide = 3-column grid on large screens — used on /register to reduce form height */
  layout?: 'default' | 'wide';
}

function SectionHeader({ icon: Icon, children, spanClass }: { icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode; spanClass: string }) {
  return (
    <h4 className={cn('text-[11px] font-bold text-[#AEAEAE] pb-1.5 border-b border-gray-50 uppercase tracking-wider flex items-center gap-1.5', spanClass)}>
      <Icon size={13} className="text-gray-400" />
      {children}
    </h4>
  );
}

function CollapsibleSection({
  id, title, icon, defaultOpen, children, spanClass,
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
  spanClass?: string;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const Icon = icon;
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

export function CustomerProfileForm({
  value,
  onChange,
  errors = {},
  onFieldBlur,
  visibleSections = {
    contact: true, business: true, auth: true, tax: true, address: true,
  },
  collapsedSections = [],
  showPassword,
  password = '',
  onPasswordChange,
  showPasswordToggle,
  passwordVisible,
  onTogglePassword,
  contactPersons = [],
  onContactPersonsChange,
  className,
  layout = 'default',
}: CustomerProfileFormProps) {
  const set = (patch: Partial<CustomerProfileValues>) => onChange(patch);
  const blur = (field: string, v: string) => onFieldBlur?.(field, v);
  const isWide = layout === 'wide';
  const relaxedContact = isRegisterEmailOtpEnabled();
  const GRID = isWide
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3'
    : 'grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4';
  const SPAN_FULL = isWide ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-2';
  const SPAN_TWO = isWide ? 'sm:col-span-2' : 'sm:col-span-2';

  const handleBusinessTypeChange = (businessType: string) => {
    set({ businessType, subType: '', cuisine: '' });
  };

  const handleSubTypeChange = (subType: string) => {
    set({ subType, cuisine: '' });
  };

  const handleAddressPick = (place: AddressPickPayload) => {
    const legal = derivedLegalName(value);
    const display = derivedDisplayName(value);
    const patch: Partial<CustomerProfileValues> = {
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
    if (!value.outletName?.trim() && place.businessName) {
      patch.outletName = `${place.businessName} Outlet`;
    } else if (!value.outletName?.trim() && (display || legal)) {
      patch.outletName = defaultOutletName(display, legal);
    }
    set(patch);
  };

  const subTypes = subTypesForBusinessType(value.businessType ?? '');
  const cuisines = cuisinesForSubType(value.businessType ?? '', value.subType ?? '');

  const taxContent = (
    <div className={GRID}>
      <FormField label="GST Treatment">
        <FormSelect value={value.gstTreatment ?? ''} onChange={v => set({ gstTreatment: v })}>
          {GST_TREATMENTS.map(g => <option key={g.v || 'empty'} value={g.v}>{g.label}</option>)}
        </FormSelect>
      </FormField>
      <FormField label="Place of Supply">
        <FormSelect value={value.placeOfSupply ?? ''} onChange={v => set({ placeOfSupply: v })}>
          <option value="">Select state</option>
          {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </FormSelect>
      </FormField>
      <TextField label="GSTIN (optional)" value={value.gstin ?? ''} maxLength={15} placeholder="22ABCDE1234F1Z5"
        error={errors.gstin}
        onChange={v => set({ gstin: v.toUpperCase().slice(0, 15) })}
        onBlur={() => blur('gstin', value.gstin ?? '')} />
      <TextField label="PAN (optional)" value={value.pan ?? ''} maxLength={10} placeholder="ABCDE1234F"
        error={errors.pan}
        onChange={v => set({ pan: v.toUpperCase().slice(0, 10) })}
        onBlur={() => blur('pan', value.pan ?? '')} />
      <TextField label="FSSAI (optional)" value={value.fssaiNumber ?? ''} maxLength={14} placeholder="14-digit license"
        inputMode="numeric" onChange={v => set({ fssaiNumber: v.replace(/\D/g, '').slice(0, 14) })} />
    </div>
  );

  const addressContent = (
    <div className="space-y-4">
      <AddressAutocomplete
        label="Search address or place name"
        placeholder="e.g. Vashi Rockville Diner..."
        businessMode
        hint="Selecting a place from maps auto-fills the coordinates, address, and city for you."
        onPick={handleAddressPick}
      />
      <TextField label="Primary Branch / Outlet name" required value={value.outletName ?? ''}
        error={errors.outletName}
        onChange={v => set({ outletName: v })}
        placeholder="e.g. Rockville Vashi Branch" />
      <TextField label="Address Line" required value={value.addressLine ?? value.billingAddressLine ?? ''}
        error={errors.addressLine}
        onChange={v => set({ addressLine: v, billingAddressLine: v })}
        placeholder="Building, street, area" />
      <div className={GRID}>
        <TextField label="Address Line 2 (optional)" value={value.flatInfo ?? ''}
          onChange={v => set({ flatInfo: v })} placeholder="e.g. Flat 12A, near metro station" />
        <TextField label="Pincode" value={value.pincode ?? value.billingPincode ?? ''} maxLength={6}
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
      {(visibleSections.contact || visibleSections.business || visibleSections.auth) && (
        <div className={cn(GRID, 'space-y-0')}>
          {visibleSections.contact && (
            <>
              <SectionHeader icon={User} spanClass={SPAN_FULL}>Primary Contact</SectionHeader>
              <FormField label="Primary Contact" className={SPAN_FULL}>
                <div className={cn('grid gap-2', isWide ? 'grid-cols-[100px_1fr_1fr_1fr]' : 'grid-cols-[110px_1fr_1fr]')}>
                  <FormSelect value={value.salutation ?? ''} onChange={v => set({ salutation: v })}>
                    {SALUTATIONS.map(s => <option key={s || 'empty'} value={s}>{s || 'Salutation'}</option>)}
                  </FormSelect>
                  <FormInput value={value.firstName ?? ''} onChange={v => set({ firstName: v })} placeholder="First Name"
                    hasError={!!errors.firstName} />
                  <FormInput value={value.lastName ?? ''} onChange={v => set({ lastName: v })} placeholder="Last Name" />
                  {isWide && (
                    <FormInput value={value.designation ?? ''} onChange={v => set({ designation: v })}
                      placeholder="Designation (optional)" />
                  )}
                </div>
                {errors.firstName && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.firstName}</p>}
              </FormField>
              {!isWide && (
                <TextField label="Designation (optional)" value={value.designation ?? ''}
                  onChange={v => set({ designation: v })} placeholder="e.g. Procurement Manager" />
              )}
            </>
          )}

          {visibleSections.business && (
            <>
              <SectionHeader icon={Building2} spanClass={SPAN_FULL}>Business Identity</SectionHeader>
              <TextField label="Legal Business Name" required value={value.legalName ?? value.companyName ?? ''}
                error={errors.legalName}
                onChange={v => set({ legalName: v, companyName: v })}
                placeholder="Restaurant / hotel / company" />
              <TextField label="Trade Name / Display Name" hint="Shown on invoices & lists"
                value={value.displayName ?? ''} onChange={v => set({ displayName: v })}
                placeholder="e.g. Rockville Bar & Diner" />
              <FormField label="Business Type" required>
                <FormSelect value={value.businessType ?? ''} onChange={handleBusinessTypeChange} hasError={!!errors.businessType}>
                  <option value="">Select type</option>
                  {CUSTOMER_BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </FormSelect>
                {errors.businessType && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.businessType}</p>}
              </FormField>
              <FormField label="Sub-Type">
                <FormSelect value={value.subType ?? ''} onChange={handleSubTypeChange} disabled={!value.businessType}>
                  <option value="">Select sub-type</option>
                  {subTypes.map(s => <option key={s} value={s}>{s}</option>)}
                </FormSelect>
              </FormField>
              <FormField label="Cuisine / Category" className={SPAN_TWO}>
                {cuisines.length > 0 ? (
                  <FormSelect value={value.cuisine ?? ''} onChange={v => set({ cuisine: v })} disabled={!value.subType}>
                    <option value="">Select cuisine</option>
                    {cuisines.map(c => <option key={c} value={c}>{c}</option>)}
                  </FormSelect>
                ) : (
                  <FormInput value={value.cuisine ?? ''} onChange={v => set({ cuisine: v })} placeholder="e.g. Japanese / Pan Asian" />
                )}
              </FormField>
            </>
          )}

          {visibleSections.auth && (
            <>
              <SectionHeader icon={User} spanClass={SPAN_FULL}>Contact &amp; Login</SectionHeader>
              <TextField label={relaxedContact ? 'Email (optional if mobile provided)' : 'Email (optional)'} type="email" value={value.email ?? ''}
                error={errors.email} onChange={v => set({ email: v })} placeholder="you@example.com" />
              <FormField label={relaxedContact ? 'Mobile (optional if email provided)' : 'Mobile'} required={!relaxedContact} error={errors.phone}>
                <PhoneInput value={value.phone ?? value.mobilePhone ?? ''}
                  onChange={v => set({ phone: v, mobilePhone: v })} />
              </FormField>
              <FormField label="Work Phone (optional)">
                <PhoneInput value={value.workPhone ?? ''} onChange={v => set({ workPhone: v })} placeholder="Work phone" />
              </FormField>
              {showPassword && onPasswordChange && (
                <FormField label="Password" hint="optional — skip OTP next time" className={SPAN_TWO}
                  error={errors.password}>
                  {showPasswordToggle ? (
                    <PasswordInput value={password} onChange={onPasswordChange}
                      placeholder="At least 6 characters" autoComplete="new-password"
                      hasError={!!errors.password} />
                  ) : (
                    <FormInput type={passwordVisible ? 'text' : 'password'} value={password}
                      onChange={onPasswordChange} placeholder="At least 6 characters" autoComplete="new-password"
                      hasError={!!errors.password}
                      rightSlot={onTogglePassword ? (
                        <PasswordToggleButton visible={!!passwordVisible} onToggle={onTogglePassword}
                          className="static translate-y-0" />
                      ) : undefined} />
                  )}
                </FormField>
              )}
            </>
          )}
        </div>
      )}

      {isWide && collapsedSections.includes('tax') && collapsedSections.includes('address')
        && visibleSections.tax && visibleSections.address ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CollapsibleSection id="tax-section" title="Tax & Compliance (optional)" icon={Receipt} defaultOpen={false}>
            {taxContent}
          </CollapsibleSection>
          <CollapsibleSection id="address-section" title="Primary Branch / Location (optional)" icon={MapPin} defaultOpen={false}>
            {addressContent}
          </CollapsibleSection>
        </div>
      ) : (
        <>
      {visibleSections.tax && (
        collapsedSections.includes('tax') ? (
          <CollapsibleSection id="tax-section" title="Tax & Compliance (optional)" icon={Receipt} defaultOpen={false} spanClass={SPAN_FULL}>
            {taxContent}
          </CollapsibleSection>
        ) : (
          <div className="space-y-4">
            <SectionHeader icon={Receipt} spanClass={SPAN_FULL}>Tax &amp; Compliance</SectionHeader>
            {taxContent}
          </div>
        )
      )}

      {visibleSections.address && (
        collapsedSections.includes('address') ? (
          <CollapsibleSection id="address-section" title="Primary Branch / Location (optional)" icon={MapPin} defaultOpen={false} spanClass={SPAN_FULL}>
            {addressContent}
          </CollapsibleSection>
        ) : (
          <div className="space-y-4">
            <SectionHeader icon={MapPin} spanClass={SPAN_FULL}>Primary Branch / Location</SectionHeader>
            {addressContent}
          </div>
        )
      )}
        </>
      )}

      {visibleSections.admin && (
        <div className={GRID}>
          <SectionHeader icon={ShieldCheck} spanClass={SPAN_FULL}>Admin &amp; Operations</SectionHeader>
          <FormField label="Customer Type" className={SPAN_FULL}>
            <div className="flex gap-6 h-[44px] items-center">
              {(['business', 'individual'] as const).map(t => (
                <label key={t} className="flex items-center gap-2 text-[14px] font-medium text-[#181725] cursor-pointer">
                  <input type="radio" checked={(value.customerType ?? 'business') === t}
                    onChange={() => set({ customerType: t })} className="accent-[#299E60]" />
                  {t === 'business' ? 'Business' : 'Individual'}
                </label>
              ))}
            </div>
          </FormField>
          <FormField label="Customer Language">
            <FormSelect value={value.customerLanguage ?? 'en'} onChange={v => set({ customerLanguage: v })}>
              {LANGUAGES.map(l => <option key={l.v} value={l.v}>{l.label}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Credit Limit">
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-[13px] font-bold text-gray-400 z-10">₹</span>
              <input type="number" value={value.creditLimit ?? ''}
                onChange={e => set({ creditLimit: e.target.value })}
                placeholder="0.00" className={inputClass(false, 'pl-8')} />
            </div>
          </FormField>
          <FormField label="Payment Terms">
            <FormSelect value={value.paymentTerms ?? 'due_on_receipt'} onChange={v => set({ paymentTerms: v })}>
              {PAYMENT_TERMS.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Tax Preference">
            <div className="flex gap-6 h-[44px] items-center">
              {([['taxable', 'Taxable'], ['exempt', 'Tax Exempt']] as const).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-[14px] font-medium text-[#181725] cursor-pointer">
                  <input type="radio" checked={(value.taxPreference ?? 'taxable') === v}
                    onChange={() => set({ taxPreference: v })} className="accent-[#299E60]" />{l}
                </label>
              ))}
            </div>
          </FormField>
          <FormField label="Portal Access">
            <label className="flex items-center gap-2 h-[44px] text-[14px] font-medium text-[#181725] cursor-pointer">
              <input type="checkbox" checked={!!value.enablePortal}
                onChange={e => set({ enablePortal: e.target.checked })} className="accent-[#299E60] w-4 h-4" />
              Allow portal access
            </label>
          </FormField>
          <FormField label="Business Size">
            <FormSelect value={value.businessSize ?? ''} onChange={v => set({ businessSize: v })}>
              <option value="">Select size</option>
              {BUSINESS_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Business Structure">
            <FormSelect value={value.businessStructure ?? ''} onChange={v => set({ businessStructure: v })}>
              <option value="">Select structure</option>
              {BUSINESS_STRUCTURES.map(s => <option key={s} value={s}>{s}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Service Model">
            <FormSelect value={value.serviceModel ?? ''} onChange={v => set({ serviceModel: v })}>
              <option value="">Select model</option>
              {SERVICE_MODELS.map(s => <option key={s} value={s}>{s}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Monthly Purchase Band">
            <FormSelect value={value.monthlyPurchaseBand ?? ''} onChange={v => set({ monthlyPurchaseBand: v })}>
              <option value="">Select band</option>
              {MONTHLY_PURCHASE_BANDS.map(s => <option key={s} value={s}>{s}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Procurement Frequency">
            <FormSelect value={value.procurementFrequency ?? ''} onChange={v => set({ procurementFrequency: v })}>
              <option value="">Select frequency</option>
              {PROCUREMENT_FREQUENCIES.map(s => <option key={s} value={s}>{s}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Lead Status">
            <FormSelect value={value.leadStatus ?? ''} onChange={v => set({ leadStatus: v })}>
              <option value="">Select status</option>
              {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Credit Type">
            <FormSelect value={value.creditType ?? ''} onChange={v => set({ creditType: v })}>
              <option value="">Select type</option>
              {CREDIT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </FormSelect>
          </FormField>
        </div>
      )}

      {visibleSections.contacts && onContactPersonsChange && (
        <div className="space-y-4">
          <SectionLabel>Contact Persons</SectionLabel>
          {contactPersons.length === 0 && (
            <p className="text-[13px] text-gray-400">No additional contact persons. Add people you coordinate with at this business.</p>
          )}
          {contactPersons.map((c, i) => (
            <div key={i} className="border border-[#EEEEEE] rounded-[12px] p-4 space-y-3 relative">
              <button type="button" onClick={() => onContactPersonsChange(contactPersons.filter((_, idx) => idx !== i))}
                className="absolute top-3 right-3 text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
              <div className="grid grid-cols-[100px_1fr_1fr] gap-2">
                <FormSelect value={c.salutation ?? ''} onChange={v => {
                  const next = [...contactPersons]; next[i] = { ...c, salutation: v }; onContactPersonsChange(next);
                }}>
                  {SALUTATIONS.map(s => <option key={s || 'empty'} value={s}>{s || 'Title'}</option>)}
                </FormSelect>
                <FormInput value={c.firstName ?? ''} onChange={v => {
                  const next = [...contactPersons]; next[i] = { ...c, firstName: v }; onContactPersonsChange(next);
                }} placeholder="First Name" />
                <FormInput value={c.lastName ?? ''} onChange={v => {
                  const next = [...contactPersons]; next[i] = { ...c, lastName: v }; onContactPersonsChange(next);
                }} placeholder="Last Name" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormInput value={c.email ?? ''} onChange={v => {
                  const next = [...contactPersons]; next[i] = { ...c, email: v }; onContactPersonsChange(next);
                }} placeholder="Email" />
                <FormInput value={c.designation ?? ''} onChange={v => {
                  const next = [...contactPersons]; next[i] = { ...c, designation: v }; onContactPersonsChange(next);
                }} placeholder="Designation" />
                <FormInput value={c.workPhone ?? ''} onChange={v => {
                  const next = [...contactPersons]; next[i] = { ...c, workPhone: v }; onContactPersonsChange(next);
                }} placeholder="Work Phone" />
                <FormInput value={c.mobile ?? ''} onChange={v => {
                  const next = [...contactPersons]; next[i] = { ...c, mobile: v }; onContactPersonsChange(next);
                }} placeholder="Mobile" />
              </div>
              <label className="flex items-center gap-2 text-[12px] font-medium text-gray-600 cursor-pointer">
                <input type="checkbox" checked={!!c.isPrimary}
                  onChange={e => {
                    const next = [...contactPersons]; next[i] = { ...c, isPrimary: e.target.checked }; onContactPersonsChange(next);
                  }} className="accent-[#299E60]" /> Primary contact
              </label>
            </div>
          ))}
          <button type="button" onClick={() => onContactPersonsChange([...contactPersons, { isPrimary: contactPersons.length === 0 }])}
            className="flex items-center gap-2 text-[13px] font-bold text-[#299E60] hover:underline">
            <Plus size={15} /> Add contact person
          </button>
        </div>
      )}

      {visibleSections.remarks && (
        <FormField label="Remarks" hint="Internal — not shown to the customer">
          <FormTextarea value={value.remarks ?? ''} onChange={v => set({ remarks: v })} rows={5}
            placeholder="Notes about this customer…" />
        </FormField>
      )}
    </div>
  );
}

export { EMPTY_CUSTOMER_PROFILE } from './customerProfileDefaults';
