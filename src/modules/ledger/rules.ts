import { balanceLines, commissionPaise, line, type DraftLine } from './money';

export interface WalletBucket {
  /** reward | credit_note */
  source: 'reward' | 'credit_note';
  paise: number;
  /** Oldest first within the source. */
  createdAt: string;
  funderType: 'platform' | 'supplier';
  funderId: string | null;
  tag: string;
}

const wallet = (userId: string, tag: string) => `WALLET:${userId}:${tag}`;

export function rewardIssue(userId: string, paise: number, tag = 'reward'): DraftLine[] {
  return balanceLines([
    line('REWARD_EXPENSE', 'Platform Reward Expense', 'expense', 'debit', paise, { ownerType: 'platform' }),
    line(wallet(userId, tag), 'Customer Wallet', 'liability', 'credit', paise, {
      ownerType: 'customer',
      ownerId: userId,
      sourceTag: 'reward',
      funderType: 'platform',
      memo: 'reward_issued',
    }),
  ]);
}

export function creditNoteIssue(userId: string, supplierId: string, paise: number): DraftLine[] {
  const tag = `cn:${supplierId}`;
  return balanceLines([
    line(`HELD:${supplierId}`, 'Held for Supplier', 'liability', 'debit', paise, {
      ownerType: 'supplier',
      ownerId: supplierId,
      memo: 'credit_note_funded_by_supplier',
    }),
    line(wallet(userId, tag), 'Customer Wallet', 'liability', 'credit', paise, {
      ownerType: 'customer',
      ownerId: userId,
      sourceTag: 'credit_note',
      funderType: 'supplier',
      funderId: supplierId,
    }),
  ]);
}

/** Spend credit-note buckets first, then rewards, oldest first. */
export function allocateSpend(buckets: WalletBucket[], spendPaise: number): WalletBucket[] {
  const ordered = [...buckets].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'credit_note' ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
  let left = spendPaise;
  const used: WalletBucket[] = [];
  for (const bucket of ordered) {
    if (left <= 0) break;
    const take = Math.min(bucket.paise, left);
    if (take <= 0) continue;
    used.push({ ...bucket, paise: take });
    left -= take;
  }
  return used;
}

export function walletSpend(userId: string, orderId: string, used: WalletBucket[]): DraftLine[] {
  const lines: DraftLine[] = [];
  let total = 0;
  for (const bucket of used) {
    total += bucket.paise;
    lines.push(line(wallet(userId, bucket.tag), 'Customer Wallet', 'liability', 'debit', bucket.paise, {
      ownerType: 'customer',
      ownerId: userId,
      sourceTag: bucket.source,
      funderType: bucket.funderType,
      funderId: bucket.funderId,
      memo: 'reward_redeemed',
    }));
  }
  lines.push(line(`AR_ORDER:${orderId}`, 'Order Receivable', 'asset', 'credit', total, {
    ownerType: 'order',
    ownerId: orderId,
  }));
  return balanceLines(lines);
}

export function onlineCapture(orderId: string, paise: number): DraftLine[] {
  return balanceLines([
    line('GATEWAY', 'Gateway Clearing', 'asset', 'debit', paise, { ownerType: 'platform' }),
    line(`AR_ORDER:${orderId}`, 'Order Receivable', 'asset', 'credit', paise, {
      ownerType: 'order',
      ownerId: orderId,
    }),
  ]);
}

export function gatewayFee(vendorId: string, feePaise: number): DraftLine[] {
  if (feePaise <= 0) return [];
  return balanceLines([
    line(`PAYABLE:${vendorId}`, 'Supplier Payable', 'liability', 'debit', feePaise, {
      ownerType: 'supplier',
      ownerId: vendorId,
      memo: 'razorpay_fee',
    }),
    line('GATEWAY', 'Gateway Clearing', 'asset', 'credit', feePaise, { ownerType: 'platform', memo: 'razorpay_fee' }),
  ]);
}

/** Funded delivery: supplier is paid the full subtotal minus commission. */
export function fundedDelivery(orderId: string, vendorId: string, subtotalPaise: number, ratePct: number | null): {
  lines: DraftLine[];
  flagged: boolean;
} {
  if (ratePct == null) {
    return { lines: [], flagged: true };
  }
  const commission = commissionPaise(subtotalPaise, ratePct);
  const payable = subtotalPaise - commission;
  return {
    flagged: false,
    lines: balanceLines([
      line(`AR_ORDER:${orderId}`, 'Order Receivable', 'asset', 'debit', subtotalPaise, {
        ownerType: 'order',
        ownerId: orderId,
      }),
      line(`PAYABLE:${vendorId}`, 'Supplier Payable', 'liability', 'credit', payable, {
        ownerType: 'supplier',
        ownerId: vendorId,
      }),
      line('COMMISSION', 'Commission Revenue', 'income', 'credit', commission, { ownerType: 'platform' }),
    ]),
  };
}

