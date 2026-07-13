/**
 * Admin customer impersonation — read cookies and return effective customer scope.
 */
import type { NextRequest } from 'next/server';
import type { AuthContext } from '@/middleware/auth';

export const CUSTOMER_USER_COOKIE = 'admin_impersonate_customer_user_id';
export const CUSTOMER_NAME_COOKIE = 'admin_impersonate_customer_name';
export const CUSTOMER_BA_COOKIE = 'admin_impersonate_customer_business_account_id';

export interface CustomerImpersonation {
  userId: string;
  businessAccountId: string;
  name: string;
}

export function readCustomerImpersonationFromRequest(
  req: NextRequest,
): CustomerImpersonation | null {
  const userId = req.cookies.get(CUSTOMER_USER_COOKIE)?.value;
  const businessAccountId = req.cookies.get(CUSTOMER_BA_COOKIE)?.value;
  const name = req.cookies.get(CUSTOMER_NAME_COOKIE)?.value;
  if (!userId || !businessAccountId) return null;
  return {
    userId,
    businessAccountId,
    name: name ? decodeURIComponent(name) : 'Customer',
  };
}

/** Effective user id for storefront/account reads when admin is viewing as customer. */
export function effectiveCustomerUserId(ctx: AuthContext): string {
  return ctx.impersonatedCustomer?.userId ?? ctx.userId;
}

export function effectiveCustomerBusinessAccountId(ctx: AuthContext): string | null {
  return ctx.impersonatedCustomer?.businessAccountId ?? ctx.activeBusinessAccountId;
}

/** Admin is viewing-as-customer for this exact business account. */
export function isImpersonatingBusinessAccount(
  ctx: AuthContext,
  businessAccountId: string,
): boolean {
  return ctx.impersonatedCustomer?.businessAccountId === businessAccountId;
}
