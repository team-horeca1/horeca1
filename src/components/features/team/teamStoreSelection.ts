/** Store picks scoped to currently selected businesses (drops stale ids). */

type BusinessWithStores = { id: string; stores: Array<{ id: string }> };

export function visibleStoreIdSet(
  businessIds: Set<string>,
  businesses: BusinessWithStores[],
): Set<string> {
  return new Set(
    businesses
      .filter((b) => businessIds.has(b.id))
      .flatMap((b) => b.stores.map((s) => s.id)),
  );
}

export function pruneOutletIds(
  businessIds: Set<string>,
  businesses: BusinessWithStores[],
  outletIds: Set<string>,
): Set<string> {
  const valid = visibleStoreIdSet(businessIds, businesses);
  return new Set([...outletIds].filter((id) => valid.has(id)));
}

/** Count selections among stores currently shown in the panel. */
export function countVisibleSelectedStores(
  visibleStoreIds: string[],
  outletIds: Set<string>,
): number {
  return visibleStoreIds.filter((id) => outletIds.has(id)).length;
}

/**
 * Store-scoped save: only businesses that have ≥1 selected store;
 * storeIds are intersected with visible stores (no cross-BA leakage).
 */
export function resolveStoreScopeAccess(
  businessIds: Set<string>,
  businesses: BusinessWithStores[],
  outletIds: Set<string>,
): { businessAccountIds: string[]; storeIds: string[] } | null {
  const storeIds = [...pruneOutletIds(businessIds, businesses, outletIds)];
  if (storeIds.length === 0) return null;

  const businessAccountIds = businesses
    .filter(
      (b) => businessIds.has(b.id) && b.stores.some((s) => storeIds.includes(s.id)),
    )
    .map((b) => b.id);

  if (businessAccountIds.length === 0) return null;
  return { businessAccountIds, storeIds };
}

/** Drop selected businesses that have no checked stores (explicit store mode only). */
export function businessIdsMatchingStoreSelection(
  businessIds: Set<string>,
  businesses: BusinessWithStores[],
  outletIds: Set<string>,
): Set<string> {
  const pruned = pruneOutletIds(businessIds, businesses, outletIds);
  if (pruned.size === 0) return businessIds;

  const withStore = businesses.filter(
    (b) => businessIds.has(b.id) && b.stores.some((s) => pruned.has(s.id)),
  );
  if (withStore.length === 0) return businessIds;
  return new Set(withStore.map((b) => b.id));
}
