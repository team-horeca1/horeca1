'use client';

import { useAddress } from '@/context/AddressContext';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';

/**
 * Delivery pin for catalog / serviceability.
 * Matches Nav "Deliver to": active business outlet wins over legacy saved address.
 */
export function useDeliveryPincode(): string | undefined {
  const { selectedAddress } = useAddress();
  const { currentOutlet } = useBusinessAccountSwitcher();
  const raw =
    currentOutlet?.pincode
    || selectedAddress?.pincode
    || (typeof window !== 'undefined' ? localStorage.getItem('user_pincode') : null)
    || undefined;
  return raw && /^\d{6}$/.test(raw) ? raw : undefined;
}
