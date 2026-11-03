'use client';

/**
 * Shared customer profile form sections — used by register, admin modal, add-business modal.
 * All sections share the same labels, grid, and form tokens from @/components/ui/form.
 */

import React, { useState } from 'react';
import {
  Building2, MapPin, ShieldCheck, User, Receipt, ChevronDown, ChevronUp, Plus, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutletAddressForm, type OutletAddressValue } from '@/components/features/customer/OutletAddressForm';
import {
  FormField, FormInput, FormSelect, FormTextarea, TextField, PhoneInput, SectionLabel, inputClass,
  PasswordInput, PasswordToggleButton,
} from '@/components/ui/form';
import {
  SALUTATIONS, GST_TREATMENTS, PAYMENT_TERMS, LANGUAGES, INDIAN_STATES,
  BUSINESS_SIZES, CUSTOMER_BUSINESS_TYPES,
  subTypesForBusinessType, cuisinesForSubType,
} from '@/lib/constants/customerProfile';
import { validateFieldBlur, type CustomerProfileInput } from '@/lib/validators/customer-profile';
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
  layout?: 'default' | 'wide' | 'modal';
  /** Slim 6-field customer signup. Default keeps the full admin / add-business form. */
  mode?: 'register' | 'full';
  /** Hide first/last/legal/display/mobile/email — they were collected at signup. */
  omitCoreFields?: boolean;
  /** One contact-person field. Register and admin create use this. */
  singleContact?: boolean;
}

const TYPE_MY_OWN = '__type_my_own__';

/**
 * Preset dropdown plus "Type my own". A saved value that is not in the list
 * opens the text box so it can be edited instead of disappearing.
 */
