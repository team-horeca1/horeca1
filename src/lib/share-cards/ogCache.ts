import 'server-only';
import type { ImageResponse } from 'next/og';

interface CachedCard {
  buffer: ArrayBuffer;
  contentType: string;
  etag: string;
  cacheControl: string;
  timestamp: number;
}

const cardCache = new Map<string, CachedCard>();
const inFlightRenders = new Map<string, Promise<Response | null>>();
const MAX_CACHE_ENTRIES = 250;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory freshness

/**
 * High-performance server-side in-memory cache and request deduplicator for OG cards.
 *
 * 1. In-memory cache: Serves repeat requests in <1ms without DB queries, Sharp, or Satori.
 * 2. In-flight deduplication: Merges concurrent requests (e.g. <img> and prefetch) so the card is rendered exactly once.
 * 3. Client HTTP headers: Advises browser to cache for 5 minutes and CDNs for 24 hours.
 */
export async function getOrRenderOgCard(
  cacheKey: string,
  renderFn: () => Promise<ImageResponse | null>,
): Promise<Response | null> {
  const now = Date.now();

  // 1. Fast path: In-memory cache hit (<1ms)
  const cached = cardCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return new Response(cached.buffer, {
      status: 200,
      headers: {
        'content-type': cached.contentType,
        'cache-control': cached.cacheControl,
        etag: cached.etag,
        'x-og-cache': 'HIT',
      },
    });
  }

  // 2. In-flight coalescing: If this exact card is currently rendering, wait for that promise
  const inFlight = inFlightRenders.get(cacheKey);
  if (inFlight) {
    const res = await inFlight;
    return res ? res.clone() : null;
  }

  // 3. Render and cache
  const renderPromise = (async () => {
    try {
      const imageResponse = await renderFn();
      if (!imageResponse) return null;

      // Extract bytes and headers
      const buffer = await imageResponse.arrayBuffer();
      const contentType = imageResponse.headers.get('content-type') || 'image/png';
      const etag = imageResponse.headers.get('etag') || `"og-${now.toString(36)}"`;
      const cacheControl =
        imageResponse.headers.get('cache-control') ||
        'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800';

      // Keep cache size bounded
      if (cardCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = cardCache.keys().next().value;
        if (oldestKey) cardCache.delete(oldestKey);
      }

      cardCache.set(cacheKey, {
        buffer,
        contentType,
        etag,
        cacheControl,
        timestamp: now,
      });

      return new Response(buffer, {
        status: 200,
        headers: {
          'content-type': contentType,
          'cache-control': cacheControl,
          etag,
          'x-og-cache': 'MISS',
        },
      });
    } catch (err) {
      console.error(`[ogCache] Render failed for ${cacheKey}:`, err);
      return null;
    } finally {
      inFlightRenders.delete(cacheKey);
    }
  })();

  inFlightRenders.set(cacheKey, renderPromise);
  return renderPromise;
}

/** Clear cache if needed (e.g. for testing) */
export function purgeOgCardCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    cardCache.clear();
    return;
  }
  for (const key of cardCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cardCache.delete(key);
    }
  }
}
