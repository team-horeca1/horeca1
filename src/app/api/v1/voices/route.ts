import { NextResponse } from 'next/server';
import { listPublishedVoiceStories } from '@/modules/voices/voice.service';

export async function GET() {
  try {
    const stories = await listPublishedVoiceStories(12);
    return NextResponse.json({ success: true, data: stories });
  } catch (error) {
    console.error('[voices] list failed', error);
    // Self-hide on homepage when table missing / DB unavailable — never 500 the rail.
    return NextResponse.json({ success: true, data: [] });
  }
}
