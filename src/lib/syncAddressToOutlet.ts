/**
 * Match a saved/detected address to an existing Outlet or create one, then
 * switch the session to it. Shared by LocationSelectionOverlay and
 * InitialPincodeOverlay so navbar location picks stamp activeOutletId.
 */

/**
 * Match a saved/detected address to an existing Outlet or create one, then
 * switch the session to it. Shared by LocationSelectionOverlay and
 * InitialPincodeOverlay so navbar location picks stamp activeOutletId.
 */

export interface OutletSyncAccount {
  id: string;
  isPrimary: boolean;
  primaryOutletId: string | null;
  outlets: Array<{ id: string }>;
  isCustomer?: boolean;
  isVendor?: boolean;
  isBrand?: boolean;
}

/**
 * Outlets are restaurant / retail only. Flags omitted (legacy callers) stay
 * allowed so guest/bootstrap paths keep working.
 */
export function accountCanManageOutlets(account: OutletSyncAccount | null | undefined): boolean {
  if (!account) return false;
  if (account.isVendor === true || account.isBrand === true) return false;
  if (account.isCustomer === true) return true;
  return account.isCustomer === undefined
    && account.isVendor === undefined
    && account.isBrand === undefined;
}

export function pickBuyerAccountForOutletSync(
  accounts: OutletSyncAccount[],
  currentAccount: OutletSyncAccount | null,
): OutletSyncAccount | null {
  if (accountCanManageOutlets(currentAccount)) return currentAccount;
  return accounts.find((a) => accountCanManageOutlets(a)) ?? null;
}

/** Ensure the session has an active buyer business before outlet sync. */
export async function prepareAccountForOutletSync(
  accounts: OutletSyncAccount[],
  currentAccount: OutletSyncAccount | null,
  switchAccount: (businessAccountId: string, outletId?: string) => Promise<void>,
): Promise<string | null> {
  if (accountCanManageOutlets(currentAccount) && currentAccount) {
    return currentAccount.id;
  }
  // First-login / no active BA yet: activate the buyer, never a supplier or brand.
  if (!currentAccount) {
    const buyer = pickBuyerAccountForOutletSync(accounts, null);
    if (!buyer) return null;
    const defaultOutletId = buyer.primaryOutletId ?? buyer.outlets[0]?.id;
    await switchAccount(buyer.id, defaultOutletId ?? undefined);
    return buyer.id;
  }
  return null;
}

export interface SyncAddressToOutletParams {
  accountId: string;
  addr: {
    fullAddress: string;
    businessName?: string;
    label?: string;
    flatInfo?: string;
    landmark?: string;
    city?: string;
    state?: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
    placeId?: string;
  };
  switchOutlet: (outletId: string) => Promise<void>;
  refreshAccounts?: () => Promise<void>;
}

export async function syncAddressToOutlet({
  accountId,
  addr,
  switchOutlet,
  refreshAccounts,
}: SyncAddressToOutletParams): Promise<string | null> {
  const res = await fetch(`/api/v1/account/${accountId}/outlets`);
  if (!res.ok) throw new Error('Failed to fetch account outlets');
  const json = await res.json();
  const dbOutlets = (json.data || []) as Array<{
    id: string;
    placeId: string | null;
    latitude: number | null;
    longitude: number | null;
    pincode: string | null;
    addressLine: string;
  }>;

  let matchingOutlet = dbOutlets.find((o) => o.placeId && o.placeId === addr.placeId);
  if (!matchingOutlet && addr.latitude != null && addr.longitude != null) {
    matchingOutlet = dbOutlets.find(
      (o) =>
        o.latitude &&
        o.longitude &&
        Math.abs(o.latitude - addr.latitude!) < 0.0001 &&
        Math.abs(o.longitude - addr.longitude!) < 0.0001,
    );
  }
  if (!matchingOutlet) {
    matchingOutlet = dbOutlets.find(
      (o) => o.addressLine === addr.fullAddress && o.pincode === addr.pincode,
    );
  }

  let targetOutletId = matchingOutlet?.id;

  if (!targetOutletId) {
    const createRes = await fetch(`/api/v1/account/${accountId}/outlets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: addr.businessName || addr.label || 'Branch Outlet',
        addressLine: addr.fullAddress,
        flatInfo: addr.flatInfo || null,
        landmark: addr.landmark || null,
        city: addr.city || null,
        state: addr.state || null,
        pincode: addr.pincode || null,
        latitude: addr.latitude,
        longitude: addr.longitude,
        placeId: addr.placeId || null,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error('Failed to create outlet:', errText);
      throw new Error('Failed to create outlet for address');
    }

    const createJson = await createRes.json();
    targetOutletId = createJson.data.id as string;
  }

  if (targetOutletId) {
    await switchOutlet(targetOutletId);
    if (refreshAccounts) await refreshAccounts();
  }

  return targetOutletId ?? null;
}
