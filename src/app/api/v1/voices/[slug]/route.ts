import { NextResponse } from 'next/server';
import { Errors } from '@/middleware/errorHandler';
import { getPublishedVoiceStoryBySlug } from '@/modules/voices/voice.service';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const story = await getPublishedVoiceStoryBySlug(slug);
  if (!story) throw Errors.notFound('Story not found');
  return NextResponse.json({ success: true, data: story });
}
