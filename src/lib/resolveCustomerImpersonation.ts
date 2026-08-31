/**
 * Admin impersonation — read cookies and return effective storefront buyer scope.
 * Buyer cookies are the canonical source; legacy customer cookies are a 4h TTL fallback.
 */
import type { NextRequest } from 'next/server';
import type { AuthContext } from '@/middleware/auth';
import {
  BUYER_BA_COOKIE,
  BUYER_MODE_COOKIE,
  BUYER_NAME_COOKIE,
  BUYER_USER_COOKIE,
  CUSTOMER_BA_COOKIE,
  CUSTOMER_NAME_COOKIE,
  CUSTOMER_USER_COOKIE,
  type BuyerImpersonationMode,
} from '@/lib/adminImpersonationCookies';

export {
  CUSTOMER_USER_COOKIE,
  CUSTOMER_NAME_COOKIE,
  CUSTOMER_BA_COOKIE,
} from '@/lib/adminImpersonationCookies';

export type ImpersonationMode = BuyerImpersonationMode;

export interface ImpersonatedBuyer {
  userId: string;
  businessAccountId: string;
  name: string;
  mode: ImpersonationMode;
}

/** @deprecated Use ImpersonatedBuyer. */
export type CustomerImpersonation = ImpersonatedBuyer;

function decodeCookieName(raw: string | undefined, fallback: string): string {
  let name = raw || fallback;
  if (!raw) return name;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(name);
      if (next === name) break;
      name = next;
    } catch {
      break;
    }
  }
  return name;
}

function parseMode(raw: string | undefined): ImpersonationMode {
  if (raw === 'vendor' || raw === 'brand' || raw === 'customer') return raw;
  return 'customer';
}

export function readImpersonatedBuyerFromRequest(
  req: NextRequest,
): ImpersonatedBuyer | null {
  const buyerUserId = req.cookies.get(BUYER_USER_COOKIE)?.value;
  const buyerBaId = req.cookies.get(BUYER_BA_COOKIE)?.value;
  if (buyerUserId && buyerBaId) {
    return {
      userId: buyerUserId,
      businessAccountId: buyerBaId,
      name: decodeCookieName(req.cookies.get(BUYER_NAME_COOKIE)?.value, 'Customer'),
      mode: parseMode(req.cookies.get(BUYER_MODE_COOKIE)?.value),
    };
  }

  const userId = req.cookies.get(CUSTOMER_USER_COOKIE)?.value;
  const businessAccountId = req.cookies.get(CUSTOMER_BA_COOKIE)?.value;
  if (!userId || !businessAccountId) return null;
  return {
    userId,
    businessAccountId,
    name: decodeCookieName(req.cookies.get(CUSTOMER_NAME_COOKIE)?.value, 'Customer'),
    mode: 'customer',
  };
}

/** @deprecated Use readImpersonatedBuyerFromRequest. */
export function readCustomerImpersonationFromRequest(
  req: NextRequest,
): ImpersonatedBuyer | null {
  return readImpersonatedBuyerFromRequest(req);
}

/** Effective user id for storefront/account reads when admin is viewing as a buyer. */
export function effectiveCustomerUserId(ctx: AuthContext): string {
  return ctx.impersonatedBuyer?.userId ?? ctx.userId;
}

export function effectiveCustomerBusinessAccountId(ctx: AuthContext): string | null {
  return ctx.impersonatedBuyer?.businessAccountId ?? ctx.activeBusinessAccountId;
}

/** Admin is viewing-as-buyer for this exact business account. */
export function isImpersonatingBusinessAccount(
  ctx: AuthContext,
  businessAccountId: string,
): boolean {
  return ctx.impersonatedBuyer?.businessAccountId === businessAccountId;
}
