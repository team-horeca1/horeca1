import { ImageResponse } from 'next/og';
import { CommerceShareCard } from '@/lib/share-cards/templates';
import { resolveOgImage } from '@/lib/share-cards/absoluteUrl';
import { qrPngDataUrl } from '@/lib/share-cards/qr';
import { productBrandMappingsInclude } from '@/lib/brandAuthorizedDistributor';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const SIZES = {
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
} as const;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const format = new URL(req.url).searchParams.get('format') === 'portrait' ? 'portrait' : 'square';
  const origin = new URL(req.url).origin;
  const pageUrl = `${origin}/product/${id}`;
  const qrDataUrl = await qrPngDataUrl(pageUrl);

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      name: true,
      packSize: true,
      unit: true,
      imageUrl: true,
      images: true,
      basePrice: true,
      promoPrice: true,
      vendor: { select: { id: true, businessName: true, displayName: true } },
      priceSlabs: {
        orderBy: { minQty: 'asc' },
        take: 1,
        select: { price: true, minQty: true },
      },
      brandMappings: productBrandMappingsInclude,
    },
  });

  const master = product?.brandMappings?.[0]?.brandMasterProduct;
  const rawImage =
    product?.imageUrl ||
    product?.images?.[0] ||
    master?.imageUrl ||
    master?.images?.[0] ||
    null;

  const vendorName = product?.vendor?.displayName || product?.vendor?.businessName;
  const pack = [product?.packSize, product?.unit].filter(Boolean).join(' ') || undefined;
  const unitPrice = product?.promoPrice ?? product?.basePrice;
  const slab = product?.priceSlabs?.[0];
  const priceBit = unitPrice != null ? `Rs. ${Number(unitPrice)}` : undefined;
  const offer = slab ? `Rs. ${Number(slab.price)} at ${slab.minQty}+` : undefined;
  const imageUrl = await resolveOgImage(origin, rawImage);

  return new ImageResponse(
    (
      <CommerceShareCard
        format={format}
        kicker="PRODUCT"
        title={product?.name ?? 'Horeca1 Product'}
        subtitle={[pack, priceBit].filter(Boolean).join(' · ') || undefined}
        statLine={vendorName ? `Sold by ${vendorName}` : undefined}
        offer={offer}
        cta="Buy this on Horeca1"
        imageUrl={imageUrl}
        pageUrl={pageUrl}
        qrDataUrl={qrDataUrl}
      />
    ),
    { ...SIZES[format] },
  );
}
