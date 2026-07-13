'use client';

/**
 * Forces a logged-in customer who has no *usable* delivery address to set one
 * before using the storefront. Mounted in the root layout next to
 * PostLoginAccountSelector.
 *
 * Trigger: authenticated + active account is a pure customer (not a vendor /
 * brand account, which also carry isCustomer=true) + no saved address with a
 * real location. A brand-new OTP-signup customer is provisioned with a
 * PLACEHOLDER outlet ("Address pending…", no pincode/coords) that GET
 * /api/v1/addresses still returns — so we cannot test length===0; we test for
 * a usable address (valid 6-digit pincode OR non-zero coordinates).
 *
 * Users may skip for this session via "Skip for now" — the orange banner and
 * navbar nudge remain as soft reminders. Stays shut while the post-login account
 * picker is still pending (force-picker cookie) so the two modals never stack.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useAddress, type Address } from '@/context/AddressContext';
import { readForcePickerCookie } from '@/lib/postLoginPicker';
import { AddNewAddressOverlay } from '@/components/layout/AddNewAddressOverlay';
import {
  isUsableSavedAddress,
  readAddressGateSkipped,
  writeAddressGateSkipped,
  notifyAccountsRefresh,
} from '@/lib/addressUsability';
import { isAdminCustomerImpersonationActive } from '@/lib/clearImpersonation';

// Auth screens + non-customer portals never get the gate.
const EXCLUDED_PREFIXES = ['/login', '/register', '/admin', '/vendor', '/brand'];

export function MandatoryAddressGate() {
  const { data: session, status, update } = useSession();
  const { savedAddresses, isLoadingAddresses, addAddress, setSelectedAddress } = useAddress();
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const seenLoading = useRef(false);

  const userId = session?.user?.id ?? '';
  const u = (session?.user ?? {}) as Record<string, unknown>;
  const acctType = u.activeBusinessAccountType as
    | { isCustomer?: boolean; isVendor?: boolean; isBrand?: boolean }
    | undefined;
  const isCustomerContext = acctType
    ? acctType.isCustomer === true && acctType.isVendor !== true && acctType.isBrand !== true
    : u.role === 'customer';
  const onExcludedRoute = EXCLUDED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  const hasUsableAddress = savedAddresses.some(isUsableSavedAddress);

  useEffect(() => {
    if (isLoadingAddresses) seenLoading.current = true;
  }, [isLoadingAddresses]);

  useEffect(() => {
    if (userId) {
      Promise.resolve().then(() => setSkipped(readAddressGateSkipped(userId)));
    }
  }, [userId]);

  useEffect(() => {
    const eligible =
      status === 'authenticated' &&
      isCustomerContext &&
      !onExcludedRoute &&
      !readForcePickerCookie() &&
      !skipped &&
      !isAdminCustomerImpersonationActive();

    if (!eligible) {
      Promise.resolve().then(() => setOpen(false));
      return;
    }
    if (isLoadingAddresses || !seenLoading.current) return;

    const shouldOpen = !hasUsableAddress;
    Promise.resolve().then(() => setOpen(shouldOpen));
  }, [status, isCustomerContext, onExcludedRoute, isLoadingAddresses, hasUsableAddress, skipped, userId, savedAddresses.length]);

  if (!open) return null;

  const handleSave = async (addr: Omit<Address, 'id'>) => {
    const saved = await addAddress({ ...addr, isDefault: true });
    if (saved) {
      setSelectedAddress(saved);
      notifyAccountsRefresh();
      await update({});
      setOpen(false);
    }
  };

  const handleSkip = () => {
    if (userId) writeAddressGateSkipped(userId);
    setSkipped(true);
    setOpen(false);
  };

  return (
    <AddNewAddressOverlay
      isOpen={open}
      onClose={handleSkip}
      onSave={handleSave}
      dismissible={false}
      allowSkip
    />
  );
}
