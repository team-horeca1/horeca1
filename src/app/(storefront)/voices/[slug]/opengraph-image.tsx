import { ImageResponse } from 'next/og';
import { getPublishedVoiceStoryBySlug } from '@/modules/voices/voice.service';
import { VoiceShareCard } from '@/lib/share-cards/templates';
import { resolveOgImage } from '@/lib/share-cards/absoluteUrl';
import { qrPngDataUrl } from '@/lib/share-cards/qr';
import { voiceTitleLine } from '@/sanity/lib/types';

export const alt = 'Horeca1 Voice story';
export const size = { width: 1080, height: 1080 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string; slug: string }> }) {
  const { slug } = await params;
  const story = await getPublishedVoiceStoryBySlug(slug);
  const origin = process.env.AUTH_URL || 'http://localhost:3000';
  const articleUrl = `${origin}/voices/${slug}`;
  const qrDataUrl = await qrPngDataUrl(articleUrl);
  const photoUrl = await resolveOgImage(origin, story?.photoOgUrl || story?.photoUrl);

  return new ImageResponse(
    (
      <VoiceShareCard
        format="square"
        name={story?.name ?? 'Horeca1 Voices'}
        badge={story?.badge ?? 'HORECA1 VOICES'}
        quote={story?.quote ?? 'Stories from the industry, for the industry.'}
        titleLine={story ? voiceTitleLine(story.role, story.venue) : ''}
        photoUrl={photoUrl}
        articleUrl={articleUrl}
        qrDataUrl={qrDataUrl}
      />
    ),

    { ...size },
  );
}
