export type ShareKind =
  | 'product'
  | 'deal'
  | 'collection'
  | 'brand'
  | 'vendor'
  | 'article';

/**
 * Structured payload for the universal Share Engine.
 * `path` is origin-relative (e.g. `/vendor/:id?product=:productId`) — never localhost.
 * `ogPath` is a same-origin OG API path (or CDN URL for pre-rendered Voices cards).
 */
export type ShareableContent = {
  kind: ShareKind;
  id: string;
  title: string;
  text: string;
  path: string;
  image?: string | null;
  ogPath: string;
  downloadName: string;
  /** Optional subtitle shown in the sheet preview (vendor, pack, etc.). */
  subtitle?: string | null;
  /** Optional price line for instant preview (products/deals). */
  priceLabel?: string | null;
  /** Coupon code — copy-only, never printed on share PNGs. */
  couponCode?: string | null;
  /** Prefer CDN URL when Voices pre-rendered cards exist. */
  preRenderedImageUrl?: string | null;
};

export function shareAbsoluteUrl(path: string, origin?: string): string {
  const base =
    (origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
      /\/$/,
      '',
    );
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

/** Supplier catalog URL that highlights one product card. */
export function vendorProductHref(vendorId: string, productId: string): string {
  return `/vendor/${encodeURIComponent(vendorId)}?product=${encodeURIComponent(productId)}`;
}

export function productShareContent(opts: {
  id: string;
  vendorId: string;
  title: string;
  vendorName?: string | null;
  image?: string | null;
  priceLabel?: string | null;
  pack?: string | null;
  updatedAt?: string | number | Date | null;
}): ShareableContent {
  const v = opts.updatedAt ? `&v=${encodeURIComponent(String(opts.updatedAt))}` : '';
  const vendor = opts.vendorName?.trim();
  return {
    kind: 'product',
    id: opts.id,
    title: opts.title,
    text: vendor
      ? `Check out ${opts.title} from ${vendor} on Horeca1.`
      : `Check out ${opts.title} on Horeca1.`,
    path: vendorProductHref(opts.vendorId, opts.id),
    image: opts.image,
    ogPath: `/api/og/product/${opts.id}?format=portrait${v}`,
    downloadName: `horeca1-product-${opts.id}.png`,
    subtitle: [vendor, opts.pack].filter(Boolean).join(' · ') || null,
    priceLabel: opts.priceLabel,
  };
}

export function vendorShareContent(opts: {
  id: string;
  name: string;
  image?: string | null;
  updatedAt?: string | number | Date | null;
}): ShareableContent {
  const v = opts.updatedAt ? `&v=${encodeURIComponent(String(opts.updatedAt))}` : '';
  return {
    kind: 'vendor',
    id: opts.id,
    title: opts.name,
    text: `Check out ${opts.name} on Horeca1.`,
    path: `/vendor/${opts.id}`,
    image: opts.image,
    ogPath: `/api/og/vendor/${opts.id}?format=portrait${v}`,
    downloadName: `horeca1-vendor-${opts.id}.png`,
    subtitle: 'Supplier store',
  };
}

export function brandShareContent(opts: {
  slug: string;
  name: string;
  image?: string | null;
  updatedAt?: string | number | Date | null;
}): ShareableContent {
  const v = opts.updatedAt ? `&v=${encodeURIComponent(String(opts.updatedAt))}` : '';
  return {
    kind: 'brand',
    id: opts.slug,
    title: opts.name,
    text: `Find ${opts.name} on Horeca1.`,
    path: `/brand/${opts.slug}`,
    image: opts.image,
    ogPath: `/api/og/brand/${encodeURIComponent(opts.slug)}?format=portrait${v}`,
    downloadName: `horeca1-brand-${opts.slug}.png`,
    subtitle: 'Brand store',
  };
}

export function collectionShareContent(opts: {
  slug: string;
  name: string;
  image?: string | null;
  itemCount?: number | null;
  updatedAt?: string | number | Date | null;
}): ShareableContent {
  const v = opts.updatedAt ? `&v=${encodeURIComponent(String(opts.updatedAt))}` : '';
  const count =
    opts.itemCount != null && opts.itemCount > 0
      ? `${opts.itemCount} product${opts.itemCount === 1 ? '' : 's'}`
      : null;
  return {
    kind: 'collection',
    id: opts.slug,
    title: opts.name,
    text: `Browse ${opts.name} on Horeca1.`,
    path: `/collections/${opts.slug}`,
    image: opts.image,
    ogPath: `/api/og/collection/${encodeURIComponent(opts.slug)}?format=portrait${v}`,
    downloadName: `horeca1-collection-${opts.slug}.png`,
    subtitle: count,
  };
}

export function dealShareContent(opts: {
  id: string;
  title: string;
  vendorId: string;
  vendorName?: string | null;
  image?: string | null;
  priceLabel?: string | null;
  endDate?: string | null;
}): ShareableContent {
  const vendor = opts.vendorName?.trim();
  return {
    kind: 'deal',
    id: opts.id,
    title: opts.title,
    text: vendor
      ? `${opts.title} from ${vendor} on Horeca1.`
      : `${opts.title} on Horeca1.`,
    path: `/vendor/${opts.vendorId}`,
    image: opts.image,
    ogPath: `/api/og/deal/${opts.id}?format=portrait`,
    downloadName: `horeca1-deal-${opts.id}.png`,
    subtitle: vendor || 'Store offer',
    priceLabel: opts.priceLabel,
  };
}

export function articleShareContent(opts: {
  slug: string;
  name: string;
  quote: string;
  role?: string | null;
  venue?: string | null;
  photoUrl?: string | null;
  preRenderedImageUrl?: string | null;
}): ShareableContent {
  const titleLine = [opts.role, opts.venue].filter(Boolean).join(' · ');
  return {
    kind: 'article',
    id: opts.slug,
    title: opts.name,
    text: `🌟 *${opts.name}*${titleLine ? ` (${titleLine})` : ''}\n"${opts.quote}"\n\n📖 Read the full story on Horeca1 Voices:`,
    path: `/voices/${opts.slug}`,
    image: opts.photoUrl,
    ogPath: `/api/og/voices/${encodeURIComponent(opts.slug)}?format=portrait`,
    downloadName: `horeca1-voices-${opts.slug}.png`,
    subtitle: titleLine || 'Horeca1 Voices',
    preRenderedImageUrl: opts.preRenderedImageUrl,
  };
}
