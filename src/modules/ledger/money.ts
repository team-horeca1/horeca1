/** Convert at the journal boundary. App amounts stay Decimal rupees. */

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
  const third = fracRaw.replace(/[^\d]/g, '')[2];
  let paise = Number(whole) * 100 + Number(frac);
  if (third != null && Number(third) >= 5) paise += 1;
  if (!Number.isSafeInteger(paise)) throw new Error(`Amount is outside the safe paise range: ${raw}`);
  return negative ? -paise : paise;
}

export function paiseToRupees(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  return `${negative ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Commission in paise. ratePct is a percent such as 10 or 2.5. Half-up. */
export function commissionPaise(basePaise: number, ratePct: number): number {
  if (basePaise <= 0 || !(ratePct > 0)) return 0;
  return Math.round((basePaise * ratePct) / 100);
}

export type Side = 'debit' | 'credit';

export interface DraftLine {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'income' | 'expense';
  ownerType?: string | null;
  ownerId?: string | null;
  debitPaise: number;
  creditPaise: number;
  sourceTag?: string | null;
  funderType?: string | null;
  funderId?: string | null;
  memo?: string | null;
}

export function line(
  code: string,
  name: string,
  type: DraftLine['type'],
  side: Side,
  paise: number,
  extra: Partial<DraftLine> = {},
): DraftLine {
  const amount = Math.max(0, Math.round(paise));
  return {
    code,
    name,
    type,
    ownerType: extra.ownerType ?? null,
    ownerId: extra.ownerId ?? null,
    debitPaise: side === 'debit' ? amount : 0,
    creditPaise: side === 'credit' ? amount : 0,
    sourceTag: extra.sourceTag ?? null,
    funderType: extra.funderType ?? null,
    funderId: extra.funderId ?? null,
    memo: extra.memo ?? null,
  };
}

/** Make debits equal credits by adjusting the largest line. Records the adjustment in memo. */
export function balanceLines(lines: DraftLine[]): DraftLine[] {
  const kept = lines.filter((row) => row.debitPaise > 0 || row.creditPaise > 0);
  if (kept.length === 0) return [];
  const debit = kept.reduce((sum, row) => sum + row.debitPaise, 0);
  const credit = kept.reduce((sum, row) => sum + row.creditPaise, 0);
  const gap = debit - credit;
  if (gap === 0) return kept;
  let largest = 0;
  for (let i = 1; i < kept.length; i += 1) {
    const size = kept[i].debitPaise + kept[i].creditPaise;
    const best = kept[largest].debitPaise + kept[largest].creditPaise;
    if (size > best) largest = i;
  }
  const target = kept[largest];
  const note = `rounding ${gap > 0 ? 'credit' : 'debit'} ${Math.abs(gap)} paise`;
  if (gap > 0) {
    target.creditPaise += gap;
  } else if (target.debitPaise > 0) {
    target.debitPaise += -gap;
  } else {
    target.creditPaise = Math.max(0, target.creditPaise + gap);
  }
  target.memo = target.memo ? `${target.memo}; ${note}` : note;
  return kept;
}

export function totals(lines: DraftLine[]): { debit: number; credit: number } {
  return {
    debit: lines.reduce((sum, row) => sum + row.debitPaise, 0),
    credit: lines.reduce((sum, row) => sum + row.creditPaise, 0),
  };
}