function SelectOrOwn({
  label,
  required,
  error,
  value,
  presets,
  disabled,
  placeholder,
  className,
  onPick,
  onType,
}: {
  label: string;
  required?: boolean;
  error?: string;
  value: string;
  presets: readonly string[];
  disabled?: boolean;
  placeholder: string;
  className?: string;
  /** A list choice, or switching into the text box (empty string). Clears dependents. */
  onPick: (next: string) => void;
  /** Keystrokes in the custom box. Does not clear the fields below. */
  onType: (next: string) => void;
}) {
  const current = value.trim();
  const presetKey = presets.join('\n');
  const [track, setTrack] = useState({ presetKey, mode: 'auto' as 'auto' | 'own' | 'list' });
  if (track.presetKey !== presetKey) {
    setTrack({ presetKey, mode: 'auto' });
  }
  const mode = track.presetKey === presetKey ? track.mode : 'auto';
  const inList = current !== '' && presets.includes(current);
  // No presets (custom business type) means the only useful choice is typing.
  const own = !disabled && (
    presets.length === 0
    || mode === 'own'
    || (mode === 'auto' && current !== '' && !inList)
  );

  return (
    <FormField label={label} required={required} error={error} className={className}>
      <FormSelect
        value={own ? TYPE_MY_OWN : current}
        disabled={disabled}
        hasError={!!error}
        onChange={(next) => {
          if (next === TYPE_MY_OWN) {
            setTrack({ presetKey, mode: 'own' });
            onPick('');
            return;
          }
          setTrack({ presetKey, mode: 'list' });
          onPick(next);
        }}
      >
        <option value="">Select</option>
        {presets.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
        <option value={TYPE_MY_OWN}>Type my own</option>
      </FormSelect>
      {own && (
        <FormInput
          value={value}
          onChange={(next) => {
            setTrack({ presetKey, mode: 'own' });
            onType(next);
          }}
          placeholder={placeholder}
          hasError={!!error}
          className="mt-2"
        />
      )}
    </FormField>
  );
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
          <Icon size={16} className="text-primary" />
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
  mode = 'full',
  omitCoreFields = false,
  singleContact = false,
}: CustomerProfileFormProps) {
  const set = (patch: Partial<CustomerProfileValues>) => onChange(patch);
  const blur = (field: string, v: string) => onFieldBlur?.(field, v);
  const isWide = layout === 'wide';
  const isModal = layout === 'modal';
  const relaxedContact = isRegisterEmailOtpEnabled() && mode !== 'register' && !omitCoreFields;
  const [sameAsBilling, setSameAsBilling] = useState(() => {
    const bill = (value.billingAddressLine ?? '').trim();
    const delivery = (value.addressLine ?? '').trim();
    return !delivery || !bill || delivery === bill;
  });
  const GRID = isModal
    ? 'flex flex-col gap-4 min-w-0'
    : isWide
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3'
      : 'grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4';
  const SPAN_FULL = isModal ? 'w-full min-w-0' : isWide ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-2';
  const SPAN_TWO = isModal ? 'w-full min-w-0' : isWide ? 'sm:col-span-2' : 'sm:col-span-2';

  const handleBusinessTypePick = (businessType: string) => {
    set({ businessType, subType: '', cuisine: '' });
  };

  const handleSubTypePick = (subType: string) => {
    set({ subType, cuisine: '' });
  };

  const businessTypes = CUSTOMER_BUSINESS_TYPES;
  const subTypes = subTypesForBusinessType(value.businessType ?? '');
  const cuisineOptions = cuisinesForSubType(value.businessType ?? '', value.subType ?? '');

  if (mode === 'register') {
    return (
      <div className={cn(GRID, 'space-y-0', className)}>
        <div data-field="legalName">
          <TextField
            label="Restaurant / Business Name"
            required
            value={value.legalName ?? value.companyName ?? ''}
            error={errors.legalName}
            onChange={v =>
              set({
                legalName: v,
                companyName: v,
                // Keep display name in sync unless the user already customized it.
                displayName:
                  !value.displayName || value.displayName === (value.legalName ?? value.companyName)
                    ? v
                    : value.displayName,
              })
            }
            placeholder="Restaurant / hotel / company"
          />
        </div>
        <div data-field="firstName">
          <TextField
            label="Contact person"
            required
            value={[value.firstName, value.lastName].filter(Boolean).join(' ')}
            error={errors.firstName}
            onChange={v => set({ firstName: v, lastName: '' })}
            placeholder="Name of the person we should call"
          />
        </div>
        <div data-field="phone">
          <FormField label="Mobile Number" required error={errors.phone}>
            <PhoneInput
              value={value.phone ?? value.mobilePhone ?? ''}
              onChange={v => set({ phone: v, mobilePhone: v })}
              hasError={!!errors.phone}
            />
          </FormField>
        </div>
        <div data-field="pincode">
          <TextField
            label="Pincode"
            required
            value={value.pincode ?? value.billingPincode ?? ''}
            error={errors.pincode}
            onChange={v => {
              const digits = v.replace(/\D/g, '').slice(0, 6);
              set({ pincode: digits, billingPincode: digits });
            }}
            placeholder="6-digit delivery pincode"
            maxLength={6}
            inputMode="numeric"
          />
        </div>
        <div data-field="email">
          <TextField
            label="Email (optional)"
            type="email"
            value={value.email ?? ''}
            error={errors.email}
            onChange={v => set({ email: v })}
            placeholder="you@example.com"
          />
        </div>
      </div>
    );
  }

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

  const businessLabel = value.displayName || value.legalName || value.companyName || '';
  const addressValue: OutletAddressValue = {
    outletName: value.outletName ?? '',
    billingName: value.billingName ?? businessLabel,
    billingAddressLine: value.billingAddressLine ?? '',
    billingCity: value.billingCity ?? '',
    billingState: value.billingState ?? '',
    billingPincode: value.billingPincode ?? '',
    sameAsBilling,
    addressLine: value.addressLine ?? '',
    city: value.city ?? '',
    state: value.state ?? '',
    pincode: value.pincode ?? '',
  };
  const addressContent = (
    <OutletAddressForm
      value={addressValue}
      businessName={businessLabel}
      errors={errors}
      onChange={(next) => {
        setSameAsBilling(next.sameAsBilling);
        set({
          outletName: next.outletName,
          billingName: next.billingName,
          billingAddressLine: next.billingAddressLine,
          billingCity: next.billingCity,
          billingState: next.billingState,
          billingPincode: next.billingPincode,
          addressLine: next.addressLine,
          city: next.city,
          state: next.state,
          pincode: next.pincode,
        });
      }}
    />
  );

  return (
    <div className={cn(isModal ? 'space-y-4 min-w-0' : isWide ? 'space-y-4' : 'space-y-5', className)}>
      {(visibleSections.contact || visibleSections.business || visibleSections.auth) && (
        <div className={cn(GRID, 'space-y-0')}>
          {isModal && !omitCoreFields && visibleSections.contact && visibleSections.business ? (
            <>
              <TextField
                label="Contact person"
                required
                dataField="firstName"
                value={[value.firstName, value.lastName].filter(Boolean).join(' ')}
                error={errors.firstName}
                onChange={v => set({ firstName: v, lastName: '' })}
                onBlur={() => blur('firstName', value.firstName ?? '')}
                placeholder="Name of the person we should call"
              />
              <div data-field="legalName">
                <TextField label="Legal Business Name" required value={value.legalName ?? value.companyName ?? ''}
                  error={errors.legalName}
                  onChange={v => set({ legalName: v, companyName: v })}
                  placeholder="Restaurant / hotel / company" />
              </div>
              <TextField label="Display Name" required hint="Shown on invoices & lists"
                value={value.displayName ?? ''} error={errors.displayName}
                onChange={v => set({ displayName: v })}
                onBlur={() => blur('displayName', value.displayName ?? '')}
                placeholder="e.g. Rockville Bar & Diner" />
              <FormField label="Mobile" required className={SPAN_FULL} dataField="phone" error={errors.phone}>
                <PhoneInput
                  value={value.phone ?? value.mobilePhone ?? ''}
                  onChange={v => set({ phone: v, mobilePhone: v })}
                  hasError={!!errors.phone}
                />
              </FormField>
              <TextField
                label="Email (optional)"
                type="email"
                dataField="email"
                value={value.email ?? ''}
                error={errors.email}
                onChange={v => set({ email: v })}
                placeholder="you@example.com"
              />
              <TextField
                label="Designation (optional)"
                value={value.designation ?? ''}
                onChange={v => set({ designation: v })}
                placeholder="e.g. Procurement Manager"
              />
              <SectionHeader icon={Building2} spanClass={SPAN_FULL}>Business Identity</SectionHeader>
            </>
          ) : (
          <>
          {visibleSections.contact && (
            <>
              <SectionHeader icon={User} spanClass={SPAN_FULL}>Primary Contact</SectionHeader>
              {omitCoreFields ? (
                <>
                  <FormField label="Salutation">
                    <FormSelect value={value.salutation ?? ''} onChange={v => set({ salutation: v })}>
                      {SALUTATIONS.map(s => <option key={s || 'empty'} value={s}>{s || 'Salutation'}</option>)}
                    </FormSelect>
                  </FormField>
                  <TextField label="Designation (optional)" value={value.designation ?? ''}
                    onChange={v => set({ designation: v })} placeholder="e.g. Procurement Manager" />
                </>
              ) : (
                <>
                  <FormField label="Contact person" className={SPAN_FULL}>
                    {singleContact ? (
                      <div data-field="firstName">
                        <FormInput
                          value={[value.firstName, value.lastName].filter(Boolean).join(' ')}
                          onChange={v => set({ firstName: v, lastName: '' })}
                          placeholder="Name of the person we should call"
                          hasError={!!errors.firstName}
                        />
                      </div>
                    ) : (
                    <div data-field="firstName" className={cn('grid gap-2 min-w-0', isWide ? 'grid-cols-[100px_1fr_1fr_1fr]' : 'grid-cols-[110px_1fr_1fr]')}>
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
                    )}
                    {errors.firstName && <p className="text-[11px] text-red-600 font-medium mt-1">{errors.firstName}</p>}
                  </FormField>
                  {!isWide && (
                    <TextField label="Designation (optional)" value={value.designation ?? ''}
                      onChange={v => set({ designation: v })} placeholder="e.g. Procurement Manager" />
                  )}
                </>
              )}
            </>
          )}

          {visibleSections.business && (
            <>
              <SectionHeader icon={Building2} spanClass={SPAN_FULL}>Business Identity</SectionHeader>
              {!omitCoreFields && (
                <>
                  <div data-field="legalName">
                    <TextField label="Legal Business Name" required value={value.legalName ?? value.companyName ?? ''}
                      error={errors.legalName}
                      onChange={v => set({ legalName: v, companyName: v })}
                      placeholder="Restaurant / hotel / company" />
                  </div>
                  <TextField label="Display Name" required={isModal} hint="Shown on invoices & lists"
                    value={value.displayName ?? ''} error={errors.displayName}
                    onChange={v => set({ displayName: v })}
                    onBlur={() => blur('displayName', value.displayName ?? '')}
                    placeholder="e.g. Rockville Bar & Diner" />
                </>
              )}
              </>
          )}
          </>
          )}

          {visibleSections.business && (
            <>
              <div data-field="businessType">
                <SelectOrOwn
                  label="Business Type"
                  required
                  error={errors.businessType}
                  value={value.businessType ?? ''}
                  presets={businessTypes}
                  placeholder="Type your business type"
                  onPick={handleBusinessTypePick}
                  onType={(businessType) => set({ businessType })}
                />
              </div>
              <SelectOrOwn
                label="Sub-Type"
                value={value.subType ?? ''}
                presets={subTypes}
                disabled={!value.businessType}
                placeholder="Type your sub-type"
                onPick={handleSubTypePick}
                onType={(subType) => set({ subType })}
              />
              <SelectOrOwn
                label="Cuisine / Category"
                value={value.cuisine ?? ''}
                presets={cuisineOptions}
                disabled={!value.subType}
                placeholder="Type your cuisine"
                onPick={(cuisine) => set({ cuisine })}
                onType={(cuisine) => set({ cuisine })}
              />
              <FormField label="Business Size">
                <FormSelect value={value.businessSize ?? ''} onChange={v => set({ businessSize: v })}>
                  <option value="">Select size</option>
                  {BUSINESS_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </FormSelect>
              </FormField>
            </>
          )}

          {visibleSections.auth && (
            <>
              <SectionHeader icon={User} spanClass={SPAN_FULL}>Contact &amp; Login</SectionHeader>
              {!omitCoreFields && (
                <>
                  <div data-field="email">
                    <TextField label={relaxedContact ? 'Email (optional if mobile provided)' : 'Email (optional)'} type="email" value={value.email ?? ''}
                      error={errors.email} onChange={v => set({ email: v })} placeholder="you@example.com" />
                  </div>
                  <div data-field="phone">
                    <FormField label={relaxedContact ? 'Mobile (optional if email provided)' : 'Mobile'} required={!relaxedContact} error={errors.phone}>
                      <PhoneInput value={value.phone ?? value.mobilePhone ?? ''}
                        onChange={v => set({ phone: v, mobilePhone: v })} hasError={!!errors.phone} />
                    </FormField>
                  </div>
                </>
              )}
              <FormField label="Work Phone (optional)">
                <PhoneInput value={value.workPhone ?? ''} onChange={v => set({ workPhone: v })} placeholder="Work phone" />
              </FormField>
              {showPassword && onPasswordChange && (
                <div data-field="password" className="sm:col-start-1 lg:col-start-1 sm:col-span-2">
                  <FormField label="Password" hint="optional — skip OTP next time"
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
                </div>
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
          <CollapsibleSection id="address-section" title="Delivery address (optional)" icon={MapPin} defaultOpen={false}>
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
          <CollapsibleSection id="address-section" title="Delivery address (optional)" icon={MapPin} defaultOpen={false} spanClass={SPAN_FULL}>
            {addressContent}
          </CollapsibleSection>
        ) : (
          <div className="space-y-4">
            <SectionHeader icon={MapPin} spanClass={SPAN_FULL}>Delivery address</SectionHeader>
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
                    onChange={() => set({ customerType: t })} className="accent-primary" />
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
                    onChange={() => set({ taxPreference: v })} className="accent-primary" />{l}
                </label>
              ))}
            </div>
          </FormField>
          <FormField label="Portal Access">
            <label className="flex items-center gap-2 h-[44px] text-[14px] font-medium text-[#181725] cursor-pointer">
              <input type="checkbox" checked={!!value.enablePortal}
                onChange={e => set({ enablePortal: e.target.checked })} className="accent-primary w-4 h-4" />
              Allow portal access
            </label>
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
              <div className={cn('grid gap-2 min-w-0', isModal ? 'grid-cols-1' : 'grid-cols-[100px_1fr_1fr]')}>
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
                  }} className="accent-primary" /> Primary contact
              </label>
            </div>
          ))}
          <button type="button" onClick={() => onContactPersonsChange([...contactPersons, { isPrimary: contactPersons.length === 0 }])}
            className="flex items-center gap-2 text-[13px] font-bold text-primary hover:underline">
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
