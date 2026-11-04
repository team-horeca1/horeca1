'use client';

/**
 * Shared business address form for supplier + brand entry points.
 * - mode `billing+delivery`: billing + optional pickup/delivery with Same as billing
 * - mode `single`: one location (brands)
 * State is always an INDIAN_STATES dropdown (plus a saved custom value if needed).
 * Pincode autofills city/state via India Post when those fields are empty.
 */

import React, { useEffect } from 'react';
import { TextField, FormField, FormSelect } from '@/components/ui/form';
import {
  type BusinessAddressValue,
  autofillFromPincode,
  stateSelectOptions,
  withSameAsBillingSync,
} from '@/lib/businessAddress';

export type BusinessAddressMode = 'billing+delivery' | 'single';

export interface BusinessAddressFormProps {
  value: BusinessAddressValue;
  onChange: (next: BusinessAddressValue) => void;
  mode?: BusinessAddressMode;
  errors?: Record<string, string>;
  /** Shown above billing block. */
  billingLabel?: string;
  /** Label for the secondary address when sameAsBilling is unchecked. */
  deliveryLabel?: string;
  /** Checkbox copy. */
  sameAsLabel?: string;
  /** Show location/outlet name field (single mode or supplier create). */
  showLocationName?: boolean;
  locationNameLabel?: string;
  locationNameRequired?: boolean;
  /** When true, mark core address fields as required visually. */
  required?: boolean;
  /** Hide Same-as-billing checkbox (billing-only surfaces). Default true when mode is billing+delivery. */
  showSameAsToggle?: boolean;
  className?: string;
}

function StateSelect({
  label,
  required,
  value,
  error,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const options = stateSelectOptions(value);
  return (
    <FormField label={label} required={required} error={error}>
      <FormSelect value={value} onChange={onChange} hasError={!!error}>
        <option value="">Select state</option>
        {options.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </FormSelect>
    </FormField>
  );
}

export function BusinessAddressForm({
  value,
  onChange,
  mode = 'billing+delivery',
  errors = {},
  billingLabel = 'Billing address',
  deliveryLabel = 'Pickup / warehouse address',
  sameAsLabel = 'Pickup address is the same as billing',
  showLocationName = false,
  locationNameLabel = 'Location name',
  locationNameRequired = false,
  required = true,
  showSameAsToggle,
  className,
}: BusinessAddressFormProps) {
  const isSingle = mode === 'single';
  const allowDeliveryToggle = !isSingle && (showSameAsToggle ?? true);

  const commit = (partial: Partial<BusinessAddressValue>) => {
    let next: BusinessAddressValue = { ...value, ...partial };
    if (!isSingle) {
      next = withSameAsBillingSync(next);
    } else {
      // Single mode keeps billing === delivery always.
      next = withSameAsBillingSync({ ...next, sameAsBilling: true });
    }
    onChange(next);
  };

  const pin = isSingle || value.sameAsBilling ? value.billingPincode : value.pincode;
  const cityFilled = (isSingle || value.sameAsBilling ? value.billingCity : value.city).trim();
  const stateFilled = (isSingle || value.sameAsBilling ? value.billingState : value.state).trim();

  useEffect(() => {
    if (!/^\d{6}$/.test(pin)) return;
    if (cityFilled && stateFilled) return;
    let cancelled = false;
    autofillFromPincode(pin).then((hit) => {
      if (cancelled || !hit) return;
      if (isSingle || value.sameAsBilling) {
        commit({
          billingCity: cityFilled ? value.billingCity : hit.city,
          billingState: stateFilled ? value.billingState : hit.state,
        });
      } else {
        commit({
          city: cityFilled ? value.city : hit.city,
          state: stateFilled ? value.state : hit.state,
        });
      }
    });
    return () => { cancelled = true; };
    // Only re-run when the active pincode / side changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, value.sameAsBilling, isSingle]);

  return (
    <div className={className ? `space-y-4 ${className}` : 'space-y-4'}>
      {showLocationName && (
        <TextField
          label={locationNameLabel}
          required={locationNameRequired}
          value={value.locationName}
          error={errors.locationName || errors.outletName}
          onChange={(v) => commit({ locationName: v })}
          placeholder="e.g. Mumbai HQ"
          dataField="locationName"
        />
      )}

      {!isSingle && (
        <p className="text-[12px] font-extrabold text-[#6B1D2E] uppercase tracking-wider">{billingLabel}</p>
      )}

      <TextField
        label={isSingle ? 'Address line' : 'Billing address'}
        required={required}
        value={value.billingAddressLine}
        error={errors.billingAddressLine || errors.addressLine || errors.billingAddress}
        onChange={(v) => commit({ billingAddressLine: v })}
        placeholder="Building, street, area"
        dataField="billingAddressLine"
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TextField
          label={isSingle ? 'City' : 'Billing city'}
          required={required}
          value={value.billingCity}
          error={errors.billingCity || errors.city}
          onChange={(v) => commit({ billingCity: v })}
          placeholder="City"
          dataField="billingCity"
        />
        <StateSelect
          label={isSingle ? 'State' : 'Billing state'}
          required={required}
          value={value.billingState}
          error={errors.billingState || errors.state}
          onChange={(v) => commit({ billingState: v })}
        />
        <TextField
          label={isSingle ? 'Pincode' : 'Billing pincode'}
          required={required}
          value={value.billingPincode}
          error={errors.billingPincode || errors.pincode || errors.addressPincode}
          onChange={(v) => commit({ billingPincode: v.replace(/\D/g, '').slice(0, 6) })}
          placeholder="6-digit PIN"
          maxLength={6}
          inputMode="numeric"
          dataField="billingPincode"
        />
      </div>

      {allowDeliveryToggle && (
        <>
          <label className="flex items-center gap-2.5 text-[13px] font-bold text-[#181725] cursor-pointer">
            <input
              type="checkbox"
              checked={value.sameAsBilling}
              onChange={(e) => commit({ sameAsBilling: e.target.checked })}
              className="accent-primary w-4 h-4 rounded"
            />
            {sameAsLabel}
          </label>

          {!value.sameAsBilling && (
            <div className="space-y-3 p-4 rounded-xl border border-gray-200 bg-[#FAFAFA]">
              <p className="text-[12px] font-extrabold text-[#6B1D2E] uppercase tracking-wider">{deliveryLabel}</p>
              <TextField
                label="Address line"
                required={required}
                value={value.addressLine}
                error={errors.addressLine || errors.pickupAddressLine}
                onChange={(v) => commit({ addressLine: v })}
                placeholder="Building, street, area"
                dataField="pickupAddressLine"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextField
                  label="City"
                  required={required}
                  value={value.city}
                  error={errors.city || errors.pickupCity}
                  onChange={(v) => commit({ city: v })}
                  placeholder="City"
                />
                <StateSelect
                  label="State"
                  required={required}
                  value={value.state}
                  error={errors.state || errors.pickupState}
                  onChange={(v) => commit({ state: v })}
                />
                <TextField
                  label="Pincode"
                  required={required}
                  value={value.pincode}
                  error={errors.pincode || errors.pickupPincode}
                  onChange={(v) => commit({ pincode: v.replace(/\D/g, '').slice(0, 6) })}
                  placeholder="6-digit PIN"
                  maxLength={6}
                  inputMode="numeric"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
