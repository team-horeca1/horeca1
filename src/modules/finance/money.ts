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

/** Split an integer paise total across weights. The last share takes the remainder so the parts sum exactly. */
export function allocatePaise(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  const sum = weights.reduce((acc, weight) => acc + Math.max(0, weight), 0);
  if (sum <= 0 || safeTotal === 0) return weights.map(() => 0);
  const shares: number[] = [];
  let used = 0;
  for (let i = 0; i < weights.length; i += 1) {
    if (i === weights.length - 1) {
      shares.push(safeTotal - used);
    } else {
      const share = Math.floor((safeTotal * Math.max(0, weights[i])) / sum);
      shares.push(share);
      used += share;
    }
  }
  return shares;
}

/** Commission in paise. ratePct is a percentage with at most two decimal places, e.g. "10.50". */
export function commissionPaise(basePaise: number, ratePct: string | null): number {
  if (ratePct == null || basePaise <= 0) return 0;
  const hundredths = rupeesToPaise(ratePct);
  return Math.round((basePaise * hundredths) / 10000);
}
