'use client';

/**
 * CustomerFormModal — Zoho-style admin create/edit shell over shared CustomerProfileForm sections.
 */

import { useState } from 'react';
import { X, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FORM, FormErrorBanner, useFormFeedback } from '@/components/ui/form';
import { parseJsonResponse } from '@/lib/apiError';
import {
  CustomerProfileForm,
  type CustomerProfileValues,
  type ContactPerson,
} from '@/components/features/customer/CustomerProfileForm';
import {
  deliveryFromOutletAddress,
  OutletAddressForm,
  type OutletAddressValue,
} from '@/components/features/customer/OutletAddressForm';
import { isRealStreetAddress } from '@/lib/constants/customerProfile';
import { EMPTY_CUSTOMER_PROFILE } from '@/components/features/customer/customerProfileDefaults';
import {
  validateCustomerProfile,
  derivedFullName,
  derivedLegalName,
  primaryPhoneDigits,
} from '@/lib/validators/customer-profile';
import { buildCompanyProfile, mapToUserFields } from '@/lib/customerProfileMapper';

export interface CustomerFormInitial extends CustomerProfileValues {
  contactPersons?: ContactPerson[];
  /** Outlet being edited; without it the admin API adopts the placeholder primary or adds an outlet. */
  outletId?: string;
}

