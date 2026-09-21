/**
 * Suggestion-only India pincode → city/area lookup.
 * Sourced from a curated subset of the India Post / data.gov.in directory.
 * Never validates or rejects a pincode — missing entries return null.
 */

import pincodeData from '../../data/india-pincodes.json';

export type PincodeSuggestion = {
  city: string;
  area: string;
};

type PincodeEntry = { city: string; area: string };

const META_KEYS = new Set(['_source']);

const LOOKUP: Record<string, PincodeEntry> = (() => {
  const out: Record<string, PincodeEntry> = {};
  for (const [key, value] of Object.entries(pincodeData as Record<string, unknown>)) {
    if (META_KEYS.has(key)) continue;
    if (
      value &&
      typeof value === 'object' &&
      'city' in value &&
      'area' in value &&
      typeof (value as PincodeEntry).city === 'string' &&
      typeof (value as PincodeEntry).area === 'string'
    ) {
      out[key] = { city: (value as PincodeEntry).city, area: (value as PincodeEntry).area };
    }
  }
  return out;
})();

/** Normalize to digits-only 6-char pincode when possible. */
export function normalizePincode(pincode: string): string {
  return pincode.trim().replace(/\D/g, '');
}

/**
 * Return a suggested city + area for a pincode, or null if unknown.
 * Callers must treat this as editable free-text prefill only.
 */
export function lookupPincode(pincode: string): PincodeSuggestion | null {
  const key = normalizePincode(pincode);
  if (!key) return null;
  const hit = LOOKUP[key];
  if (!hit) return null;
  return { city: hit.city, area: hit.area };
}
