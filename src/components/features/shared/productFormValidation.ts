import { validateMasterSku } from '@/lib/sku';

/** Fields validated in essentials — order matches scroll-to-error on the form. */
export const PRODUCT_REQUIRED_FIELD_ORDER = [
  'name',
  'sku',
  'vendorSku',
  'hsn',
  'brand',
  'categoryIds',
  'imageUrl',
  'basePrice',
  'taxPercent',
  'intraStateTaxName',
  'intraStateTaxType',
  'interStateTaxName',
  'interStateTaxType',
  'countryOfOrigin',
  'vegNonVeg',
  'storageType',
  'shelfLifeDays',
  'minOrderQty',
  'variantMapping',
] as const;

export type ProductValidationField = (typeof PRODUCT_REQUIRED_FIELD_ORDER)[number];

export interface ProductEssentialsForm {
  name: string;
  sku: string;
  vendorSku?: string;
  hsn: string;
  brand: string;
  categoryIds: string[];
  imageUrl: string;
  taxPercent?: string;
  intraStateTaxName: string;
  intraStateTaxType: string;
  interStateTaxName: string;
  interStateTaxType: string;
  countryOfOrigin: string;
  vegNonVeg: string;
  storageType: string;
  shelfLifeDays: string;
  minOrderQty: string;
  variantMapping: string;
  substituteIds: string[];
  basePrice?: string;
  vendorId?: string;
}

export interface ValidateProductEssentialsOptions {
  portal: 'admin' | 'vendor';
  /** Vendor: require POS SKU when listing from master catalog */
  requireVendorSku?: boolean;
  /** Admin: validate master SKU format on catalog-only create */
  validateMasterSkuFormat?: boolean;
  /** Admin: require base price when vendor listing */
  requireBasePriceForVendorListing?: boolean;
  /** Vendor: always require base price */
  requireBasePrice?: boolean;
  /** Skip category requirement (e.g. catalog-linked vendor listing) */
  skipCategory?: boolean;
}

function req(errors: Record<string, string>, field: string, value: string | undefined, message: string) {
  if (!value?.trim()) errors[field] = message;
}

export function validateProductEssentials(
  form: ProductEssentialsForm,
  options: ValidateProductEssentialsOptions,
): Record<string, string> {
  const errors: Record<string, string> = {};

  req(errors, 'name', form.name, 'Product name is required');

  if (options.requireVendorSku) {
    req(errors, 'vendorSku', form.vendorSku, 'Your POS SKU is required when listing a catalog item');
  } else {
    req(errors, 'sku', form.sku, 'SKU is required');
    if (
      options.validateMasterSkuFormat &&
      form.sku.trim() &&
      !errors.sku
    ) {
      const skuCheck = validateMasterSku(form.sku);
      if (!skuCheck.ok) errors.sku = skuCheck.message;
    }
  }

  req(errors, 'hsn', form.hsn, 'HSN code is required');
  req(errors, 'brand', form.brand, 'Brand is required');

  if (!options.skipCategory && form.categoryIds.length === 0) {
    errors.categoryIds = 'Pick a parent and sub-category';
  }

  req(errors, 'imageUrl', form.imageUrl, 'Primary image is required');

  if (options.requireBasePrice || options.requireBasePriceForVendorListing) {
    const price = Number(form.basePrice);
    if (!form.basePrice?.trim() || Number.isNaN(price) || price <= 0) {
      errors.basePrice = 'A valid base price is required';
    }
  }

  const taxPct = Number(form.taxPercent);
  if (form.taxPercent?.trim() === '' || Number.isNaN(taxPct) || taxPct < 0 || taxPct > 100) {
    errors.taxPercent = 'Tax % must be between 0 and 100';
  }

  req(errors, 'intraStateTaxName', form.intraStateTaxName, 'Intra state tax name is required');
  req(errors, 'intraStateTaxType', form.intraStateTaxType, 'Intra state tax type is required');

  req(errors, 'interStateTaxName', form.interStateTaxName, 'Inter state tax name is required');
  req(errors, 'interStateTaxType', form.interStateTaxType, 'Inter state tax type is required');

  req(errors, 'countryOfOrigin', form.countryOfOrigin, 'Country of origin is required');
  req(errors, 'vegNonVeg', form.vegNonVeg, 'Veg / non-veg is required');
  req(errors, 'storageType', form.storageType, 'Storage type is required');

  if (!form.shelfLifeDays?.trim() || Number.isNaN(Number(form.shelfLifeDays)) || Number(form.shelfLifeDays) < 0) {
    errors.shelfLifeDays = 'Shelf life (days) is required';
  }

  if (!form.minOrderQty?.trim() || Number.isNaN(Number(form.minOrderQty)) || Number(form.minOrderQty) < 1) {
    errors.minOrderQty = 'MOQ is required (minimum 1)';
  }

  req(errors, 'variantMapping', form.variantMapping, 'Variant mapping is required');

  return errors;
}

/** Scroll to the first invalid field — no tab switching. */
export function focusFirstProductFormError(errors: Record<string, string>) {
  const field = PRODUCT_REQUIRED_FIELD_ORDER.find((f) => errors[f]);
  if (!field) return;
  setTimeout(() => {
    const el = document.getElementById(`ff-${field}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true });
  }, 60);
}