interface Props {
  mode: 'create' | 'edit';
  userId?: string;
  initial?: CustomerFormInitial;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = 'overview' | 'other' | 'address' | 'contacts' | 'remarks';
type CreateStep = 'account' | 'address' | 'profile';

const EMPTY_ADDRESS: OutletAddressValue = {
  outletName: '',
  billingName: '',
  billingAddressLine: '',
  billingCity: '',
  billingState: '',
  billingPincode: '',
  sameAsBilling: true,
  addressLine: '',
  city: '',
  state: '',
  pincode: '',
};

const CUSTOMER_FIELD_ORDER = [
  'firstName', 'legalName', 'businessType', 'phone', 'email', 'password',
  'gstin', 'pan', 'outletName', 'addressLine', 'pincode',
];

function tabForCustomerErrors(errors: Record<string, string>): Tab {
  const keys = Object.keys(errors);
  if (keys.some((k) => ['remarks', 'manualTags'].includes(k))) return 'remarks';
  if (keys.some((k) => k.startsWith('contact'))) return 'contacts';
  if (keys.some((k) => ['addressLine', 'pincode', 'city', 'state', 'outletName', 'billingPincode'].includes(k))) {
    return 'address';
  }
  if (keys.some((k) => ['gstin', 'pan', 'customerType', 'gstTreatment', 'paymentTerms', 'creditLimit', 'taxPreference'].includes(k))) {
    return 'other';
  }
  return 'overview';
}

export default function CustomerFormModal({ mode, userId, initial, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [createStep, setCreateStep] = useState<CreateStep>('account');
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<OutletAddressValue>(EMPTY_ADDRESS);
  const [submitting, setSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState<CustomerProfileValues>({
    ...EMPTY_CUSTOMER_PROFILE,
    ...initial,
  });
  const [contacts, setContacts] = useState<ContactPerson[]>(initial?.contactPersons ?? []);

  const {
    bannerError,
    fieldErrors,
    clearErrors,
    clearFieldError,
    applyApiError,
    applyValidationErrors,
  } = useFormFeedback();

  const derivedName = derivedFullName(profile);
  const primaryPhone = primaryPhoneDigits(profile);

  const switchTabForErrors = (errors: Record<string, string>) => {
    setTab(tabForCustomerErrors(errors));
  };

  const handleSubmit = async () => {
    clearErrors();
    const validation = validateCustomerProfile(
      { ...profile, password: mode === 'create' ? password : undefined },
      mode === 'create' ? 'adminCreate' : 'adminCreate',
    );
    if (!validation.success) {
      applyValidationErrors(validation.errors, validation.message, {
        fieldOrder: CUSTOMER_FIELD_ORDER,
        dataField: true,
        onFieldError: () => switchTabForErrors(validation.errors),
      });
      return;
    }
    if (!derivedName) {
      const errs = { firstName: 'Enter a display name, company name, or contact name' };
      setTab('overview');
      applyValidationErrors(errs, 'Enter a display name, company name, or contact name', {
        fieldOrder: CUSTOMER_FIELD_ORDER,
        dataField: true,
      });
      return;
    }
    if (mode === 'create') {
      const email = (profile.email ?? '').trim();
      const hasEmail = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const hasPhone = !!primaryPhone && primaryPhone.length === 10;
      if (!hasPhone && !hasEmail) {
        const errs = { phone: 'Enter a mobile number or email address', email: 'Enter a mobile number or email address' };
        setTab('overview');
        applyValidationErrors(errs, 'Enter a mobile number or email address', {
          fieldOrder: CUSTOMER_FIELD_ORDER,
          dataField: true,
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const deliveryAddress = {
        outletName: profile.outletName?.trim() || undefined,
        addressLine: profile.addressLine?.trim() || undefined,
        flatInfo: profile.flatInfo?.trim() || undefined,
        landmark: profile.landmark?.trim() || undefined,
        city: profile.city?.trim() || undefined,
        state: profile.state?.trim() || undefined,
        pincode: profile.pincode?.trim() || undefined,
        latitude: profile.latitude,
        longitude: profile.longitude,
        placeId: profile.placeId?.trim() || undefined,
      };

      const billingAddress = {
        addressLine: (profile.billingAddressLine || profile.addressLine)?.trim() || undefined,
        city: (profile.billingCity || profile.city)?.trim() || undefined,
        state: (profile.billingState || profile.state)?.trim() || undefined,
        pincode: (profile.billingPincode || profile.pincode)?.trim() || undefined,
      };

      const companyProfile = buildCompanyProfile({ ...profile, contactPersons: contacts });
      let res: Response;
      if (mode === 'create') {
        const userFields = mapToUserFields({ ...profile, password });
        res = await fetch('/api/v1/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: userFields.fullName,
            phone: userFields.phone,
            email: userFields.email || undefined,
            businessName: userFields.businessName || undefined,
            password: password || undefined,
            role: 'customer',
            deliveryAddress,
            billingAddress,
            companyProfile,
          }),
        });
      } else {
        // Same shape as CustomerDeliveryAddresses.save: billing on companyProfile,
        // delivery + Bill-To name on outlets[]. Sending deliveryAddress alone would
        // re-stamp the primary outlet and never reach the billing fields.
        const legalName = derivedLegalName(profile).trim();
        const typedBillingName = (profile.billingName ?? '').trim();
        const outletRow = {
          ...(initial?.outletId ? { id: initial.outletId } : {}),
          name: deliveryAddress.outletName ?? '',
          billingName: typedBillingName && typedBillingName !== legalName ? typedBillingName : null,
          addressLine: deliveryAddress.addressLine ?? '',
          city: deliveryAddress.city ?? null,
          state: deliveryAddress.state ?? null,
          pincode: deliveryAddress.pincode ?? null,
        };
        const hasDeliveryStreet = isRealStreetAddress(outletRow.addressLine, outletRow.name);
        res = await fetch(`/api/v1/admin/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyProfile: {
              ...companyProfile,
              billingAddressLine: billingAddress.addressLine ?? null,
              billingCity: billingAddress.city ?? null,
              billingState: billingAddress.state ?? null,
              billingPincode: billingAddress.pincode ?? null,
            },
            ...(hasDeliveryStreet ? { outlets: [outletRow] } : {}),
          }),
        });
      }
      const json = await parseJsonResponse(res);
      if (!json.success) {
        applyApiError(json, {
          fieldOrder: CUSTOMER_FIELD_ORDER,
          dataField: true,
          onFieldError: (_field, fields) => switchTabForErrors(fields),
        });
        return;
      }
      toast.success(mode === 'create' ? 'Customer created' : 'Customer updated');
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast.error(msg);
      applyValidationErrors({ _server: msg }, msg, { toast: false });
    } finally {
      setSubmitting(false);
    }
  };

  const TABS: Array<{ k: Tab; label: string }> = [
    { k: 'overview', label: 'Overview' },
    { k: 'other', label: 'Other Details' },
    { k: 'address', label: 'Address' },
    { k: 'contacts', label: `Contact Persons${contacts.length ? ` (${contacts.length})` : ''}` },
    { k: 'remarks', label: 'Remarks' },
  ];

  const tabSections: Record<Tab, Parameters<typeof CustomerProfileForm>[0]['visibleSections']> = {
    overview: { contact: true, business: true, auth: mode === 'create' },
    other: { tax: true, admin: true },
    address: { address: true },
    contacts: { contacts: true },
    remarks: { remarks: true },
  };

  const handleCreateAccount = async () => {
    clearErrors();
    const validation = validateCustomerProfile(profile, 'selfRegisterLite');
    if (!validation.success) {
      applyValidationErrors(validation.errors, validation.message, {
        fieldOrder: CUSTOMER_FIELD_ORDER,
        dataField: true,
      });
      return;
    }
    setSubmitting(true);
    try {
      const userFields = mapToUserFields(profile);
      const res = await fetch('/api/v1/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: userFields.fullName,
          phone: userFields.phone,
          email: userFields.email || undefined,
          businessName: userFields.businessName || undefined,
          pincode: userFields.pincode || undefined,
          role: 'customer',
          companyProfile: {
            legalName: userFields.businessName,
            firstName: profile.firstName,
            mobilePhone: userFields.phone,
            email: userFields.email,
            pincode: userFields.pincode,
          },
        }),
      });
      const json = await parseJsonResponse<{ success?: boolean; data?: { id?: string }; error?: { message?: string } | string }>(res);
      if (!json.success) {
        applyApiError(json, { fieldOrder: CUSTOMER_FIELD_ORDER, dataField: true });
        return;
      }
      const created = json.data;
      setCreatedUserId(created?.id ?? null);
      setAddressForm((prev) => ({
        ...prev,
        billingName: userFields.businessName || prev.billingName,
        billingPincode: userFields.pincode || prev.billingPincode,
        pincode: userFields.pincode || prev.pincode,
      }));
      toast.success('Customer created');
      setCreateStep('address');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create customer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAddress = async () => {
    if (!createdUserId) return;
    clearErrors();
    const delivery = deliveryFromOutletAddress(addressForm);
    if (addressForm.outletName.trim().length < 2 || !isRealStreetAddress(delivery.addressLine, addressForm.outletName)) {
      toast.error('Enter the outlet name and the full street address');
      return;
    }
    if (!/^\d{6}$/.test(delivery.pincode)) {
      toast.error('Enter a 6-digit pincode');
      return;
    }
    setSubmitting(true);
    try {
      // Same payload shape as CustomerDeliveryAddresses.save — the admin PATCH
      // gate only recognizes companyProfile / outlets, not deliveryAddress alone.
      const billingName =
        addressForm.billingName.trim()
        && addressForm.billingName.trim() !== (profile.legalName || profile.displayName || '').trim()
          ? addressForm.billingName.trim()
          : null;
      const res = await fetch(`/api/v1/admin/users/${createdUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyProfile: {
            billingAddressLine: addressForm.billingAddressLine.trim(),
            billingCity: addressForm.billingCity.trim(),
            billingState: addressForm.billingState.trim(),
            billingPincode: addressForm.billingPincode.trim(),
          },
          // outlets[] adopts the placeholder primary + syncs SavedAddress.
          // Do not send deliveryAddress here — it would re-stamp the primary and
          // later "Add outlet" saves used to copy the new address onto outlet #1.
          outlets: [
            {
              name: addressForm.outletName.trim(),
              billingName,
              addressLine: delivery.addressLine.trim(),
              city: delivery.city.trim() || null,
              state: delivery.state.trim() || null,
              pincode: delivery.pincode,
            },
          ],
        }),
      });
      const json = await parseJsonResponse(res);
      if (!json.success) {
        applyApiError(json, { toast: true });
        return;
      }
      setProfile((prev) => ({
        ...prev,
        outletName: addressForm.outletName.trim(),
        addressLine: delivery.addressLine.trim(),
        city: delivery.city.trim(),
        state: delivery.state.trim(),
        pincode: delivery.pincode,
        billingAddressLine: addressForm.billingAddressLine.trim(),
        billingCity: addressForm.billingCity.trim(),
        billingState: addressForm.billingState.trim(),
        billingPincode: addressForm.billingPincode.trim(),
      }));
      toast.success('Address saved');
      setCreateStep('profile');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save address');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProfile = async () => {
    if (!createdUserId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${createdUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyProfile: buildCompanyProfile({ ...profile, contactPersons: contacts }) }),
      });
      const json = await parseJsonResponse(res);
      if (!json.success) {
        applyApiError(json, { toast: true });
        return;
      }
      toast.success('Profile saved');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setSubmitting(false);
    }
  };

