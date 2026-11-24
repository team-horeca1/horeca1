import { prisma } from '@/lib/prisma';
import { paiseToRupees } from './money';
import { customerWalletStatement, type StatementRow } from './read';

function inr(paise: number): string {
  return paiseToRupees(paise);
}

export interface AdminWalletRow {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  balance: string;
  journalReward: string;
  journalCreditNote: string;
  journalTotal: string;
}

/** Customer H1 wallets for the admin Wallets screen. */
export async function listAdminWallets(search?: string): Promise<AdminWalletRow[]> {
  const wallets = await prisma.wallet.findMany({
    where: search
      ? {
        OR: [
          { user: { fullName: { contains: search, mode: 'insensitive' } } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
          { user: { phone: { contains: search } } },
          { user: { hcidDisplay: { contains: search, mode: 'insensitive' } } },
        ],
      }
      : undefined,
    include: {
      user: { select: { id: true, fullName: true, email: true, phone: true, hcidDisplay: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  const rows: AdminWalletRow[] = [];
  for (const wallet of wallets) {
    const statement = await customerWalletStatement(wallet.userId);
    rows.push({
      userId: wallet.userId,
      name: wallet.user.fullName || wallet.user.hcidDisplay || wallet.user.email || wallet.userId.slice(0, 8),
      phone: wallet.user.phone,
      email: wallet.user.email,
      balance: Number(wallet.balance).toFixed(2),
      journalReward: statement.reward,
      journalCreditNote: statement.creditNote,
      journalTotal: statement.total,
    });
  }
  return rows;
}

export async function adminWalletDetail(userId: string): Promise<{
  user: { id: string; name: string; phone: string | null; email: string | null };
  balance: string;
  statement: Awaited<ReturnType<typeof customerWalletStatement>>;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, phone: true, email: true, hcidDisplay: true, wallet: true },
  });
  if (!user) throw new Error('Customer not found');
  const statement = await customerWalletStatement(userId);
  return {
    user: {
      id: user.id,
      name: user.fullName || user.hcidDisplay || user.email || user.id.slice(0, 8),
      phone: user.phone,
      email: user.email,
    },
    balance: user.wallet ? Number(user.wallet.balance).toFixed(2) : '0.00',
    statement,
  };
}

const EVENT_LABEL: Record<string, string> = {
  reward_issue: 'Horeca1 put money in Wallet (platform expense)',
  wallet_spend: 'Customer spent Wallet on an order',
  online_capture: 'Customer paid online (Razorpay)',
  gateway_fee: 'Razorpay fee taken from supplier payout',
  funded_deliver: 'Order delivered — supplier payable booked (full amount − commission)',
  credit_deliver: 'Credit order delivered — held for supplier',
  credit_repay: 'Customer repaid credit to Horeca1',
  credit_release: 'Held cash released to supplier payable',
  credit_note: 'Return credit note into Wallet',
  gateway_refund: 'Razorpay refund',
  payout: 'Supplier payout recorded',
  interest: 'Credit interest',
  penalty: 'Credit late fee',
  writeoff: 'Write-off',
  manual_adjustment: 'Manual adjustment',
  reversal: 'Reversal',
  order_reversal: 'Order reversal',
};

function uuidFromCode(code: string, prefixes: string[]): string | null {
  for (const prefix of prefixes) {
    if (!code.startsWith(prefix)) continue;
    const rest = code.slice(prefix.length);
    const id = rest.split(':')[0];
    if (/^[0-9a-f-]{36}$/i.test(id)) return id;
  }
  return null;
}

function roleOfAccount(code: string): string {
  if (code.startsWith('WALLET:')) return 'Customer Wallet';
  if (code.startsWith('PAYABLE:')) return 'Due to supplier';
  if (code.startsWith('HELD:')) return 'Held for supplier';
  if (code.startsWith('AR_ORDER:')) return 'Order receivable';
  if (code.startsWith('AR_CREDIT_')) return 'Credit due from customer';
  if (code === 'REWARD_EXPENSE') return 'Horeca1 expense (rewards/cashback)';
  if (code === 'COMMISSION') return 'Horeca1 commission income';
  if (code === 'GATEWAY') return 'Razorpay clearing';
  return 'Account';
}

export interface JournalEntryDetail {
  id: string;
  date: string;
  event: string;
  eventLabel: string;
  referenceType: string;
  referenceId: string;
  remarks: string | null;
  postedBy: string | null;
  summary: {
    buyer: string | null;
    supplier: string | null;
    paidHow: string | null;
    dueTo: string | null;
    platformExpense: string | null;
    totalDebit: string;
  };
  edited: boolean;
  lines: Array<{
    id: string;
    account: string;
    accountName: string;
    accountType: 'asset' | 'liability' | 'income' | 'expense';
    role: string;
    party: string | null;
    debit: string;
    credit: string;
    memo: string | null;
    source: string | null;
    funder: string | null;
    funderType: string | null;
    funderId: string | null;
  }>;
}

/** Recent journal entries with every line — who / what / due. */
export async function listJournalEntries(opts?: {
  search?: string;
  eventType?: string;
  limit?: number;
}): Promise<JournalEntryDetail[]> {
  const limit = opts?.limit ?? 80;
  const [rawEntries, undone] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        reversesEntryId: null,
        ...(opts?.eventType ? { eventType: opts.eventType } : {}),
        ...(opts?.search
          ? {
            OR: [
              { eventRefId: { contains: opts.search } },
              { idempotencyKey: { contains: opts.search } },
              { remarks: { contains: opts.search, mode: 'insensitive' } },
            ],
          }
          : {}),
      },
      include: {
        lines: { include: { account: true }, orderBy: { debitPaise: 'desc' } },
      },
      orderBy: { occurredAt: 'desc' },
      take: limit * 3,
    }),
    prisma.journalEntry.findMany({
      where: { reversesEntryId: { not: null } },
      select: { reversesEntryId: true },
    }),
  ]);
  const hidden = new Set(
    undone.map((row) => row.reversesEntryId).filter((id): id is string => !!id),
  );
  const entries = rawEntries.filter((entry) => !hidden.has(entry.id)).slice(0, limit);

  const userIds = new Set<string>();
  const vendorIds = new Set<string>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const code = line.account.code;
      const uid = uuidFromCode(code, ['WALLET:', 'AR_CREDIT_H1:', 'AR_CREDIT_SUP:']);
      if (uid) userIds.add(uid);
      const vid = uuidFromCode(code, ['PAYABLE:', 'HELD:']);
      if (vid) vendorIds.add(vid);
      if (line.funderType === 'supplier' && line.funderId) vendorIds.add(line.funderId);
      if (line.account.ownerType === 'customer' && line.account.ownerId) userIds.add(line.account.ownerId);
      if (line.account.ownerType === 'supplier' && line.account.ownerId) vendorIds.add(line.account.ownerId);
    }
  }

  const [users, vendors] = await Promise.all([
    userIds.size
      ? prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, fullName: true, phone: true, hcidDisplay: true, email: true },
      })
      : Promise.resolve([]),
    vendorIds.size
      ? prisma.vendor.findMany({
        where: { id: { in: [...vendorIds] } },
        select: { id: true, displayName: true, businessName: true },
      })
      : Promise.resolve([]),
  ]);

  const userName = new Map(
    users.map((u) => [
      u.id,
      u.fullName || u.hcidDisplay || u.phone || u.email || u.id.slice(0, 8),
    ]),
  );
  const vendorName = new Map(
    vendors.map((v) => [v.id, v.displayName || v.businessName]),
  );

  const partyFor = (code: string, ownerType: string | null, ownerId: string | null): string | null => {
    if (ownerType === 'customer' && ownerId) return userName.get(ownerId) ?? ownerId.slice(0, 8);
    if (ownerType === 'supplier' && ownerId) return vendorName.get(ownerId) ?? ownerId.slice(0, 8);
    const uid = uuidFromCode(code, ['WALLET:', 'AR_CREDIT_H1:', 'AR_CREDIT_SUP:']);
    if (uid) return userName.get(uid) ?? uid.slice(0, 8);
    const vid = uuidFromCode(code, ['PAYABLE:', 'HELD:']);
    if (vid) return vendorName.get(vid) ?? vid.slice(0, 8);
    if (code === 'REWARD_EXPENSE' || code === 'COMMISSION' || code === 'GATEWAY') return 'Horeca1';
    return null;
  };

  return entries.map((entry) => {
    const lines = entry.lines.map((line) => ({
      id: line.id,
      account: line.account.code,
      accountName: line.account.name,
      accountType: line.account.type as 'asset' | 'liability' | 'income' | 'expense',
      role: roleOfAccount(line.account.code),
      party: partyFor(line.account.code, line.account.ownerType, line.account.ownerId),
      debit: inr(line.debitPaise),
      credit: inr(line.creditPaise),
      memo: line.memo,
      source: line.sourceTag,
      funder: line.funderType
        ? line.funderType === 'platform'
          ? 'Horeca1 (platform)'
          : line.funderType === 'supplier'
            ? `Supplier${line.funderId ? `: ${vendorName.get(line.funderId) ?? line.funderId.slice(0, 8)}` : ''}`
            : line.funderType
        : null,
      funderType: line.funderType,
      funderId: line.funderId,
    }));

    const walletLine = lines.find((l) => l.account.startsWith('WALLET:'));
    const payableLine = lines.find((l) => l.account.startsWith('PAYABLE:') && Number(l.credit) > 0);
    const heldLine = lines.find((l) => l.account.startsWith('HELD:') && Number(l.credit) > 0);
    const expenseLine = lines.find((l) => l.account === 'REWARD_EXPENSE' && Number(l.debit) > 0);
    const totalDebit = inr(entry.lines.reduce((sum, l) => sum + l.debitPaise, 0));

    let paidHow: string | null = null;
    if (entry.eventType === 'wallet_spend') paidHow = 'H1 Wallet (Horeca1 responsibility — supplier still gets full funded payout)';
    else if (entry.eventType === 'online_capture') paidHow = 'Online / Razorpay';
    else if (entry.eventType === 'credit_deliver' || entry.eventType === 'credit_repay') paidHow = 'DiSCCO credit';
    else if (entry.eventType === 'reward_issue') paidHow = 'Platform grant (cashback / reward)';
    else if (entry.eventType === 'funded_deliver') paidHow = 'Delivery booked — payables ignore how customer paid';

    return {
      id: entry.id,
      date: entry.occurredAt.toISOString(),
      event: entry.eventType,
      eventLabel: EVENT_LABEL[entry.eventType] ?? entry.eventType,
      referenceType: entry.eventRefType,
      referenceId: entry.eventRefId,
      remarks: entry.remarks,
      postedBy: entry.postedBy,
      edited: entry.reasonCode === 'entry_edit',
      summary: {
        buyer: walletLine?.party
          ?? lines.find((l) => l.account.startsWith('AR_CREDIT_'))?.party
          ?? null,
        supplier: payableLine?.party ?? heldLine?.party ?? null,
        paidHow,
        dueTo: payableLine
          ? `Supplier ₹${payableLine.credit}`
          : heldLine
            ? `Held for supplier ₹${heldLine.credit}`
            : null,
        platformExpense: expenseLine ? `₹${expenseLine.debit}` : null,
        totalDebit,
      },
      lines,
    };
  });
}

export type { StatementRow };
