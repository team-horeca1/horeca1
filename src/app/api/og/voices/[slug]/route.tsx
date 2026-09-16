import { ImageResponse } from 'next/og';
import { VoiceShareCard } from '@/lib/share-cards/templates';
import { resolveOgImage } from '@/lib/share-cards/absoluteUrl';
import { qrPngDataUrl } from '@/lib/share-cards/qr';
import { getPublishedVoiceStoryBySlug } from '@/modules/voices/voice.service';
import { voiceTitleLine } from '@/sanity/lib/types';
import {
  notFoundOgResponse,
  OG_SIZES,
  ogCacheHeaders,
  parseOgFormat,
  shareSiteOrigin,
} from '@/lib/share-cards/ogHelpers';

export const runtime = 'nodejs';
export const revalidate = 120;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const format = parseOgFormat(req);
  const story = await getPublishedVoiceStoryBySlug(slug);
  if (!story) return notFoundOgResponse('Story not found');

  const origin = shareSiteOrigin(req);
  const name = story.name;
  const quote = story.quote;
  const badge = story.badge ?? 'HORECA1 VOICES';
  const titleLine = voiceTitleLine(story.role, story.venue);
  const articleUrl = `${origin}/voices/${slug}`;
  const [qrDataUrl, photoUrl] = await Promise.all([
    qrPngDataUrl(articleUrl),
    resolveOgImage(origin, story.photoOgUrl || story.photoUrl),
  ]);

  return new ImageResponse(
    (
      <VoiceShareCard
        format={format}
        name={name}
        badge={badge}
        quote={quote}
        titleLine={titleLine}
        photoUrl={photoUrl}
        articleUrl={articleUrl}
        qrDataUrl={qrDataUrl}
      />
    ),
    {
      ...OG_SIZES[format],
      headers: ogCacheHeaders(story.publishedAt),
    },
  );
}
