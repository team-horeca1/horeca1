/**
 * Shared business address value + payload mappers for supplier and brand forms.
 * One shape everywhere — billing (+ optional pickup/delivery) or single location.
 */

import { INDIAN_STATES } from '@/lib/constants/customerProfile';

export type AddressLine = {
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
};

export type BusinessAddressValue = {
  /** Optional label (outlet / HQ name). Used in single mode and some supplier creates. */
  locationName: string;
  /** Invoice / Bill-To name for this outlet (customers). */
  billingName: string;
  billingAddressLine: string;
  billingCity: string;
  billingState: string;
  billingPincode: string;
  /** When true, pickup/delivery mirrors billing. Ignored in `single` mode. */
  sameAsBilling: boolean;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
};

export const EMPTY_BUSINESS_ADDRESS: BusinessAddressValue = {
  locationName: '',
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

export function blankAddressLine(): AddressLine {
  return { addressLine: '', city: '', state: '', pincode: '' };
}

export function addressesEqual(a: AddressLine, b: AddressLine): boolean {
  const left = persistAddressLine(a);
  const right = persistAddressLine(b);
  return (
    left.addressLine === right.addressLine
    && left.city === right.city
    && left.state === right.state
    && left.pincode === right.pincode
  );
}

/**
 * Normalize for form hydrate / in-memory use.
 * Do NOT trim street/city/state here — controlled inputs rebuild via
 * fromBillingAndPickup on every keystroke, and trimming eats typed spaces.
 * Persist/export helpers call `persistAddressLine` which does trim.
 */
export function normalizeAddressLine(raw: Partial<AddressLine> | null | undefined): AddressLine {
  return {
    addressLine: raw?.addressLine ?? '',
    city: raw?.city ?? '',
    state: raw?.state ?? '',
    pincode: (raw?.pincode ?? '').replace(/\D/g, '').slice(0, 6),
  };
}

/** Trim + pincode clean for API payloads and equality checks against saved data. */
export function persistAddressLine(raw: Partial<AddressLine> | null | undefined): AddressLine {
  const n = normalizeAddressLine(raw);
  return {
    addressLine: n.addressLine.trim(),
    city: n.city.trim(),
    state: n.state.trim(),
    pincode: n.pincode,
  };
}

/** Effective delivery/pickup after applying same-as-billing. */
export function effectiveDelivery(value: BusinessAddressValue): AddressLine {
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

export function billingOf(value: BusinessAddressValue): AddressLine {
  return {
    addressLine: value.billingAddressLine,
    city: value.billingCity,
    state: value.billingState,
    pincode: value.billingPincode,
  };
}

/** Sync delivery fields when sameAsBilling is on. */
export function withSameAsBillingSync(value: BusinessAddressValue): BusinessAddressValue {
  if (!value.sameAsBilling) return value;
  const billing = billingOf(value);
  return {
    ...value,
    addressLine: billing.addressLine,
    city: billing.city,
    state: billing.state,
    pincode: billing.pincode,
  };
}

/**
 * Hydrate form state from persisted billing + pickup/delivery.
 * sameAsBilling is true when pickup is empty or equal to billing.
 */
export function fromBillingAndPickup(
  billing: Partial<AddressLine> | null | undefined,
  pickup: Partial<AddressLine> | null | undefined,
  opts?: { locationName?: string; billingName?: string },
): BusinessAddressValue {
  const b = normalizeAddressLine(billing);
  const p = normalizeAddressLine(pickup);
  const pickupEmpty = !p.addressLine && !p.city && !p.state && !p.pincode;
  const same = pickupEmpty || addressesEqual(b, p);
  return {
    // Keep raw name strings — trimming here breaks mid-word spaces while typing.
    locationName: opts?.locationName ?? '',
    billingName: opts?.billingName ?? '',
    billingAddressLine: b.addressLine,
    billingCity: b.city,
    billingState: b.state,
    billingPincode: b.pincode,
    sameAsBilling: same,
    addressLine: same ? b.addressLine : p.addressLine,
    city: same ? b.city : p.city,
    state: same ? b.state : p.state,
    pincode: same ? b.pincode : p.pincode,
  };
}

/** Single-location hydrate (brands). Billing and delivery are the same. */
export function fromSingleAddress(
  address: Partial<AddressLine> | null | undefined,
  opts?: { locationName?: string; billingName?: string },
): BusinessAddressValue {
  const a = normalizeAddressLine(address);
  return {
    locationName: opts?.locationName ?? '',
    billingName: opts?.billingName ?? '',
    billingAddressLine: a.addressLine,
    billingCity: a.city,
    billingState: a.state,
    billingPincode: a.pincode,
    sameAsBilling: true,
    addressLine: a.addressLine,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
  };
}

/**
 * Canonical customer save shape used by admin Addresses tab and storefront overlays.
 * Billing goes on the BusinessAccount; delivery goes on the Outlet.
 */
export function toCustomerOutletPayload(
  value: BusinessAddressValue,
  opts?: { accountLegalName?: string },
): {
  companyProfile: {
    billingAddressLine: string;
    billingCity: string;
    billingState: string;
    billingPincode: string;
  };
  outlet: {
    name: string;
    billingName: string | null;
    addressLine: string;
    city: string;
    state: string;
    pincode: string;
  };
} {
  const billing = persistAddressLine(billingOf(value));
  const delivery = persistAddressLine(effectiveDelivery(value));
  const legal = (opts?.accountLegalName ?? '').trim();
  const billingName = value.billingName.trim();
  return {
    companyProfile: {
      billingAddressLine: billing.addressLine,
      billingCity: billing.city,
      billingState: billing.state,
      billingPincode: billing.pincode,
    },
    outlet: {
      name: value.locationName.trim() || 'Outlet',
      billingName: billingName && billingName !== legal ? billingName : null,
      addressLine: delivery.addressLine,
      city: delivery.city,
      state: delivery.state,
      pincode: delivery.pincode,
    },
  };
}

/** Nested payload used by vendor onboarding / admin create. */
export function toVendorNestedPayload(value: BusinessAddressValue): {
  billingAddress: AddressLine;
  pickupAddress: AddressLine;
  primaryOutlet: AddressLine & { name?: string };
} {
  const billing = persistAddressLine(billingOf(value));
  const pickup = persistAddressLine(effectiveDelivery(value));
  return {
    billingAddress: billing,
    pickupAddress: pickup,
    primaryOutlet: {
      ...(value.locationName.trim() ? { name: value.locationName.trim() } : {}),
      ...pickup,
    },
  };
}

/** Flat vendor store / settings / admin PATCH fields. */
export function toVendorFlatPayload(value: BusinessAddressValue): {
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  addressPincode: string;
  pickupAddressLine: string;
  pickupCity: string;
  pickupState: string;
  pickupPincode: string;
} {
  const billing = persistAddressLine(billingOf(value));
  const pickup = persistAddressLine(effectiveDelivery(value));
  return {
    addressLine: billing.addressLine,
    city: billing.city,
    state: billing.state,
    pincode: billing.pincode,
    addressPincode: billing.pincode,
    pickupAddressLine: pickup.addressLine,
    pickupCity: pickup.city,
    pickupState: pickup.state,
    pickupPincode: pickup.pincode,
  };
}

/** Flat billing fields for brand BA / profile. */
export function toBrandBillingPayload(value: BusinessAddressValue): {
  addressLine: string;
  billingAddressLine: string;
  city: string;
  billingCity: string;
  state: string;
  billingState: string;
  pincode: string;
  billingPincode: string;
  outletName?: string;
} {
  const a = persistAddressLine(billingOf(value));
  return {
    addressLine: a.addressLine,
    billingAddressLine: a.addressLine,
    city: a.city,
    billingCity: a.city,
    state: a.state,
    billingState: a.state,
    pincode: a.pincode,
    billingPincode: a.pincode,
    ...(value.locationName.trim() ? { outletName: value.locationName.trim() } : {}),
  };
}

/** Map BusinessAddressValue into VendorProfileInput-style flat+nested fields. */
export function toVendorProfilePatch(value: BusinessAddressValue): Record<string, unknown> {
  const nested = toVendorNestedPayload(value);
  const flat = toVendorFlatPayload(value);
  return {
    billingAddressLine: flat.addressLine,
    billingCity: flat.city,
    billingState: flat.state,
    billingPincode: flat.pincode,
    addressLine: flat.addressLine,
    city: flat.city,
    state: flat.state,
    pincode: flat.pincode,
    billingAddress: nested.billingAddress,
    pickupAddressLine: flat.pickupAddressLine,
    pickupCity: flat.pickupCity,
    pickupState: flat.pickupState,
    pickupPincode: flat.pickupPincode,
    pickupAddress: nested.pickupAddress,
  };
}

/** State options: INDIAN_STATES plus any saved custom value not in the list. */
export function stateSelectOptions(current: string): string[] {
  const trimmed = current.trim();
  if (trimmed && !(INDIAN_STATES as readonly string[]).includes(trimmed)) {
    return [trimmed, ...INDIAN_STATES];
  }
  return [...INDIAN_STATES];
}

export type PincodeAutofill = { city: string; state: string };

/**
 * Suggestion-only pincode → city/state via India Post public API.
 * Never rejects a pincode; returns null when unknown / offline.
 */
export async function autofillFromPincode(pincode: string): Promise<PincodeAutofill | null> {
  const pin = pincode.replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(pin)) return null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const data = (await res.json()) as Array<{
      PostOffice?: Array<{ District?: string; Division?: string; State?: string }>;
    }>;
    const po = data?.[0]?.PostOffice?.[0];
    if (!po) return null;
    const city = (po.District || po.Division || '').trim();
    const state = (po.State || '').trim();
    if (!city && !state) return null;
    return { city, state };
  } catch {
    return null;
  }
}
