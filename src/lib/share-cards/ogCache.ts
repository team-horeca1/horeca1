import 'server-only';
import type { ImageResponse } from 'next/og';
import { redis } from '@/lib/redis';

interface CachedCard {
  bytes: ArrayBuffer;
  contentType: string;
  etag: string;
  cacheControl: string;
  /** When this copy was placed in the in-process map. */
  timestamp: number;
  /** When the PNG was actually rendered. Drives stale-while-revalidate. */
  renderedAt: number;
  renderMs: number;
}

interface StoredMeta {
  contentType: string;
  etag: string;
  cacheControl: string;
  createdAt: number;
  renderMs: number;
}

type OgCacheState = 'HIT' | 'L2' | 'STALE' | 'MISS';

/**
 * Node 22+ Buffer backing stores can be SharedArrayBuffer.
 * `new Response(sharedArrayBuffer)` sends the text "[object SharedArrayBuffer]"
 * instead of the PNG. Always copy into a fresh ArrayBuffer first.
 */
function toPngBytes(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

const cardCache = new Map<string, CachedCard>();
const inFlightRenders = new Map<string, Promise<CachedCard | null>>();
const MAX_CACHE_ENTRIES = 250;
const MEMORY_TTL_MS = 60 * 60 * 1000;
const STALE_AFTER_MS = 15 * 60 * 1000;
const REDIS_TTL_SEC = 7 * 24 * 60 * 60;
const REDIS_TIMEOUT_MS = 200;
const MAX_REDIS_CARDS = 500;
const REDIS_KEY_PREFIX = 'og:card:v6:';
const REDIS_INDEX = 'og:card:index';

function redisKey(cacheKey: string): string {
  return `${REDIS_KEY_PREFIX}${cacheKey}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('og-redis-timeout')), ms);
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

async function redisCall<T>(op: () => Promise<T>, timeoutMs = REDIS_TIMEOUT_MS): Promise<T | null> {
  try {
    return await withTimeout(op(), timeoutMs);
  } catch (err) {
    console.warn('[ogCache] Redis skipped:', err instanceof Error ? err.message : err);
    return null;
  }
}

function parseMeta(raw: Buffer | undefined): StoredMeta | null {
  if (!raw || raw.byteLength === 0) return null;
  try {
    const value: unknown = JSON.parse(raw.toString('utf8'));
    if (!value || typeof value !== 'object') return null;
    const rec = value as Record<string, unknown>;
    if (typeof rec.contentType !== 'string') return null;
    if (typeof rec.etag !== 'string') return null;
    if (typeof rec.cacheControl !== 'string') return null;
    if (typeof rec.createdAt !== 'number' || !Number.isFinite(rec.createdAt)) return null;
    const renderMs = typeof rec.renderMs === 'number' && Number.isFinite(rec.renderMs) ? rec.renderMs : 0;
    return {
      contentType: rec.contentType,
      etag: rec.etag,
      cacheControl: rec.cacheControl,
      createdAt: rec.createdAt,
      renderMs,
    };
  } catch {
    return null;
  }
}

function remember(cacheKey: string, card: CachedCard): void {
  if (cardCache.has(cacheKey)) cardCache.delete(cacheKey);
  if (cardCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cardCache.keys().next().value;
    if (oldestKey) cardCache.delete(oldestKey);
  }
  cardCache.set(cacheKey, card);
}

function cardResponse(card: CachedCard, state: OgCacheState, renderMs: number): Response {
  return new Response(card.bytes, {
    status: 200,
    headers: {
      'content-type': card.contentType,
      'cache-control': card.cacheControl,
      etag: card.etag,
      'x-og-cache': state,
      'x-og-render-ms': String(Math.max(0, Math.round(renderMs))),
      'x-og-bytes': String(card.bytes.byteLength),
    },
  });
}

async function readRedisCard(cacheKey: string): Promise<CachedCard | null> {
  const fields = await redisCall(() => redis.hgetallBuffer(redisKey(cacheKey)));
  if (!fields) return null;
  const png = fields.png;
  const meta = parseMeta(fields.meta);
  if (!png || !meta || !isPng(png)) return null;
  const now = Date.now();
  return {
    bytes: toPngBytes(png),
    contentType: meta.contentType,
    etag: meta.etag,
    cacheControl: meta.cacheControl,
    timestamp: now,
    renderedAt: meta.createdAt,
    renderMs: meta.renderMs,
  };
}

async function writeRedisCard(cacheKey: string, card: CachedCard): Promise<void> {
  const key = redisKey(cacheKey);
  const meta: StoredMeta = {
    contentType: card.contentType,
    etag: card.etag,
    cacheControl: card.cacheControl,
    createdAt: card.renderedAt,
    renderMs: card.renderMs,
  };
  await redisCall(async () => {
    const pipe = redis.pipeline();
    pipe.hset(key, 'png', Buffer.from(card.bytes), 'meta', JSON.stringify(meta));
    pipe.expire(key, REDIS_TTL_SEC);
    pipe.zadd(REDIS_INDEX, card.renderedAt, key);
    const results = await pipe.exec();
    const failed = results?.find((row) => row[0]);
    if (failed?.[0]) throw failed[0];

    const count = await redis.zcard(REDIS_INDEX);
    if (count <= MAX_REDIS_CARDS) return;
    const old = await redis.zrange(REDIS_INDEX, 0, count - MAX_REDIS_CARDS - 1);
    if (old.length === 0) return;
    await redis.del(...old);
    await redis.zrem(REDIS_INDEX, ...old);
  });
}

async function cheapCompress(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const sharp = (await import('sharp')).default;
  const compressed = await sharp(Buffer.from(bytes)).png({ compressionLevel: 6, effort: 1 }).toBuffer();
  return toPngBytes(compressed);
}

function scheduleHeavyCompress(cacheKey: string, source: ArrayBuffer, renderedAt: number): void {
  void (async () => {
    try {
      const sharp = (await import('sharp')).default;
      const compressed = await sharp(Buffer.from(source))
        .png({ compressionLevel: 9, effort: 7, palette: true })
        .toBuffer();
      const small = toPngBytes(compressed);
      const key = redisKey(cacheKey);
      await redisCall(async () => {
        const meta = parseMeta((await redis.hgetBuffer(key, 'meta')) ?? undefined);
        if (!meta || meta.createdAt !== renderedAt) return;
        await redis.hset(key, 'png', Buffer.from(small));
      }, 2000);
    } catch (err) {
      console.warn('[ogCache] Heavy compression skipped:', err);
    }
  })();
}

async function renderAndStore(
  cacheKey: string,
  renderFn: () => Promise<ImageResponse | null>,
): Promise<CachedCard | null> {
  const started = Date.now();
  const imageResponse = await renderFn();
  if (!imageResponse) return null;

  const rawBuffer = await imageResponse.arrayBuffer();
  const raw = toPngBytes(rawBuffer);
  const contentType = imageResponse.headers.get('content-type') || 'image/png';
  const etag = imageResponse.headers.get('etag') || `"og-${started.toString(36)}"`;
  const cacheControl =
    imageResponse.headers.get('cache-control') ||
    'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800';

  let bytes = raw;
  if (contentType.includes('png') && raw.byteLength > 32) {
    try {
      bytes = await cheapCompress(raw);
    } catch (optErr) {
      console.warn('[ogCache] Sharp compression skipped:', optErr);
    }
  }

  const renderedAt = Date.now();
  const card: CachedCard = {
    bytes,
    contentType,
    etag,
    cacheControl,
    timestamp: renderedAt,
    renderedAt,
    renderMs: renderedAt - started,
  };
  remember(cacheKey, card);
  await writeRedisCard(cacheKey, card);
  if (contentType.includes('png') && raw.byteLength > 32) {
    scheduleHeavyCompress(cacheKey, raw, renderedAt);
  }
  return card;
}

function startRender(
  cacheKey: string,
  renderFn: () => Promise<ImageResponse | null>,
): Promise<CachedCard | null> {
  const existing = inFlightRenders.get(cacheKey);
  if (existing) return existing;

  const promise = renderAndStore(cacheKey, renderFn)
    .catch((err: unknown) => {
      console.error(`[ogCache] Render failed for ${cacheKey}:`, err);
      return null;
    })
    .finally(() => {
      if (inFlightRenders.get(cacheKey) === promise) inFlightRenders.delete(cacheKey);
    });
  inFlightRenders.set(cacheKey, promise);
  return promise;
}

/**
 * OG card cache.
 *
 * 1. In-memory map serves repeat requests in this process for 60 minutes.
 * 2. Redis keeps the PNG for 7 days so a deploy or a quiet card does not re-render.
 * 3. A Redis copy older than 15 minutes is returned immediately and refreshed in the background.
 * 4. The slow high-compression pass runs after the response, once per render.
 */
export async function getOrRenderOgCard(
  cacheKey: string,
  renderFn: () => Promise<ImageResponse | null>,
): Promise<Response | null> {
  const started = Date.now();

  const cached = cardCache.get(cacheKey);
  if (cached && started - cached.timestamp < MEMORY_TTL_MS) {
    return cardResponse(cached, 'HIT', Date.now() - started);
  }

  const fromRedis = await readRedisCard(cacheKey);
  if (fromRedis) {
    remember(cacheKey, fromRedis);
    const age = started - fromRedis.renderedAt;
    if (age > STALE_AFTER_MS) {
      void startRender(cacheKey, renderFn);
      return cardResponse(fromRedis, 'STALE', Date.now() - started);
    }
    return cardResponse(fromRedis, 'L2', Date.now() - started);
  }

  const card = await startRender(cacheKey, renderFn);
  if (!card) return null;
  return cardResponse(card, 'MISS', card.renderMs);
}

/** Clear cache if needed (e.g. for testing). Redis deletes are best-effort. */
export function purgeOgCardCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    cardCache.clear();
  } else {
    for (const key of cardCache.keys()) {
      if (key.startsWith(keyPrefix)) cardCache.delete(key);
    }
  }

  void redisCall(async () => {
    const members = await redis.zrange(REDIS_INDEX, 0, -1);
    const drop = members.filter((key) => {
      if (!key.startsWith(REDIS_KEY_PREFIX)) return false;
      if (!keyPrefix) return true;
      return key.slice(REDIS_KEY_PREFIX.length).startsWith(keyPrefix);
    });
    if (drop.length === 0) return;
    await redis.del(...drop);
    await redis.zrem(REDIS_INDEX, ...drop);
  });
}
