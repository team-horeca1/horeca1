import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const CUSTOMER_PROTECTED_PREFIXES = [
  '/checkout',
  '/orders',
  '/order-lists',
  '/profile',
  '/account',
];

const VENDOR_PORTAL_SEGMENTS = new Set([
  'dashboard', 'orders', 'products', 'inventory', 'warehouse', 'returns', 'claims',
  'brand-mappings', 'price-lists', 'promotions', 'customers', 'sales-team', 'credit',
  'wallet', 'ledger', 'reports', 'notifications', 'account', 'team', 'outlets', 'settings',
  'collections', 'customer-groups', 'setup', 'businesses', 'overview', 'all-orders',
]);

/** Public onboarding — must stay reachable without a session. */
const PUBLIC_VENDOR_ROUTES = new Set(['register']);

function isVendorPortalRoute(pathname: string): boolean {
  if (!pathname.startsWith('/vendor/')) return false;
  const segment = pathname.split('/')[2];
  if (!segment || PUBLIC_VENDOR_ROUTES.has(segment)) return false;
  return VENDOR_PORTAL_SEGMENTS.has(segment);
}

type TokenUser = {
  role?: string;
  activeBusinessAccountType?: { isVendor?: boolean; isBrand?: boolean };
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname.startsWith('/admin');
  const isBrandPortal = pathname.startsWith('/brand/portal');
  const isVendorPortal = isVendorPortalRoute(pathname);
  const isCustomerProtected = CUSTOMER_PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  const needsAuth = isAdminRoute || isBrandPortal || isVendorPortal || isCustomerProtected;
  if (!needsAuth) return NextResponse.next();

  // Match cookie name to the request protocol — production builds on
  // http://localhost (Playwright / local standalone) set `authjs.session-token`,
  // not `__Secure-authjs.session-token`. Using NODE_ENV===production here made
  // getToken miss the cookie and 307 every portal route to /login.
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: req.nextUrl.protocol === 'https:',
  }) as (TokenUser & { sub?: string }) | null;

  if (!token) {
    const returnTo = pathname + req.nextUrl.search;
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('redirect', returnTo);
    return NextResponse.redirect(url);
  }

  const role = token.role;

  if (isAdminRoute && role !== 'admin') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (isVendorPortal) {
    const isVendorActor = role === 'vendor' || role === 'admin' || token.activeBusinessAccountType?.isVendor === true;
    if (!isVendorActor) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  if (isBrandPortal) {
    const isBrandActor = role === 'brand' || role === 'admin' || token.activeBusinessAccountType?.isBrand === true;
    if (!isBrandActor) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
  ],
};
