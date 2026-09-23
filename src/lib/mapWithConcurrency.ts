/** How many category product requests a storefront page may run at once. */
export const CATEGORY_FETCH_CONCURRENCY = 4;

/**
 * Map items with a fixed number of in-flight promises.
 * Result order matches input order, same as Promise.all.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
