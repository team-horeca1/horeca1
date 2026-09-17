import { renderProductShareImage } from '@/lib/share-cards/renderProductCard';
import { notFoundOgResponse, parseOgFormat } from '@/lib/share-cards/ogHelpers';
import { getOrRenderOgCard } from '@/lib/share-cards/ogCache';

export const runtime = 'nodejs';
export const revalidate = 300;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const format = parseOgFormat(req);
  const cacheKey = `product:${id}:${format}`;

  const image = await getOrRenderOgCard(cacheKey, () =>
    renderProductShareImage(id, format, req),
  );
  if (!image) return notFoundOgResponse('Product not found');
  return image;
}
