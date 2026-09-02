import { NextResponse } from 'next/server';
import { listPublishedVoiceStories } from '@/modules/voices/voice.service';

export async function GET() {
  const stories = await listPublishedVoiceStories(12);
  return NextResponse.json({ success: true, data: stories });
}
