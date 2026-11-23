import { prisma } from '@/lib/prisma';
import { paiseToRupees } from './money';

export interface StatementRow {
  id: string;
  date: string;
  event: string;
  reference: string;
  debit: string;
  credit: string;
  balanceAfter: string;
  status: string;
  href: string;
}

function inr(paise: number): string {
  return paiseToRupees(paise);
}

export async function customerWalletStatement(userId: string): Promise<{
  reward: string;
  creditNote: string;
  total: string;
  rows: StatementRow[];
}> {
  const lines = await prisma.journalLine.findMany({
    where: { account: { code: { startsWith: `WALLET:${userId}:` } } },
    include: { account: true, entry: true },
    orderBy: { entry: { occurredAt: 'asc' } },
    take: 200,
  });
  let reward = 0;
  let creditNote = 0;
  let running = 0;
  const rows: StatementRow[] = lines.map((row) => {
    const delta = row.creditPaise - row.debitPaise;
    running += delta;
    if (row.account.code.includes(':cn:')) creditNote += delta;
    else reward += delta;
    return {
      id: row.id,
      date: row.entry.occurredAt.toISOString(),
      event: row.entry.eventType,
      reference: row.entry.eventRefId,
      debit: inr(row.debitPaise),
      credit: inr(row.creditPaise),
      balanceAfter: inr(running),
      status: row.memo ?? row.entry.eventType,
      href: `/admin/journal?entry=${row.entry.id}`,
    };
  });
  return { reward: inr(reward), creditNote: inr(creditNote), total: inr(running), rows };
}

export async function customerCreditStatement(userId: string): Promise<{
  horeca1: string;
  suppliers: string;
  rows: StatementRow[];
}> {
  const lines = await prisma.journalLine.findMany({
    where: {
      OR: [
        { account: { code: { startsWith: `AR_CREDIT_H1:${userId}` } } },
        { account: { code: { startsWith: `AR_CREDIT_SUP:${userId}:` } } },
      ],
    },
    include: { account: true, entry: true },
    orderBy: { entry: { occurredAt: 'asc' } },
    take: 200,
  });
  let horeca1 = 0;
  let suppliers = 0;
  let running = 0;
  const rows = lines.map((row) => {
    const delta = row.debitPaise - row.creditPaise;
    running += delta;
    if (row.account.code.startsWith('AR_CREDIT_H1:')) horeca1 += delta;
    else suppliers += delta;
    return {
      id: row.id,
      date: row.entry.occurredAt.toISOString(),
      event: row.entry.eventType,
      reference: row.entry.eventRefId,
      debit: inr(row.debitPaise),
      credit: inr(row.creditPaise),
      balanceAfter: inr(running),
      status: row.entry.remarks ?? row.entry.eventType,
      href: `/admin/journal?entry=${row.entry.id}`,
    };
  });
  return { horeca1: inr(horeca1), suppliers: inr(suppliers), rows };
}

export async function supplierPayoutSummary(vendorId: string): Promise<{
  held: string;
  payable: string;
  paidThisMonth: string;
  onHold: string;
}> {
  const held = await prisma.accountBalance.findFirst({ where: { account: { code: `HELD:${vendorId}` } } });
  const payable = await prisma.accountBalance.findFirst({ where: { account: { code: `PAYABLE:${vendorId}` } } });
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const paid = await prisma.journalLine.aggregate({
    where: {
      account: { code: `PAYABLE:${vendorId}` },
      entry: { eventType: 'payout', occurredAt: { gte: start } },
    },
    _sum: { debitPaise: true },
  });
  const heldLines = await prisma.supplierPayableLine.aggregate({
    where: { vendorId, status: 'on_hold' },
    _sum: { netPayable: true },
  });
  return {
    held: inr(held?.balancePaise ?? 0),
    payable: inr(payable?.balancePaise ?? 0),
    paidThisMonth: inr(Number(paid._sum.debitPaise ?? 0)),
    onHold: heldLines._sum.netPayable == null ? '0.00' : heldLines._sum.netPayable.toString(),
  };
}
