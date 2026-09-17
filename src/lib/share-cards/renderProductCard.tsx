import 'server-only';
import { ImageResponse } from 'next/og';
import { CommerceShareCard } from '@/lib/share-cards/templates';
import { resolveOgImage } from '@/lib/share-cards/absoluteUrl';
import { qrPngDataUrl } from '@/lib/share-cards/qr';
import { productBrandMappingsInclude } from '@/lib/brandAuthorizedDistributor';
import { prisma } from '@/lib/prisma';
import {
  discountPct,
  formatAmount,
  OG_SIZES,
  type OgFormat,
  ogCacheHeaders,
  shareSiteOrigin,
  toGrossPrice,
} from '@/lib/share-cards/ogHelpers';

export async function renderProductShareImage(
  id: string,
  format: OgFormat,
  req?: Request,
): Promise<ImageResponse | null> {
  const origin = shareSiteOrigin(req);
  const pageUrl = `${origin}/product/${id}`;

  const product = await prisma.product.findFirst({
    where: {
      id,
      isActive: true,
      approvalStatus: 'approved',
      archivedAt: null,
      vendor: { isActive: true },
    },
    select: {
      name: true,
      packSize: true,
      unit: true,
      imageUrl: true,
      images: true,
      basePrice: true,
      promoPrice: true,
      originalPrice: true,
      taxPercent: true,
      updatedAt: true,
      vendor: { select: { id: true, businessName: true, displayName: true } },
      priceSlabs: {
        orderBy: { minQty: 'asc' },
        take: 1,
        select: { price: true, minQty: true },
      },
      brandMappings: productBrandMappingsInclude,
    },
  });

  if (!product) return null;

  const master = product.brandMappings?.[0]?.brandMasterProduct;
  const rawImage =
    product.imageUrl ||
    product.images?.[0] ||
    master?.imageUrl ||
    master?.images?.[0] ||
    null;

  const tax = Number(product.taxPercent) || 0;
  const base = Number(product.basePrice) || 0;
  const promo = product.promoPrice != null ? Number(product.promoPrice) : null;
  const mrp = product.originalPrice != null ? Number(product.originalPrice) : null;

  const taxable =
    promo != null && promo < base ? promo : base;
  const grossPrice = toGrossPrice(taxable, tax);
  const grossMrp =
    mrp != null && mrp > taxable
      ? toGrossPrice(mrp, tax)
      : promo != null && promo < base
        ? toGrossPrice(base, tax)
        : null;

  const pct = grossMrp != null ? discountPct(grossPrice, grossMrp) : null;
  const vendorName = product.vendor?.displayName || product.vendor?.businessName;
  const pack = [product.packSize, product.unit].filter(Boolean).join(' ') || undefined;
  const slab = product.priceSlabs?.[0];
  const slabOffer =
    slab != null
      ? `${formatAmount(toGrossPrice(Number(slab.price), tax))} at ${slab.minQty}+`
      : undefined;

  const priceHero = formatAmount(grossPrice);
  const mrpLine = grossMrp != null ? formatAmount(grossMrp) : undefined;
  const discountLine = pct != null && pct > 0 ? `${pct}% OFF` : undefined;

  const [qrDataUrl, imageUrl] = await Promise.all([
    qrPngDataUrl(pageUrl),
    resolveOgImage(origin, rawImage),
  ]);

  return new ImageResponse(
    (
      <CommerceShareCard
        format={format}
        kicker="PRODUCT"
        title={product.name}
        subtitle={vendorName || undefined}
        statLine={pack}
        offer={slabOffer}
        price={priceHero}
        originalPrice={mrpLine}
        discount={discountLine}
        cta="Open in Horeca1"
        imageUrl={imageUrl}
        pageUrl={pageUrl}
        qrDataUrl={qrDataUrl}
      />
    ),
    {
      ...OG_SIZES[format],
      headers: ogCacheHeaders(product.updatedAt),
    },
  );
}
