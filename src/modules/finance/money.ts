/** Exact rupee/paise conversion. Never uses binary floating point for the result. */

export function rupeesToPaise(value: string | number | { toString(): string } | null | undefined): number {
  if (value == null) return 0;
  const raw = typeof value === 'number' ? value.toFixed(2) : value.toString();
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholeRaw, fracRaw = ''] = unsigned.split('.');
  const whole = wholeRaw.replace(/[^\d]/g, '') || '0';
  const frac = (fracRaw.replace(/[^\d]/g, '') + '00').slice(0, 2);
  const paise = Number(whole) * 100 + Number(frac);
  if (!Number.isSafeInteger(paise)) {
    throw new Error(`Amount is outside the safe paise range: ${raw}`);
  }
  return negative ? -paise : paise;
}

export function paiseToRupees(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** Commission in paise. ratePct is a percentage with at most two decimal places, e.g. "10.50". */
export function commissionPaise(basePaise: number, ratePct: string | null): number {
  if (ratePct == null || basePaise <= 0) return 0;
  const hundredths = rupeesToPaise(ratePct);
  return Math.round((basePaise * hundredths) / 10000);
}
