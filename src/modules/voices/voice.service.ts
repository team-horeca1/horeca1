import { prisma } from '@/lib/prisma';

export type VoiceStoryPublic = {
  id: string;
  slug: string;
  badge: string;
  name: string;
  role: string | null;
  venue: string | null;
  quote: string;
  body: string | null;
  photoUrl: string | null;
  publishedAt: Date;
};

const publicSelect = {
  id: true,
  slug: true,
  badge: true,
  name: true,
  role: true,
  venue: true,
  quote: true,
  body: true,
  photoUrl: true,
  publishedAt: true,
} as const;

export async function listPublishedVoiceStories(limit = 20): Promise<VoiceStoryPublic[]> {
  return prisma.voiceStory.findMany({
    where: { published: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: publicSelect,
  });
}

export async function getPublishedVoiceStoryBySlug(slug: string): Promise<VoiceStoryPublic | null> {
  return prisma.voiceStory.findFirst({
    where: { slug, published: true },
    select: publicSelect,
  });
}
