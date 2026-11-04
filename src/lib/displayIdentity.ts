/**
 * One display rule for names and addresses across invoice, order screens, and profile.
 */

export type AddressParts = {
  flatInfo?: string | null;
  addressLine?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
};

export type NamedAddress = AddressParts & {
  name?: string | null;
};

function trim(v: string | null | undefined): string {
  return (v ?? '').trim();
}

/** flat · line · Near landmark · city · state · pincode */
export function formatAddressLines(addr: AddressParts | null | undefined): string {
  if (!addr) return '';
  const parts: string[] = [];
  const flat = trim(addr.flatInfo);
  const line = trim(addr.addressLine);
  const landmark = trim(addr.landmark);
  const city = trim(addr.city);
  const state = trim(addr.state);
  const pin = trim(addr.pincode);
  if (flat) parts.push(flat);
  if (line) parts.push(line);
  if (landmark) parts.push(`Near ${landmark}`);
  const cityState = [city, state].filter(Boolean).join(', ');
  if (cityState) parts.push(cityState);
  if (pin) parts.push(pin);
  return parts.join(', ');
}

/** Compact single-line join used in cards / chips. */
export function formatAddressShort(addr: AddressParts | null | undefined): string {
  if (!addr) return '';
  return [trim(addr.addressLine), trim(addr.city), trim(addr.state), trim(addr.pincode)]
    .filter(Boolean)
    .join(', ');
}

/**
 * Invoice Bill-To / buyer legal billing name.
 * Prefer outlet billingName, then BusinessAccount.legalName, then displayName.
 */
export function buyerBillingName(opts: {
  outletBillingName?: string | null;
  legalName?: string | null;
  displayName?: string | null;
  fallback?: string | null;
}): string {
  return (
    trim(opts.outletBillingName)
    || trim(opts.legalName)
    || trim(opts.displayName)
    || trim(opts.fallback)
    || ''
  );
}

/**
 * Account trade/legal label for UI cards (never User.businessName first).
 * Prefer displayName, then legalName, then fallback person name.
 */
export function accountFacingName(opts: {
  displayName?: string | null;
  legalName?: string | null;
  fallback?: string | null;
}): string {
  return trim(opts.displayName) || trim(opts.legalName) || trim(opts.fallback) || '';
}

/** Outlet title for switchers / lists — name first, never pincode. */
export function outletTitle(opts: {
  name?: string | null;
  pincode?: string | null;
  fallback?: string | null;
}): string {
  return trim(opts.name) || trim(opts.fallback) || (trim(opts.pincode) ? `PIN ${trim(opts.pincode)}` : '') || 'Outlet';
}

export function supplierBillFrom(vendor: {
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  addressPincode?: string | null;
  pincode?: string | null;
} | null | undefined): AddressParts {
  if (!vendor) return {};
  return {
    addressLine: vendor.addressLine,
    city: vendor.city,
    state: vendor.state,
    pincode: vendor.addressPincode ?? vendor.pincode,
  };
}

export function supplierShipFrom(vendor: {
  pickupAddressLine?: string | null;
  pickupCity?: string | null;
  pickupState?: string | null;
  pickupPincode?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  addressPincode?: string | null;
} | null | undefined): AddressParts {
  if (!vendor) return {};
  const pickupLine = trim(vendor.pickupAddressLine);
  if (pickupLine) {
    return {
      addressLine: vendor.pickupAddressLine,
      city: vendor.pickupCity,
      state: vendor.pickupState,
      pincode: vendor.pickupPincode,
    };
  }
  return supplierBillFrom(vendor);
}

/** Snapshot shape frozen onto Order.billingSnapshot at checkout. */
export type OrderBillingSnapshot = {
  buyer: {
    billingName: string;
    gstin: string | null;
    addressLine: string;
    city: string;
    state: string;
    pincode: string;
  };
  supplier: {
    legalName: string;
    gstin: string | null;
    billFrom: AddressParts;
    shipFrom: AddressParts;
  };
  capturedAt: string;
};

export function buildOrderBillingSnapshot(input: {
  buyerBillingName: string;
  buyerGstin?: string | null;
  buyerBilling: AddressParts;
  supplierLegalName: string;
  supplierGstin?: string | null;
  supplierBillFrom: AddressParts;
  supplierShipFrom: AddressParts;
}): OrderBillingSnapshot {
  return {
    buyer: {
      billingName: trim(input.buyerBillingName),
      gstin: trim(input.buyerGstin) || null,
      addressLine: trim(input.buyerBilling.addressLine),
      city: trim(input.buyerBilling.city),
      state: trim(input.buyerBilling.state),
      pincode: trim(input.buyerBilling.pincode),
    },
    supplier: {
      legalName: trim(input.supplierLegalName),
      gstin: trim(input.supplierGstin) || null,
      billFrom: {
        addressLine: trim(input.supplierBillFrom.addressLine),
        city: trim(input.supplierBillFrom.city),
        state: trim(input.supplierBillFrom.state),
        pincode: trim(input.supplierBillFrom.pincode),
      },
      shipFrom: {
        addressLine: trim(input.supplierShipFrom.addressLine),
        city: trim(input.supplierShipFrom.city),
        state: trim(input.supplierShipFrom.state),
        pincode: trim(input.supplierShipFrom.pincode),
      },
    },
    capturedAt: new Date().toISOString(),
  };
}

export function parseOrderBillingSnapshot(raw: unknown): OrderBillingSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const buyer = o.buyer as Record<string, unknown> | undefined;
  const supplier = o.supplier as Record<string, unknown> | undefined;
  if (!buyer || !supplier) return null;
  return {
    buyer: {
      billingName: String(buyer.billingName ?? ''),
      gstin: buyer.gstin != null ? String(buyer.gstin) : null,
      addressLine: String(buyer.addressLine ?? ''),
      city: String(buyer.city ?? ''),
      state: String(buyer.state ?? ''),
      pincode: String(buyer.pincode ?? ''),
    },
    supplier: {
      legalName: String(supplier.legalName ?? ''),
      gstin: supplier.gstin != null ? String(supplier.gstin) : null,
      billFrom: (supplier.billFrom as AddressParts) ?? {},
      shipFrom: (supplier.shipFrom as AddressParts) ?? {},
    },
    capturedAt: String(o.capturedAt ?? ''),
  };
}
