import type { Prisma } from '@prisma/client';
import type { DraftLine } from './money';
import { totals } from './money';

export interface PostInput {
  eventType: string;
  eventRefType: string;
  eventRefId: string;
  idempotencyKey: string;
  postedBy?: string | null;
  approvedBy?: string | null;
  reasonCode?: string | null;
  remarks?: string | null;
  reversesEntryId?: string | null;
  lines: DraftLine[];
}

const APPROVAL_EVENTS = new Set(['writeoff', 'manual_adjustment', 'reversal', 'batch_approve']);

export async function postJournal(tx: Prisma.TransactionClient, input: PostInput): Promise<{ id: string; replayed: boolean }> {
  const existing = await tx.journalEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { id: existing.id, replayed: true };

  const lines = input.lines.filter((row) => row.debitPaise > 0 || row.creditPaise > 0);
  const sum = totals(lines);
  if (lines.length === 0 || sum.debit !== sum.credit || sum.debit <= 0) {
    throw new Error(`Refusing unbalanced journal ${input.idempotencyKey}: ${sum.debit}/${sum.credit}`);
  }
  if (APPROVAL_EVENTS.has(input.eventType)) {
    if (!input.approvedBy || input.approvedBy === input.postedBy) {
      throw new Error('Approver must be a different person');
    }
  }
  if (input.reversesEntryId) {
    const prior = await tx.journalEntry.findFirst({
      where: { reversesEntryId: input.reversesEntryId },
      select: { id: true },
    });
    if (prior) throw new Error('Entry already reversed');
    const original = await tx.journalLine.aggregate({
      where: { entryId: input.reversesEntryId },
      _sum: { debitPaise: true },
    });
    if (sum.debit > Number(original._sum.debitPaise ?? 0)) {
      throw new Error('Reversal is larger than the original entry');
    }
  }

  const entry = await tx.journalEntry.create({
    data: {
      eventType: input.eventType,
      eventRefType: input.eventRefType,
      eventRefId: input.eventRefId,
      idempotencyKey: input.idempotencyKey,
      postedBy: input.postedBy ?? null,
      approvedBy: input.approvedBy ?? null,
      reasonCode: input.reasonCode ?? null,
      remarks: input.remarks ?? null,
      reversesEntryId: input.reversesEntryId ?? null,
    },
  });

  for (const row of lines) {
    const account = await tx.ledgerAccount.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        type: row.type,
        ownerType: row.ownerType ?? null,
        ownerId: row.ownerId ?? null,
      },
      update: {},
    });
    await tx.journalLine.create({
      data: {
        entryId: entry.id,
        accountId: account.id,
        debitPaise: row.debitPaise,
        creditPaise: row.creditPaise,
        sourceTag: row.sourceTag ?? null,
        funderType: row.funderType ?? null,
        funderId: row.funderId ?? null,
        memo: row.memo ?? null,
      },
    });
  }
  return { id: entry.id, replayed: false };
}

export function reversalLines(original: DraftLine[]): DraftLine[] {
  return original.map((row) => ({
    ...row,
    debitPaise: row.creditPaise,
    creditPaise: row.debitPaise,
    memo: row.memo ? `reversal of ${row.memo}` : 'reversal',
  }));
}
