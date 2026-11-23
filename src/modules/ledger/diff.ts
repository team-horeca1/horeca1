import { prisma } from '@/lib/prisma';
import { rupeesToPaise } from './money';

export interface DiffRow {
  id: string;
  expected: string;
  actual: string;
  difference: string;
  likelyCause: string;
}

function inrFromPaise(paise: number): string {
  const abs = Math.abs(paise);
  return `${paise < 0 ? '-' : ''}${(abs / 100).toFixed(2)}`;
}

/** Compare the journal with the books that still move money. Read only. */
export async function buildDifferenceReport(): Promise<{ orders: DiffRow[]; customers: DiffRow[] }> {
  const orders = await prisma.order.findMany({
    where: { status: 'delivered' },
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      paymentMethod: true,
      walletApplied: true,
    },
    take: 200,
    orderBy: { createdAt: 'desc' },
  });
  const ids = orders.map((order) => order.id);
  const [payables, walletTxns, journalLines] = await Promise.all([
    prisma.supplierPayableLine.findMany({
      where: { orderId: { in: ids } },
      select: { orderId: true, netPayable: true },
    }),
    prisma.vendorWalletTxn.findMany({
      where: { referenceId: { in: ids } },
      select: { referenceId: true, type: true, amount: true },
    }),
    prisma.journalLine.findMany({
      where: {
        entry: { eventRefId: { in: ids }, eventType: { in: ['funded_deliver', 'credit_release', 'gateway_fee'] } },
        account: { code: { startsWith: 'PAYABLE:' } },
      },
      select: { debitPaise: true, creditPaise: true, entry: { select: { eventRefId: true } } },
    }),
  ]);
  const payableByOrder = new Map(payables.map((row) => [row.orderId, rupeesToPaise(row.netPayable)]));
  const vendorNet = new Map<string, number>();
  for (const row of walletTxns) {
    if (!row.referenceId) continue;
    const amount = rupeesToPaise(row.amount);
    const signed = row.type === 'order_credit' ? amount : -amount;
    vendorNet.set(row.referenceId, (vendorNet.get(row.referenceId) ?? 0) + signed);
  }
  const journalNet = new Map<string, number>();
  for (const row of journalLines) {
    const id = row.entry.eventRefId;
    journalNet.set(id, (journalNet.get(id) ?? 0) + row.creditPaise - row.debitPaise);
  }

  const orderRows: DiffRow[] = orders.map((order) => {
    if (order.paymentMethod === 'cod') {
      return {
        id: order.orderNumber,
        expected: '0.00',
        actual: '0.00',
        difference: '0.00',
        likelyCause: 'legacy, unsupported',
      };
    }
    const expected = journalNet.get(order.id) ?? 0;
    const actual = payableByOrder.get(order.id) ?? 0;
    const vendor = vendorNet.get(order.id) ?? 0;
    const walletFunded = rupeesToPaise(order.walletApplied);
    const difference = expected - actual;
    let likelyCause = 'match';
    if (expected === 0 && (actual !== 0 || vendor !== 0)) likelyCause = 'no journal entry yet';
    else if (walletFunded > 0 && difference !== 0) likelyCause = 'wallet-funded amount not in payout';
    else if (expected !== vendor) likelyCause = 'vendor wallet uses a flat 2 percent gateway fee';
    else if (difference !== 0) likelyCause = 'payable and journal use different commission or fee';
    return {
      id: order.orderNumber,
      expected: inrFromPaise(expected),
      actual: inrFromPaise(actual),
      difference: inrFromPaise(difference),
      likelyCause: walletFunded > 0 ? `${likelyCause}; wallet-funded ${inrFromPaise(walletFunded)}` : likelyCause,
    };
  });

  const wallets = await prisma.wallet.findMany({ select: { userId: true, balance: true }, take: 200 });
  const userIds = wallets.map((wallet) => wallet.userId);
  const walletLines = userIds.length === 0
    ? []
    : await prisma.journalLine.findMany({
      where: { account: { OR: userIds.map((userId) => ({ code: { startsWith: `WALLET:${userId}:` } })) } },
      select: { debitPaise: true, creditPaise: true, account: { select: { code: true } } },
    });
  const journalWallet = new Map<string, number>();
  for (const row of walletLines) {
    const userId = row.account.code.split(':')[1] ?? '';
    journalWallet.set(userId, (journalWallet.get(userId) ?? 0) + row.creditPaise - row.debitPaise);
  }
  const customers: DiffRow[] = wallets.map((wallet) => {
    const expected = journalWallet.get(wallet.userId) ?? 0;
    const actual = rupeesToPaise(wallet.balance);
    return {
      id: wallet.userId,
      expected: inrFromPaise(expected),
      actual: inrFromPaise(actual),
      difference: inrFromPaise(expected - actual),
      likelyCause: expected === actual ? 'match' : 'journal is shadow; balance still comes from wallets.balance',
    };
  });
  return { orders: orderRows, customers };
}
