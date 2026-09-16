import { renderCollectionShareImage } from '@/lib/share-cards/renderCollectionCard';
import { notFoundOgResponse, parseOgFormat } from '@/lib/share-cards/ogHelpers';

export const runtime = 'nodejs';
export const revalidate = 120;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const format = parseOgFormat(req);
  const image = await renderCollectionShareImage(slug, format, req);
  if (!image) return notFoundOgResponse('Collection not found');
  return image;
}
