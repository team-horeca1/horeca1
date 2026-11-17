export type FinanceBatchStatus = 'draft' | 'in_review' | 'finalised' | 'settled' | 'cancelled';

export interface BatchRecord {
  status: FinanceBatchStatus;
  createdById: string;
  finalisedById: string | null;
  settledById: string | null;
  settledAt: string | null;
  bankReference: string | null;
  cancelledById: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  netPaise: number;
}

export class SettlementTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettlementTransitionError';
  }
}

export function assertGenuineUtr(utr: string): string {
  const value = utr.trim();
  if (value.length < 6) {
    throw new SettlementTransitionError('A bank reference of at least 6 characters is required');
  }
  if (value.toUpperCase().startsWith('INSTANT-')) {
    throw new SettlementTransitionError('A synthetic instant-payout reference is not a bank UTR');
  }
  return value;
}

export function cancelDraft(batch: BatchRecord, actorId: string, reason: string, at: string): BatchRecord {
  if (batch.status !== 'draft') {
    throw new SettlementTransitionError('Only a draft batch can be cancelled');
  }
  const trimmed = reason.trim();
  if (trimmed.length < 8) {
    throw new SettlementTransitionError('A cancellation reason is required');
  }
  return {
    ...batch,
    status: 'cancelled',
    cancelledById: actorId,
    cancelledAt: at,
    cancelReason: trimmed,
  };
}

export function finaliseBatch(batch: BatchRecord, actorId: string): BatchRecord {
  if (batch.status !== 'draft' && batch.status !== 'in_review') {
    throw new SettlementTransitionError('Only a draft batch can be finalised');
  }
  if (actorId === batch.createdById) {
    throw new SettlementTransitionError('The person who created the batch cannot finalise it');
  }
  return { ...batch, status: 'finalised', finalisedById: actorId };
}

export function markBatchSettled(
  batch: BatchRecord,
  actorId: string,
  utr: string,
  at: string,
): BatchRecord {
  const reference = assertGenuineUtr(utr);
  if (batch.status === 'settled') {
    if (batch.bankReference === reference) return batch;
    throw new SettlementTransitionError('This batch is already settled with a different reference');
  }
  if (batch.status !== 'finalised') {
    throw new SettlementTransitionError('A batch must be finalised before it can be marked settled');
  }
  return {
    ...batch,
    status: 'settled',
    settledById: actorId,
    settledAt: at,
    bankReference: reference,
  };
}
