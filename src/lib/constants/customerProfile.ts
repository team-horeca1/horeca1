/**
 * Customer profile constants — seeded from Profile Mastersheet CSV attribute master.
 * Single source for cascading Business Type → Sub-Type → Cuisine dropdowns.
 */

export const SALUTATIONS = ['', 'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.'] as const;

export const GST_TREATMENTS = [
  { v: '', label: 'Select treatment' },
  { v: 'registered_business_regular', label: 'Registered Business — Regular' },
  { v: 'registered_business_composition', label: 'Registered Business — Composition' },
  { v: 'unregistered_business', label: 'Unregistered Business' },
  { v: 'consumer', label: 'Consumer' },
  { v: 'overseas', label: 'Overseas' },
  { v: 'sez', label: 'SEZ' },
] as const;

export const PAYMENT_TERMS = [
  { v: 'due_on_receipt', label: 'Due on Receipt' },
  { v: 'net15', label: 'Net 15' },
  { v: 'net30', label: 'Net 30' },
  { v: 'net45', label: 'Net 45' },
  { v: 'net60', label: 'Net 60' },
] as const;

export const LANGUAGES = [
  { v: 'en', label: 'English' },
  { v: 'hi', label: 'Hindi' },
  { v: 'mr', label: 'Marathi' },
] as const;

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
] as const;

export const BUSINESS_SIZES = ['Small', 'Medium', 'Large', 'Enterprise'] as const;

export const BUSINESS_STRUCTURES = ['Standalone', 'Chain', 'Corporate'] as const;

export const SERVICE_MODELS = [
  'Dine-In', 'Takeaway', 'Delivery', 'Dine-In + Delivery', 'Takeaway + Delivery',
  'Retail Walk-In', 'Modern Trade', 'Cafeteria', 'Standing', 'Multi-brand',
] as const;

export const MONTHLY_PURCHASE_BANDS = ['Low', 'Medium', 'High'] as const;

export const PROCUREMENT_FREQUENCIES = ['Daily', 'Weekly', 'Monthly'] as const;

export const LEAD_STATUSES = ['Lead', 'Contacted', 'Active Buyer'] as const;

export const CREDIT_TYPES = ['None', 'DiSCCO Credit', 'Vendor Credit', 'Platform Credit'] as const;

/** Level-2 business types from Customer attribute master. */
export const CUSTOMER_BUSINESS_TYPES = [
  'Restaurant',
  'Cafe',
  'Bakery',
  'Bar & Lounge',
  'Hotel',
  'Cloud Kitchen',
  'Kiosk',
  'Institutional',
  'Retail',
  'Corporate',
] as const;

export type CustomerBusinessType = (typeof CUSTOMER_BUSINESS_TYPES)[number];

/** Sub-types keyed by business type (Level 3). */
export const SUB_TYPES_BY_TYPE: Record<string, readonly string[]> = {
  Restaurant: ['Fine Dine', 'Casual Dining', 'QSR'],
  Cafe: ['Artisanal', 'Multi Cuisine', 'Quick Service'],
  Bakery: ['Artisanal', 'Commercial'],
  'Bar & Lounge': ['Lounge Bar', 'Night Club'],
  Hotel: ['3-Star', '5-Star', 'Boutique'],
  'Cloud Kitchen': ['Single Brand', 'Multi Brand'],
  Kiosk: ['Beverages', 'South Indian', 'Snacks'],
  Institutional: ['Catering', 'Canteen', 'Education'],
  Retail: ['General Trade', 'Modern Trade'],
  Corporate: ['Office Pantry'],
};

/** Cuisine / category presets keyed by "BusinessType|SubType". */
export const CUISINE_BY_SUBTYPE: Record<string, readonly string[]> = {
  'Restaurant|Fine Dine': ['Indian', 'Japanese', 'Pan Asian', 'Multi Cuisine'],
  'Restaurant|Casual Dining': ['Indian', 'Chinese', 'Multi Cuisine'],
  'Restaurant|QSR': ['Burger', 'Pizza', 'Fried Chicken', 'Rolls & Fast Food'],
  'Cafe|Artisanal': ['Continental', 'Coffee Focused'],
  'Cafe|Multi Cuisine': ['Cafe + Bakery'],
  'Cafe|Quick Service': ['Beverage Focused'],
  'Bakery|Artisanal': ['Breads & Desserts'],
  'Bakery|Commercial': ['Bulk Production'],
  'Bar & Lounge|Lounge Bar': ['Premium'],
  'Bar & Lounge|Night Club': ['Alcohol + Food'],
  'Hotel|3-Star': ['Business Hotel'],
  'Hotel|5-Star': ['Luxury Hotel'],
  'Hotel|Boutique': ['Boutique Stay'],
  'Cloud Kitchen|Single Brand': ['Indian Delivery'],
  'Cloud Kitchen|Multi Brand': ['Multi Cuisine'],
  'Kiosk|Beverages': ['Tea Stall', 'Juice Counter'],
  'Kiosk|South Indian': ['Idli/Dosa Counter'],
  'Kiosk|Snacks': ['Sandwich Stall'],
  'Institutional|Catering': ['Corporate Catering'],
  'Institutional|Canteen': ['Industrial Canteen'],
  'Institutional|Education': ['College Cafeteria'],
  'Retail|General Trade': ['Small Kirana', 'Large Kirana', 'Provision Store'],
  'Retail|Modern Trade': ['Supermarket', 'Hypermarket', 'Cash & Carry'],
  'Corporate|Office Pantry': ['IT Company', 'Corporate Office'],
};

export function subTypesForBusinessType(businessType: string): readonly string[] {
  return SUB_TYPES_BY_TYPE[businessType] ?? [];
}

export function cuisinesForSubType(businessType: string, subType: string): readonly string[] {
  return CUISINE_BY_SUBTYPE[`${businessType}|${subType}`] ?? [];
}

export function defaultOutletName(displayName: string, legalName: string): string {
  const base = displayName.trim() || legalName.trim();
  return base ? `${base} — Main` : 'Primary Outlet';
}

/** Names the system used to invent — treat as not captured. */
const SYNTHETIC_OUTLET_EXACT = new Set(['Primary Outlet', 'Branch Outlet']);

/**
 * True when the outlet name was never typed by the user (blank, or a legacy
 * auto-generated "{display} — Main" / Primary Outlet / Branch Outlet).
 */
export function isSyntheticOutletName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim();
  if (n.length < 2) return true;
  if (SYNTHETIC_OUTLET_EXACT.has(n)) return true;
  // defaultOutletName always ends with the em-dash + " Main" suffix.
  if (n.endsWith(' — Main')) return true;
  return false;
}

/**
 * addressLine stamped on a freshly-provisioned primary outlet that has no real
 * address yet. Used as the signal that the outlet is an empty placeholder the
 * first saved address should *adopt* (fill in place) rather than duplicate.
 */
export const PLACEHOLDER_OUTLET_ADDRESS = 'Address pending — complete in account settings';
