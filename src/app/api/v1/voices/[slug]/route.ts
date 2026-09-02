import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const story = await prisma.voiceStory.findFirst({
    where: { slug, published: true },
  });

  if (!story) throw Errors.notFound('Story not found');

  return NextResponse.json({ success: true, data: story });
}
