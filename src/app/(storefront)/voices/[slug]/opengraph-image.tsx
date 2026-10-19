import { ImageResponse } from 'next/og';
import { getPublishedVoiceStoryBySlug } from '@/modules/voices/voice.service';
import { VoiceShareCard } from '@/lib/share-cards/templates';
import { loadHorecaLogoDataUrl, resolveOgImage } from '@/lib/share-cards/absoluteUrl';
import { loadShareFonts } from '@/lib/share-cards/fonts';
import { voiceTitleLine } from '@/sanity/lib/types';
import { shareSiteOrigin } from '@/lib/share-cards/ogHelpers';

export const alt = 'Horeca1 Voice story';
export const size = { width: 1080, height: 1080 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getPublishedVoiceStoryBySlug(slug);
  const origin = shareSiteOrigin();
  const [photoUrl, logoUrl, fonts] = await Promise.all([
    resolveOgImage(origin, story?.photoOgUrl || story?.photoUrl, { maxPx: 1000 }),
    loadHorecaLogoDataUrl(),
    loadShareFonts(),
  ]);

  return new ImageResponse(
    (
      <VoiceShareCard
        format="square"
        name={story?.name ?? 'Horeca1 Voices'}
        badge={story?.badge ?? 'HORECA1 VOICES'}
        quote={story?.quote ?? 'Stories from the industry, for the industry.'}
        titleLine={story ? voiceTitleLine(story.role, story.venue) : ''}
        photoUrl={photoUrl}
        logoUrl={logoUrl}
      />
    ),
    { ...size, fonts },
  );
}
