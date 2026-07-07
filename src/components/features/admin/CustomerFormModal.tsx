'use client';

/**
 * CustomerFormModal — Zoho-style admin create/edit shell over shared CustomerProfileForm sections.
 */

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FORM, FormErrorBanner, useFormFeedback } from '@/components/ui/form';
import { parseJsonResponse } from '@/lib/apiError';
import {
  CustomerProfileForm,
  type CustomerProfileValues,
  type ContactPerson,
} from '@/components/features/customer/CustomerProfileForm';
import { EMPTY_CUSTOMER_PROFILE } from '@/components/features/customer/customerProfileDefaults';
import {
  validateCustomerProfile,
  derivedFullName,
  primaryPhoneDigits,
} from '@/lib/validators/customer-profile';
import { buildCompanyProfile, mapToUserFields } from '@/lib/customerProfileMapper';

export interface CustomerFormInitial extends CustomerProfileValues {
  contactPersons?: ContactPerson[];
}

interface Props {
  mode: 'create' | 'edit';
  userId?: string;
  initial?: CustomerFormInitial;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = 'overview' | 'other' | 'address' | 'contacts' | 'remarks';

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
    if (mode === 'create' && (!primaryPhone || primaryPhone.length !== 10)) {
      const errs = { phone: 'Enter a valid 10-digit mobile or work phone' };
      setTab('overview');
      applyValidationErrors(errs, 'Enter a valid 10-digit mobile or work phone', {
        fieldOrder: CUSTOMER_FIELD_ORDER,
        dataField: true,
      });
      return;
    }

    setSubmitting(true);
    try {
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
            companyProfile,
          }),
        });
      } else {
        res = await fetch(`/api/v1/admin/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyProfile }),
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

        <div className="px-7 pt-2 border-b border-[#EEEEEE] flex gap-2 overflow-x-auto shrink-0 bg-[#FAFAFA]/50">
          {TABS.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn('px-4 py-3 text-[13.5px] font-bold whitespace-nowrap border-b-2 -mb-px transition-all duration-200',
                tab === t.k ? 'border-[#299E60] text-[#299E60] font-extrabold' : 'border-transparent text-gray-400 hover:text-[#181725]')}>
              {t.label}
            </button>
          ))}
        </div>

        <FormErrorBanner message={bannerError} className="mx-7" />

        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          <CustomerProfileForm
            value={profile}
            onChange={handleProfileChange}
            visibleSections={tabSections[tab]}
            errors={fieldErrors}
            showPassword={mode === 'create' && tab === 'overview'}
            password={password}
            onPasswordChange={(v) => { setPassword(v); if (fieldErrors.password) clearFieldError('password'); }}
            showPasswordToggle
            passwordVisible={showPwd}
            onTogglePassword={() => setShowPwd(v => !v)}
            contactPersons={contacts}
            onContactPersonsChange={setContacts}
          />

          {tab === 'address' && (
            <p className="text-[12px] text-gray-500 mt-4">
              Billing address. Delivery outlets are managed on the customer detail page.
            </p>
          )}
        </div>

        <div className="px-7 py-4 border-t border-[#EEEEEE] flex justify-end gap-3 shrink-0 bg-[#FAFAFA] rounded-b-[18px]">
          <button onClick={onClose} disabled={submitting} className="px-4.5 py-2.5 text-[13px] font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100/60 rounded-xl transition-all duration-200">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className={cn(FORM.primaryBtn, 'px-6 py-2.5 text-[13px] shadow-green-100')}>
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {mode === 'create' ? 'Create Customer' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
