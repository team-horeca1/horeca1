import type { Prisma } from '@prisma/client';
import { postJournal, reversalLines } from './post';
import { rupeesToPaise, type DraftLine } from './money';

export interface CorrectionLineInput {
  code: string;
  name: string;
  type: DraftLine['type'];
  debitRupees: string;
  creditRupees: string;
  memo?: string | null;
  sourceTag?: string | null;
  funderType?: string | null;
  funderId?: string | null;
}

/** Replace what an entry means by undoing it and posting the edited lines. */
export async function correctJournalEntry(
  tx: Prisma.TransactionClient,
  input: {
    entryId: string;
    postedBy: string;
    reason: string;
    lines: CorrectionLineInput[];
  },
): Promise<{ id: string }> {
  const entry = await tx.journalEntry.findUnique({
    where: { id: input.entryId },
    include: { lines: { include: { account: true } } },
  });
  if (!entry) throw new Error('Journal entry not found');
  if (entry.reversesEntryId) throw new Error('This entry cannot be edited');

  const already = await tx.journalEntry.findFirst({
    where: { reversesEntryId: entry.id },
    select: { id: true },
  });
  if (already) throw new Error('This entry was already corrected');

  const lines = toDraftLines(input.lines);
  const original: DraftLine[] = entry.lines.map((row) => ({
    code: row.account.code,
    name: row.account.name,
    type: row.account.type as DraftLine['type'],
    ownerType: row.account.ownerType,
    ownerId: row.account.ownerId,
    debitPaise: row.debitPaise,
    creditPaise: row.creditPaise,
    sourceTag: row.sourceTag,
    funderType: row.funderType,
    funderId: row.funderId,
    memo: row.memo,
  }));

  await postJournal(tx, {
    eventType: 'entry_edit',
    eventRefType: entry.eventRefType,
    eventRefId: entry.eventRefId,
    idempotencyKey: `edit-undo:${entry.id}`,
    postedBy: input.postedBy,
    reasonCode: 'entry_edit',
    remarks: input.reason,
    reversesEntryId: entry.id,
    lines: reversalLines(original),
  });

  const posted = await postJournal(tx, {
    eventType: entry.eventType,
    eventRefType: entry.eventRefType,
    eventRefId: entry.eventRefId,
    idempotencyKey: `edit:${entry.id}:${Date.now()}`,
    postedBy: input.postedBy,
    reasonCode: 'entry_edit',
    remarks: input.reason,
    lines,
  });
  return { id: posted.id };
}

function toDraftLines(rows: CorrectionLineInput[]): DraftLine[] {
  const lines: DraftLine[] = [];
  for (const row of rows) {
    const debitPaise = rupeesToPaise(row.debitRupees || '0');
    const creditPaise = rupeesToPaise(row.creditRupees || '0');
    if (debitPaise < 0 || creditPaise < 0) throw new Error('Amounts cannot be negative');
    if (debitPaise > 0 && creditPaise > 0) throw new Error('Each line is either a debit or a credit');
    if (debitPaise === 0 && creditPaise === 0) continue;
    const code = row.code.trim();
    const name = row.name.trim();
    if (code.length < 2 || name.length < 2) throw new Error('Each line needs an account');
    lines.push({
      code,
      name,
      type: row.type,
      debitPaise,
      creditPaise,
      memo: row.memo?.trim() || null,
      sourceTag: row.sourceTag ?? null,
      funderType: row.funderType || null,
      funderId: row.funderId || null,
    });
  }
  if (lines.length < 2) throw new Error('Keep at least two lines');
  const debit = lines.reduce((sum, row) => sum + row.debitPaise, 0);
  const credit = lines.reduce((sum, row) => sum + row.creditPaise, 0);
  if (debit !== credit || debit <= 0) throw new Error('Debits and credits must match');
  return lines;
}
