/**
 * Shared Redis read-models for the public category tree and homepage rails.
 * Falls through to Postgres when Redis is down (same pattern as home stats).
 * Redis calls are hard-capped so a missing Redis never hangs `next build`.
 */

import 'server-only';
import { redis } from '@/lib/redis';
import { CatalogService } from '@/modules/catalog/catalog.service';

const TREE_KEY = 'horeca1:catalog:categories:tree';
const VER_KEY = 'horeca1:catalog:ver';
const TREE_TTL_SEC = 15 * 60; // 15 minutes
export const RAILS_TTL_SEC = 90;
const REDIS_TIMEOUT_MS = 200;

const catalogService = new CatalogService();

/** JSON-safe clone so Dates / Decimals survive Redis round-trips. */
function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('catalog-redis-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function redisCall<T>(op: () => Promise<T>): Promise<T | null> {
  try {
    return await withTimeout(op(), REDIS_TIMEOUT_MS);
  } catch {
    return null;
  }
}

export async function getCachedCategoryTree() {
  const cached = await redisCall(() => redis.get(TREE_KEY));
  if (cached) return JSON.parse(cached);

  const categories = await catalogService.getCategories();
  const payload = toJsonSafe(categories);

  void redisCall(() => redis.set(TREE_KEY, JSON.stringify(payload), 'EX', TREE_TTL_SEC));

  return payload;
}

/** Drop the tree entry and bump the rails version so old rail keys age out. */
export async function invalidateCatalogCaches(): Promise<void> {
  await redisCall(async () => {
    await redis.del(TREE_KEY);
    await redis.incr(VER_KEY);
  });
}

export async function getCatalogVersion(): Promise<string> {
  const v = await redisCall(() => redis.get(VER_KEY));
  return v ?? '0';
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const cached = await redisCall(() => redis.get(key));
  if (!cached) return null;
  try {
    return JSON.parse(cached) as T;
  } catch {
    return null;
  }
}

export async function setCachedJson(
  key: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  await redisCall(() =>
    redis.set(key, JSON.stringify(toJsonSafe(value)), 'EX', ttlSec),
  );
}

export function railsCacheKey(
  ver: string,
  pincode: string | undefined,
  parentId?: string,
  shapeVersion = 2,
): string {
  const pin = pincode && /^\d{6}$/.test(pincode) ? pincode : 'all';
  const scope = parentId ? `parent:${parentId}` : 'all';
  return `horeca1:catalog:rails:v${shapeVersion}:${ver}:${pin}:${scope}`;
}
