import { NextResponse } from 'next/server';

export const VENDOR_ID_COOKIE = 'admin_impersonate_vendor_id';
export const VENDOR_NAME_COOKIE = 'admin_impersonate_vendor_name';
/** Active warehouse while admin is in vendor Admin View (httpOnly). */
export const VENDOR_OUTLET_COOKIE = 'admin_impersonate_outlet_id';
export const BRAND_ID_COOKIE = 'admin_impersonate_brand_id';
export const BRAND_NAME_COOKIE = 'admin_impersonate_brand_name';

/** Canonical storefront buyer identity (stamped by every impersonate POST). */
export const BUYER_USER_COOKIE = 'admin_impersonate_buyer_user_id';
export const BUYER_BA_COOKIE = 'admin_impersonate_buyer_ba_id';
export const BUYER_NAME_COOKIE = 'admin_impersonate_buyer_name';
export const BUYER_MODE_COOKIE = 'admin_impersonate_buyer_mode';

/** Legacy customer Admin View cookies (4h TTL fallback). */
export const CUSTOMER_USER_COOKIE = 'admin_impersonate_customer_user_id';
export const CUSTOMER_NAME_COOKIE = 'admin_impersonate_customer_name';
export const CUSTOMER_BA_COOKIE = 'admin_impersonate_customer_business_account_id';

export const IMPERSONATION_COOKIE_MAX_AGE = 60 * 60 * 4; // 4 hours

export type BuyerImpersonationMode = 'customer' | 'vendor' | 'brand';

const COOKIE_PATH = '/';
const IS_PROD = process.env.NODE_ENV === 'production';

const httpOnlyOpts = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: 'lax' as const,
  path: COOKIE_PATH,
  maxAge: IMPERSONATION_COOKIE_MAX_AGE,
};

const readableOpts = {
  httpOnly: false,
  secure: IS_PROD,
  sameSite: 'lax' as const,
  path: COOKIE_PATH,
  maxAge: IMPERSONATION_COOKIE_MAX_AGE,
};

export function setBuyerImpersonationCookies(
  res: NextResponse,
  buyer: {
    userId: string;
    businessAccountId: string;
    name: string;
    mode: BuyerImpersonationMode;
  },
): void {
  res.cookies.set(BUYER_USER_COOKIE, buyer.userId, httpOnlyOpts);
  res.cookies.set(BUYER_BA_COOKIE, buyer.businessAccountId, httpOnlyOpts);
  res.cookies.set(BUYER_NAME_COOKIE, buyer.name, readableOpts);
  res.cookies.set(BUYER_MODE_COOKIE, buyer.mode, readableOpts);
  if (buyer.mode === 'customer') {
    res.cookies.set(CUSTOMER_USER_COOKIE, buyer.userId, httpOnlyOpts);
    res.cookies.set(CUSTOMER_BA_COOKIE, buyer.businessAccountId, httpOnlyOpts);
    res.cookies.set(CUSTOMER_NAME_COOKIE, buyer.name, readableOpts);
  }
}

/** Clear every admin impersonation cookie on a response (mutual exclusion / logout). */
export function clearAllImpersonationCookies(res: NextResponse): void {
  res.cookies.set(VENDOR_ID_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(VENDOR_NAME_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(VENDOR_OUTLET_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(BRAND_ID_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(BRAND_NAME_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(BUYER_USER_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(BUYER_BA_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(BUYER_NAME_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(BUYER_MODE_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(CUSTOMER_USER_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(CUSTOMER_BA_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(CUSTOMER_NAME_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
}
