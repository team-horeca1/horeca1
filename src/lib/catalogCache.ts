/**
 * Shared Redis read-models for the public category tree and homepage rails.
 * Falls through to Postgres when Redis is down (same pattern as home stats).
 */

import { redis } from '@/lib/redis';
import { CatalogService } from '@/modules/catalog/catalog.service';

const TREE_KEY = 'horeca1:catalog:categories:tree';
const VER_KEY = 'horeca1:catalog:ver';
const TREE_TTL_SEC = 15 * 60; // 15 minutes
export const RAILS_TTL_SEC = 90;

const catalogService = new CatalogService();

/** JSON-safe clone so Dates / Decimals survive Redis round-trips. */
function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function getCachedCategoryTree() {
  try {
    const cached = await redis.get(TREE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {
    // fall through to DB
  }

  const categories = await catalogService.getCategories();
  const payload = toJsonSafe(categories);

  try {
    await redis.set(TREE_KEY, JSON.stringify(payload), 'EX', TREE_TTL_SEC);
  } catch {
    // ignore write failures
  }

  return payload;
}

/** Drop the tree entry and bump the rails version so old rail keys age out. */
export async function invalidateCatalogCaches(): Promise<void> {
  try {
    await redis.del(TREE_KEY);
    await redis.incr(VER_KEY);
  } catch {
    // ignore — next read rebuilds from DB
  }
}

export async function getCatalogVersion(): Promise<string> {
  try {
    const v = await redis.get(VER_KEY);
    return v ?? '0';
  } catch {
    return '0';
  }
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    // miss
  }
  return null;
}

export async function setCachedJson(
  key: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(toJsonSafe(value)), 'EX', ttlSec);
  } catch {
    // ignore
  }
}

export function railsCacheKey(
  ver: string,
  pincode: string | undefined,
  parentId?: string,
): string {
  const pin = pincode && /^\d{6}$/.test(pincode) ? pincode : 'all';
  const scope = parentId ? `parent:${parentId}` : 'all';
  return `horeca1:catalog:rails:${ver}:${pin}:${scope}`;
}
