import { NextResponse } from 'next/server';
import { auth } from '@/auth';

const CUSTOMER_PROTECTED_PREFIXES = [
  '/checkout',
  '/orders',
  '/order-lists',
  '/profile',
  '/wishlist',
  '/account',
];

const VENDOR_PORTAL_SEGMENTS = new Set([
  'dashboard', 'orders', 'products', 'inventory', 'warehouse', 'returns', 'claims',
  'brand-mappings', 'price-lists', 'promotions', 'customers', 'sales-team', 'credit',
  'wallet', 'ledger', 'reports', 'notifications', 'account', 'team', 'outlets', 'settings',
  'collections', 'customer-groups', 'setup', 'register',
]);

function isVendorPortalRoute(pathname: string): boolean {
  if (!pathname.startsWith('/vendor/')) return false;
  const segment = pathname.split('/')[2];
  return !!segment && VENDOR_PORTAL_SEGMENTS.has(segment);
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname.startsWith('/admin');
  const isBrandPortal = pathname.startsWith('/brand/portal');
  const isVendorPortal = isVendorPortalRoute(pathname);
  const isCustomerProtected = CUSTOMER_PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  const needsAuth = isAdminRoute || isBrandPortal || isVendorPortal || isCustomerProtected;
  if (!needsAuth) return NextResponse.next();

  if (!req.auth) {
    const returnTo = pathname + req.nextUrl.search;
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('redirect', returnTo);
    return NextResponse.redirect(url);
  }

  const user = req.auth.user as {
    role?: string;
    activeBusinessAccountType?: { isVendor?: boolean; isBrand?: boolean };
  };
  const role = user?.role;

  if (isAdminRoute && role !== 'admin') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (isVendorPortal) {
    const isVendorActor = role === 'vendor' || role === 'admin' || user?.activeBusinessAccountType?.isVendor === true;
    if (!isVendorActor) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  if (isBrandPortal) {
    const isBrandActor = role === 'brand' || role === 'admin' || user?.activeBusinessAccountType?.isBrand === true;
    if (!isBrandActor) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api|monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
  ],
};
