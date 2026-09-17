import 'server-only';

/**
 * Public site origin for share cards / QR codes.
 * Prefer AUTH_URL so Docker/proxy request origins never leak as localhost.
 */
export function shareSiteOrigin(req?: Request): string {
  const fromEnv = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
  if (fromEnv && !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(fromEnv)) {
    return fromEnv;
  }
  if (req) {
    try {
      const origin = new URL(req.url).origin;
      if (origin && !origin.includes('0.0.0.0')) return origin.replace(/\/$/, '');
    } catch {
      /* fall through */
    }
  }
  return fromEnv || 'http://localhost:3000';
}

export const OG_SIZES = {
  portrait: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
} as const;

export type OgFormat = keyof typeof OG_SIZES;

export function parseOgFormat(req: Request): OgFormat {
  return new URL(req.url).searchParams.get('format') === 'square' ? 'square' : 'portrait';
}

/** GST-inclusive public catalog price (never customer list prices). */
export function toGrossPrice(taxable: number, taxPercent: number): number {
  return Math.round(taxable * (1 + taxPercent / 100) * 100) / 100;
}

/** Format currency numbers cleanly in en-IN locale. */
export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-IN', {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  });
}

/** Fallback string formatting with Rs. prefix where JSX components cannot be used. */
export function formatInr(amount: number): string {
  return `Rs. ${formatAmount(amount)}`;
}

export function discountPct(price: number, mrp: number): number | null {
  if (!(mrp > price) || price <= 0) return null;
  return Math.round(((mrp - price) / mrp) * 100);
}

export function ogCacheHeaders(updatedAt?: Date | string | null): Record<string, string> {
  const etagSource = updatedAt
    ? new Date(updatedAt).getTime().toString(36)
    : 'static';
  return {
    'content-type': 'image/png',
    'cache-control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
    etag: `"og-v4-${etagSource}"`,
  };
}

export function notFoundOgResponse(message = 'Not found'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60',
    },
  });
}
