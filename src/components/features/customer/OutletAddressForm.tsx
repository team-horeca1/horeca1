'use client';

/**
 * Customer outlet address — thin wrapper over BusinessAddressForm.
 * Same fields everywhere: outlet name, billing name, billing address,
 * and optional delivery when it differs from billing.
 */

import React from 'react';
import { BusinessAddressForm } from '@/components/features/shared/BusinessAddressForm';
import {
  EMPTY_BUSINESS_ADDRESS,
  effectiveDelivery,
  type BusinessAddressValue,
} from '@/lib/businessAddress';

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

export const EMPTY_OUTLET_ADDRESS: OutletAddressValue = {
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

export function deliveryFromOutletAddress(value: OutletAddressValue): {
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
} {
  return effectiveDelivery(toBusinessValue(value));
}

/** Adapter for shared mappers such as `toCustomerOutletPayload`. */
export function toBusinessValue(value: OutletAddressValue): BusinessAddressValue {
  return {
    ...EMPTY_BUSINESS_ADDRESS,
    locationName: value.outletName,
    billingName: value.billingName,
    billingAddressLine: value.billingAddressLine,
    billingCity: value.billingCity,
    billingState: value.billingState,
    billingPincode: value.billingPincode,
    sameAsBilling: value.sameAsBilling,
    addressLine: value.addressLine,
    city: value.city,
    state: value.state,
    pincode: value.pincode,
  };
}

function fromBusinessValue(next: BusinessAddressValue): OutletAddressValue {
  return {
    outletName: next.locationName,
    billingName: next.billingName,
    billingAddressLine: next.billingAddressLine,
    billingCity: next.billingCity,
    billingState: next.billingState,
    billingPincode: next.billingPincode,
    sameAsBilling: next.sameAsBilling,
    addressLine: next.addressLine,
    city: next.city,
    state: next.state,
    pincode: next.pincode,
  };
}

interface OutletAddressFormProps {
  value: OutletAddressValue;
  onChange: (next: OutletAddressValue) => void;
  errors?: Record<string, string>;
  /** Prefills billing name when that field is still empty. */
  businessName?: string;
}

export function OutletAddressForm({
  value,
  onChange,
  errors = {},
  businessName = '',
}: OutletAddressFormProps) {
  return (
    <BusinessAddressForm
      mode="billing+delivery"
      value={toBusinessValue(value)}
      onChange={(next) => onChange(fromBusinessValue(next))}
      errors={errors}
      showLocationName
      locationNameLabel="Outlet name"
      locationNameRequired
      showBillingName
      billingNameLabel="Billing name"
      billingNamePlaceholder={businessName || 'Business name'}
      billingNameHint={
        businessName
          ? `Starts as ${businessName}. Change it only for this outlet.`
          : 'Defaults to the business name.'
      }
      billingLabel="Billing address"
      deliveryLabel="Delivery address"
      sameAsLabel="Delivery address is the same as billing"
      required
    />
  );
}