/** Credit delivery: commission booked, remainder held for the order's supplier, nothing payable yet. */
export function creditDelivery(
  userId: string,
  supplierId: string,
  horeca1Line: boolean,
  orderId: string,
  subtotalPaise: number,
  ratePct: number | null,
): { lines: DraftLine[]; flagged: boolean } {
  if (ratePct == null) return { lines: [], flagged: true };
  const commission = commissionPaise(subtotalPaise, ratePct);
  const held = subtotalPaise - commission;
  const code = horeca1Line
    ? `AR_CREDIT_H1:${userId}`
    : `AR_CREDIT_SUP:${userId}:${supplierId}`;
  return {
    flagged: false,
    lines: balanceLines([
      line(code, horeca1Line ? 'Credit Receivable (Horeca1 line)' : 'Credit Receivable (supplier line)', 'asset', 'debit', subtotalPaise, {
        ownerType: 'customer',
        ownerId: userId,
      }),
      line(`HELD:${supplierId}`, 'Held for Supplier', 'liability', 'credit', held, {
        ownerType: 'supplier',
        ownerId: supplierId,
        memo: orderId,
      }),
      line('COMMISSION', 'Commission Revenue', 'income', 'credit', commission, { ownerType: 'platform' }),
    ]),
  };
}

/**
 * Release held to payable for cash collected. net = collected * (subtotal - commission) / subtotal.
 * Fee, when known, is taken off the payable in a following gatewayFee entry.
 */
export function creditRelease(
  vendorId: string,
  orderSubtotalPaise: number,
  ratePct: number,
  collectedPaise: number,
): DraftLine[] {
  if (collectedPaise <= 0 || orderSubtotalPaise <= 0) return [];
  const commission = commissionPaise(orderSubtotalPaise, ratePct);
  const netRatio = orderSubtotalPaise - commission;
  const release = Math.round((collectedPaise * netRatio) / orderSubtotalPaise);
  const capped = Math.min(release, netRatio);
  return balanceLines([
    line(`HELD:${vendorId}`, 'Held for Supplier', 'liability', 'debit', capped, {
      ownerType: 'supplier',
      ownerId: vendorId,
    }),
    line(`PAYABLE:${vendorId}`, 'Supplier Payable', 'liability', 'credit', capped, {
      ownerType: 'supplier',
      ownerId: vendorId,
    }),
  ]);
}

export function repaymentCash(userId: string, vendorId: string | null, paise: number): DraftLine[] {
  const code = vendorId
    ? `AR_CREDIT_SUP:${userId}:${vendorId}`
    : `AR_CREDIT_H1:${userId}`;
  return balanceLines([
    line('GATEWAY', 'Gateway Clearing', 'asset', 'debit', paise, { ownerType: 'platform' }),
    line(code, 'Credit Receivable', 'asset', 'credit', paise, { ownerType: 'customer', ownerId: userId }),
  ]);
}

export function interestOrPenalty(userId: string, vendorId: string | null, paise: number, kind: 'interest' | 'penalty'): DraftLine[] {
  const code = vendorId ? `AR_CREDIT_SUP:${userId}:${vendorId}` : `AR_CREDIT_H1:${userId}`;
  const income = kind === 'interest' ? 'INTEREST_INCOME' : 'PENALTY_INCOME';
  return balanceLines([
    line(code, 'Credit Receivable', 'asset', 'debit', paise, { ownerType: 'customer', ownerId: userId }),
    line(income, kind === 'interest' ? 'Interest Income' : 'Penalty Income', 'income', 'credit', paise, { ownerType: 'platform' }),
  ]);
}

export function writeOffPending(userId: string, vendorId: string | null, paise: number): DraftLine[] {
  const code = vendorId ? `AR_CREDIT_SUP:${userId}:${vendorId}` : `AR_CREDIT_H1:${userId}`;
  return balanceLines([
    line('WRITEOFF_PENDING', 'Write-off Pending Allocation', 'asset', 'debit', paise, { ownerType: 'platform' }),
    line(code, 'Credit Receivable', 'asset', 'credit', paise, { ownerType: 'customer', ownerId: userId }),
  ]);
}

export function supplierPayout(vendorId: string, paise: number): DraftLine[] {
  return balanceLines([
    line(`PAYABLE:${vendorId}`, 'Supplier Payable', 'liability', 'debit', paise, {
      ownerType: 'supplier',
      ownerId: vendorId,
      memo: 'payout',
    }),
    line('BANK', 'Bank', 'asset', 'credit', paise, { ownerType: 'platform', memo: 'payout' }),
  ]);
}

export function gatewayRefund(orderId: string, paise: number): DraftLine[] {
  return balanceLines([
    line('REFUND_CLEARING', 'Refund Clearing', 'liability', 'debit', paise, { ownerType: 'platform' }),
    line('GATEWAY', 'Gateway Clearing', 'asset', 'credit', paise, { ownerType: 'platform', memo: orderId }),
  ]);
}

export function knownReference(referenceType: string | null | undefined): boolean {
  if (referenceType == null || referenceType === '') return true;
  return [
    'cashback',
    'welcome',
    'first_order',
    'referral',
    'payout_invite',
    'direct_grant',
    'return_credit_note',
    'order_redemption',
    'order_redemption_refund',
    'cashback_reversal',
  ].includes(referenceType);
}

export function sourceForReference(referenceType: string | null | undefined): {
  source: string;
  funderType: string;
} | null {
  switch (referenceType) {
    case 'cashback':
    case 'welcome':
    case 'first_order':
    case 'referral':
    case 'payout_invite':
    case 'direct_grant':
      return { source: 'reward', funderType: 'platform' };
    case 'return_credit_note':
      return { source: 'credit_note', funderType: 'supplier' };
    case 'order_redemption':
    case 'order_redemption_refund':
    case 'cashback_reversal':
      return { source: referenceType, funderType: 'platform' };
    default:
      return null;
  }
}