  const finishCreate = () => {
    onSaved();
  };

  const handleProfileChange = (patch: Partial<CustomerProfileValues>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      for (const key of Object.keys(patch)) {
        if (fieldErrors[key]) clearFieldError(key);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-[18px] shadow-2xl w-full max-w-[820px] max-h-[94vh] flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="px-7 py-4 border-b border-[#EEEEEE] flex items-center justify-between shrink-0 bg-[#FAFAFA] rounded-t-[18px]">
          <h2 className="text-[18px] font-[800] text-[#181725] tracking-tight">{mode === 'create' ? 'New Customer' : 'Edit Customer'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"><X size={18} /></button>
        </div>

        {mode === 'edit' ? (
        <div className="px-7 pt-2 border-b border-[#EEEEEE] flex gap-2 overflow-x-auto shrink-0 bg-[#FAFAFA]/50">
          {TABS.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn('px-4 py-3 text-[13.5px] font-bold whitespace-nowrap border-b-2 -mb-px transition-all duration-200',
                tab === t.k ? 'border-[#6B1D2E] text-[#6B1D2E] font-extrabold' : 'border-transparent text-gray-400 hover:text-[#181725]')}>
              {t.label}
            </button>
          ))}
        </div>
        ) : (
          <p className="px-7 py-3 text-[13px] font-extrabold text-[#6B1D2E] border-b border-[#EEEEEE]">
            {createStep === 'account' && '1 of 3 · Create the customer'}
            {createStep === 'address' && '2 of 3 · Delivery address'}
            {createStep === 'profile' && '3 of 3 · Complete the profile'}
          </p>
        )}

