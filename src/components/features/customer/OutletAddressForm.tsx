'use client';

/**
 * Typed outlet address — no Google search.
 * Same fields for every outlet: name, billing name, billing address,
 * and an optional delivery address when it differs from billing.
 */

import React, { useEffect } from 'react';
import { TextField } from '@/components/ui/form';

export interface OutletAddressValue {
  outletName: string;
  billingName: string;
  billingAddressLine: string;
  billingCity: string;
  billingState: string;
  billingPincode: string;
  sameAsBilling: boolean;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
}

export function deliveryFromOutletAddress(value: OutletAddressValue): {
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
} {
  if (value.sameAsBilling) {
    return {
      addressLine: value.billingAddressLine,
      city: value.billingCity,
      state: value.billingState,
      pincode: value.billingPincode,
    };
  }
  return {
    addressLine: value.addressLine,
    city: value.city,
    state: value.state,
    pincode: value.pincode,
  };
}

interface OutletAddressFormProps {
  value: OutletAddressValue;
  onChange: (next: OutletAddressValue) => void;
  errors?: Record<string, string>;
  /** Prefilled into billing name when that field is still empty. */
  businessName?: string;
}

export function OutletAddressForm({
  value,
  onChange,
  errors = {},
  businessName = '',
}: OutletAddressFormProps) {
  const commit = (partial: Partial<OutletAddressValue>) => {
    const next: OutletAddressValue = { ...value, ...partial };
    if (next.sameAsBilling) {
      next.addressLine = next.billingAddressLine;
      next.city = next.billingCity;
      next.state = next.billingState;
      next.pincode = next.billingPincode;
    }
    onChange(next);
  };

  // Fill city and state from the typed pincode. Never overwrite a city the user already entered.
  const pin = value.sameAsBilling ? value.billingPincode : value.pincode;
  const cityFilled = value.sameAsBilling ? value.billingCity.trim() : value.city.trim();
  const stateFilled = value.sameAsBilling ? value.billingState.trim() : value.state.trim();
  useEffect(() => {
    if (!/^\d{6}$/.test(pin)) return;
    if (cityFilled && stateFilled) return;
    let cancelled = false;
    fetch(`https://api.postalpincode.in/pincode/${pin}`)
      .then((r) => r.json())
      .then((data: Array<{ PostOffice?: Array<{ District?: string; Division?: string; State?: string }> }>) => {
        if (cancelled) return;
        const po = data?.[0]?.PostOffice?.[0];
        if (!po) return;
        const city = po.District || po.Division || '';
        const state = po.State || '';
        if (value.sameAsBilling) {
          commit({
            billingCity: cityFilled ? value.billingCity : city,
            billingState: stateFilled ? value.billingState : state,
          });
        } else {
          commit({
            city: cityFilled ? value.city : city,
            state: stateFilled ? value.state : state,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Only re-run when the pincode or which side is being filled changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, value.sameAsBilling]);

  return (
    <div className="space-y-4">
      <TextField
        label="Outlet name"
        required
        value={value.outletName}
        error={errors.outletName}
        onChange={(v) => commit({ outletName: v })}
        placeholder="e.g. Vashi kitchen"
      />
      <TextField
        label="Billing name"
        value={value.billingName}
        onChange={(v) => commit({ billingName: v })}
        placeholder={businessName || 'Business name'}
        hint={businessName ? `Starts as ${businessName}. Change it only for this outlet.` : 'Defaults to the business name.'}
      />
      <TextField
        label="Billing address"
        required
        value={value.billingAddressLine}
        error={errors.billingAddressLine || errors.addressLine}
        onChange={(v) => commit({ billingAddressLine: v })}
        placeholder="Building, street, area"
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TextField
          label="Billing city"
          value={value.billingCity}
          onChange={(v) => commit({ billingCity: v })}
          placeholder="City"
        />
        <TextField
          label="Billing state"
          value={value.billingState}
          onChange={(v) => commit({ billingState: v })}
          placeholder="State"
        />
        <TextField
          label="Billing pincode"
          required
          value={value.billingPincode}
          error={errors.billingPincode || errors.pincode}
          onChange={(v) => commit({ billingPincode: v.replace(/\D/g, '').slice(0, 6) })}
          placeholder="6-digit PIN"
          maxLength={6}
          inputMode="numeric"
        />
      </div>

      <label className="flex items-center gap-2.5 text-[13px] font-bold text-[#181725] cursor-pointer">
        <input
          type="checkbox"
          checked={value.sameAsBilling}
          onChange={(e) => commit({ sameAsBilling: e.target.checked })}
          className="accent-primary w-4 h-4 rounded"
        />
        Delivery address is the same as billing
      </label>

      {!value.sameAsBilling && (
        <div className="space-y-3 p-4 rounded-xl border border-gray-200 bg-[#FAFAFA]">
          <p className="text-[12px] font-extrabold text-[#6B1D2E] uppercase tracking-wider">Delivery address</p>
          <TextField
            label="Delivery address"
            required
            value={value.addressLine}
            error={errors.addressLine}
            onChange={(v) => commit({ addressLine: v })}
            placeholder="Building, street, area"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TextField label="Delivery city" value={value.city} onChange={(v) => commit({ city: v })} placeholder="City" />
            <TextField label="Delivery state" value={value.state} onChange={(v) => commit({ state: v })} placeholder="State" />
            <TextField
              label="Delivery pincode"
              required
              value={value.pincode}
              error={errors.pincode}
              onChange={(v) => commit({ pincode: v.replace(/\D/g, '').slice(0, 6) })}
              placeholder="6-digit PIN"
              maxLength={6}
              inputMode="numeric"
            />
          </div>
        </div>
      )}
    </div>
  );
}
