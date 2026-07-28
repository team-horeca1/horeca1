/**
 * Indian GST place-of-supply helpers for tax invoices.
 * Intra-state → CGST + SGST; inter-state → IGST.
 */

/** GSTIN first-two-digit → canonical state/UT name. */
const GSTIN_STATE_BY_CODE: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

const STATE_ALIASES: Record<string, string> = {
  jammuandkashmir: 'Jammu and Kashmir',
  jammukashmir: 'Jammu and Kashmir',
  jk: 'Jammu and Kashmir',
  himachalpradesh: 'Himachal Pradesh',
  hp: 'Himachal Pradesh',
  punjab: 'Punjab',
  pb: 'Punjab',
  chandigarh: 'Chandigarh',
  ch: 'Chandigarh',
  uttarakhand: 'Uttarakhand',
  uttaranchal: 'Uttarakhand',
  uk: 'Uttarakhand',
  ua: 'Uttarakhand',
  haryana: 'Haryana',
  hr: 'Haryana',
  delhi: 'Delhi',
  nctofdelhi: 'Delhi',
  nctdelhi: 'Delhi',
  dl: 'Delhi',
  newdelhi: 'Delhi',
  rajasthan: 'Rajasthan',
  rj: 'Rajasthan',
  uttarpradesh: 'Uttar Pradesh',
  up: 'Uttar Pradesh',
  bihar: 'Bihar',
  br: 'Bihar',
  sikkim: 'Sikkim',
  sk: 'Sikkim',
  arunachalpradesh: 'Arunachal Pradesh',
  ar: 'Arunachal Pradesh',
  nagaland: 'Nagaland',
  nl: 'Nagaland',
  manipur: 'Manipur',
  mn: 'Manipur',
  mizoram: 'Mizoram',
  mz: 'Mizoram',
  tripura: 'Tripura',
  tr: 'Tripura',
  meghalaya: 'Meghalaya',
  ml: 'Meghalaya',
  assam: 'Assam',
  as: 'Assam',
  westbengal: 'West Bengal',
  wb: 'West Bengal',
  jharkhand: 'Jharkhand',
  jh: 'Jharkhand',
  odisha: 'Odisha',
  orissa: 'Odisha',
  or: 'Odisha',
  od: 'Odisha',
  chhattisgarh: 'Chhattisgarh',
  chattisgarh: 'Chhattisgarh',
  cg: 'Chhattisgarh',
  madhyapradesh: 'Madhya Pradesh',
  mp: 'Madhya Pradesh',
  gujarat: 'Gujarat',
  gj: 'Gujarat',
  dadraandnagarhavelianddamananddiu: 'Dadra and Nagar Haveli and Daman and Diu',
  dadraandnagarhaveli: 'Dadra and Nagar Haveli and Daman and Diu',
  damananddiu: 'Dadra and Nagar Haveli and Daman and Diu',
  dn: 'Dadra and Nagar Haveli and Daman and Diu',
  dd: 'Dadra and Nagar Haveli and Daman and Diu',
  maharashtra: 'Maharashtra',
  mh: 'Maharashtra',
  andhrapradesh: 'Andhra Pradesh',
  ap: 'Andhra Pradesh',
  karnataka: 'Karnataka',
  ka: 'Karnataka',
  goa: 'Goa',
  ga: 'Goa',
  lakshadweep: 'Lakshadweep',
  ld: 'Lakshadweep',
  kerala: 'Kerala',
  kl: 'Kerala',
  tamilnadu: 'Tamil Nadu',
  tn: 'Tamil Nadu',
  puducherry: 'Puducherry',
  pondicherry: 'Puducherry',
  py: 'Puducherry',
  andamanandnicobarislands: 'Andaman and Nicobar Islands',
  andaman: 'Andaman and Nicobar Islands',
  an: 'Andaman and Nicobar Islands',
  telangana: 'Telangana',
  ts: 'Telangana',
  tg: 'Telangana',
  ladakh: 'Ladakh',
  la: 'Ladakh',
};

function keyOf(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeIndianState(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed === '—') return null;
  const alias = STATE_ALIASES[keyOf(trimmed)];
  if (alias) return alias;
  // Already a canonical name from the GSTIN map
  const fromMap = Object.values(GSTIN_STATE_BY_CODE).find(
    (s) => keyOf(s) === keyOf(trimmed),
  );
  return fromMap ?? trimmed.replace(/\s+/g, ' ');
}

export function stateFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin) return null;
  const cleaned = gstin.replace(/\s+/g, '').toUpperCase();
  if (cleaned.length < 2) return null;
  return GSTIN_STATE_BY_CODE[cleaned.slice(0, 2)] ?? null;
}

export function resolveState(opts: {
  state?: string | null;
  gstin?: string | null;
}): string | null {
  return normalizeIndianState(opts.state) ?? stateFromGstin(opts.gstin);
}

export type GstSupplyType = 'intra' | 'inter' | 'unknown';

export function resolveSupplyType(
  sellerState: string | null,
  buyerState: string | null,
): GstSupplyType {
  const a = normalizeIndianState(sellerState);
  const b = normalizeIndianState(buyerState);
  if (!a || !b) return 'unknown';
  return keyOf(a) === keyOf(b) ? 'intra' : 'inter';
}

export function splitGstTax(totalTax: number, supplyType: GstSupplyType): {
  cgst: number;
  sgst: number;
  igst: number;
} {
  const tax = Math.round(totalTax * 100) / 100;
  // Missing place-of-supply → keep legacy intra split (marketplace default).
  if (supplyType === 'inter') {
    return { cgst: 0, sgst: 0, igst: tax };
  }
  const half = Math.round((tax / 2) * 100) / 100;
  return { cgst: half, sgst: Math.round((tax - half) * 100) / 100, igst: 0 };
}

export function formatLineTaxRate(taxPercent: number, supplyType: GstSupplyType): string {
  const half = (taxPercent / 2).toFixed(1).replace(/\.0$/, '');
  const full = taxPercent.toFixed(1).replace(/\.0$/, '');
  if (supplyType === 'inter') return `0+0+${full}+0`;
  return `${half}+${half}+0+0`;
}
