import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { prisma } from '@/lib/prisma';
import { postJournal, reversalLines } from '@/modules/ledger/post';
import { balanceLines, line, type DraftLine } from '@/modules/ledger/money';
import { correctJournalEntry } from '@/modules/ledger/correct';

const lineSchema = z.object({
  code: z.string().min(2).max(180),
  name: z.string().min(2).max(255),
  type: z.enum(['asset', 'liability', 'income', 'expense']),
  side: z.enum(['debit', 'credit']),
  paise: z.number().int().positive(),
});

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('adjust'),
    idempotencyKey: z.string().min(8).max(180),
    approvedBy: z.string().uuid(),
    reason: z.string().min(3).max(500),
    lines: z.array(lineSchema).min(2).max(8),
  }),
  z.object({
    action: z.literal('reverse'),
    idempotencyKey: z.string().min(8).max(180),
    approvedBy: z.string().uuid(),
    reason: z.string().min(3).max(500),
    entryId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('loss_bearer'),
    lossBearer: z.enum(['pending', 'horeca1', 'supplier', 'per_line']),
  }),
  z.object({
    action: z.literal('correct'),
    entryId: z.string().uuid(),
    reason: z.string().min(3).max(500),
    lines: z.array(z.object({
      code: z.string().min(2).max(180),
      name: z.string().min(2).max(255),
      type: z.enum(['asset', 'liability', 'income', 'expense']),
      debitRupees: z.string().max(20),
      creditRupees: z.string().max(20),
      memo: z.string().max(500).nullable().optional(),
      sourceTag: z.string().max(40).nullable().optional(),
      funderType: z.string().max(30).nullable().optional(),
      funderId: z.string().uuid().nullable().optional(),
    })).min(2).max(12),
  }),
]);

function correctionError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'Could not save this edit';
  if (/wallet overdrawn/i.test(message)) return Errors.badRequest('That edit would take the customer wallet below zero.');
  if (/unbalanced|must match/i.test(message)) return Errors.badRequest('Debits and credits must match.');
  if (/already corrected|already reversed/i.test(message)) return Errors.badRequest('This entry was already corrected. Refresh and edit the latest one.');
  if (/cannot be edited|not found|at least two|either a debit|needs an account|cannot be negative/i.test(message)) {
    return Errors.badRequest(message);
  }
  return Errors.badRequest('Could not save this edit.');
}

async function otherAdmin(actorId: string, approvedBy: string) {
  if (approvedBy === actorId) throw Errors.forbidden('A different person has to approve this');
  const approver = await prisma.user.findFirst({ where: { id: approvedBy, role: 'admin' }, select: { id: true } });
  if (!approver) throw Errors.forbidden('Approver must be another admin');
}

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    const body = bodySchema.parse(await req.json());
    if (body.action === 'loss_bearer') {
      requirePermission(ctx, 'ledger.approve');
      await prisma.ledgerSetting.upsert({
        where: { id: 'default' },
        create: { id: 'default', lossBearer: body.lossBearer },
        update: { lossBearer: body.lossBearer },
      });
      return NextResponse.json({ success: true, data: { lossBearer: body.lossBearer } });
    }

    requirePermission(ctx, 'ledger.adjust');
    if (body.action === 'correct') {
      try {
        const result = await prisma.$transaction((tx) => correctJournalEntry(tx, {
          entryId: body.entryId,
          postedBy: ctx.userId,
          reason: body.reason,
          lines: body.lines,
        }));
        return NextResponse.json({ success: true, data: result });
      } catch (error) {
        throw correctionError(error);
      }
    }

    await otherAdmin(ctx.userId, body.approvedBy);

    const result = await prisma.$transaction(async (tx) => {
      if (body.action === 'reverse') {
        const entry = await tx.journalEntry.findUnique({
          where: { id: body.entryId },
          include: { lines: { include: { account: true } } },
        });
        if (!entry) throw Errors.notFound('Journal entry');
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
        return postJournal(tx, {
          eventType: 'reversal',
          eventRefType: entry.eventRefType,
          eventRefId: entry.eventRefId,
          idempotencyKey: body.idempotencyKey,
          postedBy: ctx.userId,
          approvedBy: body.approvedBy,
          reasonCode: 'manual_reversal',
          remarks: body.reason,
          reversesEntryId: entry.id,
          lines: reversalLines(original),
        });
      }
      return postJournal(tx, {
        eventType: 'manual_adjustment',
        eventRefType: 'adjustment',
        eventRefId: body.idempotencyKey,
        idempotencyKey: body.idempotencyKey,
        postedBy: ctx.userId,
        approvedBy: body.approvedBy,
        reasonCode: 'manual_adjustment',
        remarks: body.reason,
        lines: balanceLines(body.lines.map((row) => line(row.code, row.name, row.type, row.side, row.paise))),
      });
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
