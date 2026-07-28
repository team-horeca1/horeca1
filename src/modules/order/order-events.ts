import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

/** Canonical OrderEvent.action values (Section 7 Rules 3 / 5 / 9 / 15). */
export const ORDER_EVENT_ACTIONS = {
  CREATED: 'order.created',
  AUTO_ACCEPTED: 'order.auto_accepted',
  STATUS_CHANGED: 'status.changed',
  ITEM_QTY_ADJUSTED: 'item.qty_adjusted',
  ITEM_REJECTED: 'item.rejected',
  ITEM_SUBSTITUTED: 'item.substituted',
  PARTIAL_FULFILMENT: 'order.partial_fulfilment',
  CANCELLED: 'order.cancelled',
  CANCEL_REQUESTED: 'cancel.requested',
  CANCEL_APPROVED: 'cancel.approved',
  CANCEL_REJECTED: 'cancel.rejected',
  INVOICE_GENERATED: 'invoice.generated',
} as const;

export type OrderEventAction =
  (typeof ORDER_EVENT_ACTIONS)[keyof typeof ORDER_EVENT_ACTIONS];

type Tx = Prisma.TransactionClient;

export async function recordOrderEvent(
  tx: Tx,
  input: {
    orderId: string;
    actorId?: string | null;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    payload?: Record<string, unknown> | null;
  },
) {
  return tx.orderEvent.create({
    data: {
      id: randomUUID(),
      orderId: input.orderId,
      actorId: input.actorId ?? null,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function recordOrderEvents(
  tx: Tx,
  events: Array<{
    orderId: string;
    actorId?: string | null;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    payload?: Record<string, unknown> | null;
  }>,
) {
  for (const e of events) {
    await recordOrderEvent(tx, e);
  }
}
