import { NextResponse } from 'next/server';
import {
  CUSTOMER_BA_COOKIE,
  CUSTOMER_NAME_COOKIE,
  CUSTOMER_USER_COOKIE,
} from '@/lib/resolveCustomerImpersonation';

export const VENDOR_ID_COOKIE = 'admin_impersonate_vendor_id';
export const VENDOR_NAME_COOKIE = 'admin_impersonate_vendor_name';
/** Active warehouse while admin is in vendor Admin View (httpOnly). */
export const VENDOR_OUTLET_COOKIE = 'admin_impersonate_outlet_id';
export const BRAND_ID_COOKIE = 'admin_impersonate_brand_id';
export const BRAND_NAME_COOKIE = 'admin_impersonate_brand_name';

const COOKIE_PATH = '/';

/** Clear every admin impersonation cookie on a response (mutual exclusion / logout). */
export function clearAllImpersonationCookies(res: NextResponse): void {
  res.cookies.set(VENDOR_ID_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(VENDOR_NAME_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(VENDOR_OUTLET_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(BRAND_ID_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(BRAND_NAME_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(CUSTOMER_USER_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(CUSTOMER_BA_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
  res.cookies.set(CUSTOMER_NAME_COOKIE, '', { maxAge: 0, path: COOKIE_PATH });
}
