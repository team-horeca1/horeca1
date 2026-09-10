import { shareCard, type ShareCardResult } from '@/lib/share-cards/shareClient';

export async function shareVoiceStory(opts: {
  slug: string;
  name: string;
  quote?: string;
}): Promise<ShareCardResult> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}/voices/${opts.slug}`;
  const text = opts.quote || `Read ${opts.name} on Horeca1 Voices`;
  return shareCard({
    title: opts.name,
    text,
    url,
    imageUrl: `/api/og/voices/${encodeURIComponent(opts.slug)}?format=portrait`,
  });
}
