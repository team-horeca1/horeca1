import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  BUYER_MODE_COOKIE,
  BUYER_NAME_COOKIE,
  BRAND_NAME_COOKIE,
  CUSTOMER_NAME_COOKIE,
  VENDOR_NAME_COOKIE,
  type ImpersonationMode,
} from '@/lib/clearImpersonation';
import {
  GUEST_INITIAL_NAV,
  resolvePortalNav,
  type InitialNav,
} from '@/lib/navChrome';

function parseImpersonationMode(value: string | undefined): ImpersonationMode | null {
  if (value === 'vendor' || value === 'brand' || value === 'customer') return value;
  return null;
}

export async function resolveInitialNav(): Promise<InitialNav> {
  const session = await auth();
  if (!session?.user) return GUEST_INITIAL_NAV;

  const jar = await cookies();
  const modeFromCookie = parseImpersonationMode(jar.get(BUYER_MODE_COOKIE)?.value);
  const hasVendorCookie = Boolean(jar.get(VENDOR_NAME_COOKIE)?.value);
  const hasBrandCookie = Boolean(jar.get(BRAND_NAME_COOKIE)?.value);
  const hasCustomerCookie = Boolean(jar.get(CUSTOMER_NAME_COOKIE)?.value);
  const hasBuyerCookie = Boolean(jar.get(BUYER_NAME_COOKIE)?.value);

  const impersonationMode: ImpersonationMode | null =
    modeFromCookie
    ?? (hasCustomerCookie ? 'customer' : null)
    ?? (hasVendorCookie ? 'vendor' : null)
    ?? (hasBrandCookie ? 'brand' : null);

  const isAdminImpersonating =
    hasVendorCookie || hasBrandCookie || hasCustomerCookie || hasBuyerCookie;
  const isCustomerImpersonating = impersonationMode === 'customer';

  const user = session.user;
  const userRole = user.role;
  const activeAccountType = user.activeBusinessAccountType;
  const availableAccounts = user.availableAccounts;
  const hasVendorAccount =
    activeAccountType?.isVendor === true
    || userRole === 'vendor'
    || (availableAccounts?.some((a) => a.isVendor === true) ?? false);
  const hasBrandAccount =
    activeAccountType?.isBrand === true
    || userRole === 'brand'
    || (availableAccounts?.some((a) => a.isBrand === true) ?? false);

  let vendorAppApproved = false;
  if (hasVendorAccount && userRole !== 'admin') {
    try {
      const verified = await prisma.vendor.findFirst({
        where: { userId: user.id, isVerified: true },
        select: { id: true },
      });
      vendorAppApproved = Boolean(verified);
    } catch {
      vendorAppApproved = false;
    }
  }

  const portal = resolvePortalNav({
    isLoggedIn: true,
    userRole,
    impersonationMode,
    isCustomerImpersonating,
    isAdminImpersonating,
    hasVendorAccount,
    vendorAppApproved,
    hasBrandAccount,
  });

  return {
    isLoggedIn: true,
    portal,
    showWallet: true,
    impersonationMode,
    isAdminImpersonating,
    isCustomerImpersonating,
    vendorAppApproved,
  };
}
