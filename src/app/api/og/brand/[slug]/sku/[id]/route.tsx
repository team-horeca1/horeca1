import { renderBrandProductShareImage } from '@/lib/share-cards/renderBrandProductCard';
import { notFoundOgResponse, parseOgFormat } from '@/lib/share-cards/ogHelpers';
import { getOrRenderOgCard } from '@/lib/share-cards/ogCache';

export const runtime = 'nodejs';
export const revalidate = 300;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  const format = parseOgFormat(req);
  const cacheKey = `brand-sku:${slug}:${id}:${format}`;

  const image = await getOrRenderOgCard(cacheKey, () =>
    renderBrandProductShareImage(slug, id, format, req),
  );
  if (!image) return notFoundOgResponse('Product not found');
  return image;
}
