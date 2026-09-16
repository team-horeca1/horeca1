import { renderDealShareImage } from '@/lib/share-cards/renderDealCard';
import { notFoundOgResponse, parseOgFormat } from '@/lib/share-cards/ogHelpers';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const format = parseOgFormat(req);
  const image = await renderDealShareImage(id, format, req);
  if (!image) return notFoundOgResponse('Deal not found');
  return image;
}