        <FormErrorBanner message={bannerError} className="mx-7" />

        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {mode === 'create' && createStep === 'account' && (
            <CustomerProfileForm
              value={profile}
              onChange={handleProfileChange}
              mode="register"
              layout="modal"
              errors={fieldErrors}
            />
          )}
          {mode === 'create' && createStep === 'address' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setCreateStep('profile')}
                disabled={submitting}
                className="w-full h-[48px] rounded-xl border-2 border-primary bg-primary-light text-primary text-[15px] font-extrabold"
              >
                Skip for now
              </button>
              <OutletAddressForm
                value={addressForm}
                onChange={setAddressForm}
                businessName={profile.legalName || profile.companyName || ''}
              />
            </div>
          )}
          {mode === 'create' && createStep === 'profile' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={finishCreate}
                disabled={submitting}
                className="w-full h-[48px] rounded-xl border-2 border-primary bg-primary-light text-primary text-[15px] font-extrabold"
              >
                Skip for now
              </button>
              <CustomerProfileForm
                value={profile}
                onChange={handleProfileChange}
                layout="modal"
                omitCoreFields
                visibleSections={{ contact: true, business: true, tax: true, admin: true }}
                errors={fieldErrors}
                contactPersons={contacts}
                onContactPersonsChange={setContacts}
              />
            </div>
          )}
          {mode === 'edit' && (
          <>
          <CustomerProfileForm
            value={profile}
            onChange={handleProfileChange}
            singleContact
            visibleSections={tabSections[tab]}
            errors={fieldErrors}
            showPassword={false}
            password={password}
            onPasswordChange={(v) => { setPassword(v); if (fieldErrors.password) clearFieldError('password'); }}
            showPasswordToggle
            passwordVisible={showPwd}
            onTogglePassword={() => setShowPwd(v => !v)}
            contactPersons={contacts}
            onContactPersonsChange={setContacts}
          />

          {tab === 'address' && (
            <div className="mt-4 p-3 rounded-xl bg-blue-50/70 border border-blue-100 flex items-start gap-2.5 text-[12px] text-blue-900">
              <MapPin size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Delivery outlet</strong>
                <p className="text-blue-700/90 mt-0.5 leading-relaxed">
                  This address is saved as a delivery outlet. Every outlet is the same level. Orders dispatch to the outlet the customer is ordering for.
                </p>
              </div>
            </div>
          )}
          </>
          )}
        </div>

        <div className="px-7 py-4 border-t border-[#EEEEEE] flex justify-end gap-3 shrink-0 bg-[#FAFAFA] rounded-b-[18px]">
          <button onClick={onClose} disabled={submitting} className="px-4.5 py-2.5 text-[13px] font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100/60 rounded-xl transition-all duration-200">Cancel</button>
          <button
            onClick={
              mode === 'edit'
                ? handleSubmit
                : createStep === 'account'
                  ? handleCreateAccount
                  : createStep === 'address'
                    ? handleCreateAddress
                    : handleCreateProfile
            }
            disabled={submitting}
            className={cn(FORM.primaryBtn, 'px-6 py-2.5 text-[13px] shadow-green-100')}
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {mode === 'edit'
              ? 'Save Changes'
              : createStep === 'account'
                ? 'Create Customer'
                : createStep === 'address'
                  ? 'Save address'
                  : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
