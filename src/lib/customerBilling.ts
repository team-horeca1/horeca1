/**
 * Server helpers for persisting customer billing (BusinessAccount.billing*) and
 * the per-outlet billing-name override from customer address forms.
 *
 * Billing lives on the BusinessAccount; delivery + billingName live on the Outlet.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

/** Optional billing fields accepted by address / outlet APIs. */
export const billingFieldsShape = {
  billingAddressLine: z.string().max(2000).nullable().optional(),
  billingCity: z.string().max(100).nullable().optional(),
  billingState: z.string().max(100).nullable().optional(),
  billingPincode: z.string().max(10).nullable().optional(),
};

export interface BillingFieldsInput {
  billingAddressLine?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPincode?: string | null;
}

/**
 * BusinessAccount update data for the billing fields that were actually typed.
 * Empty / missing values are skipped so a partial save never wipes billing.
 * Returns null when there is nothing to write.
 */
export function billingUpdateData(
  input: BillingFieldsInput,
): Prisma.BusinessAccountUpdateInput | null {
  const data: Prisma.BusinessAccountUpdateInput = {};
  const line = (input.billingAddressLine ?? '').trim();
  const city = (input.billingCity ?? '').trim();
  const state = (input.billingState ?? '').trim();
  const pin = (input.billingPincode ?? '').replace(/\D/g, '').slice(0, 6);
  if (line) data.billingAddressLine = line;
  if (city) data.billingCity = city;
  if (state) data.billingState = state;
  if (pin) data.billingPincode = pin;
  return Object.keys(data).length > 0 ? data : null;
}

/**
 * Outlet.billingName override: null when blank or equal to the account legal
 * name (the account name is the default Bill-To, no override needed).
 */
export function billingNameOverride(
  billingName: string | null | undefined,
  accountLegalName: string | null | undefined,
): string | null {
  const name = (billingName ?? '').trim();
  const legal = (accountLegalName ?? '').trim();
  return name && name !== legal ? name : null;
}

export type BillingTx = Prisma.TransactionClient;

/** Persist billing* onto the BusinessAccount inside an open transaction. */
export async function persistAccountBilling(
  tx: BillingTx,
  businessAccountId: string,
  input: BillingFieldsInput,
): Promise<void> {
  const data = billingUpdateData(input);
  if (!data) return;
  await tx.businessAccount.update({ where: { id: businessAccountId }, data });
}
