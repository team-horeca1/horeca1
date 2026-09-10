import { NextResponse } from 'next/server';
import {
  listHomepageVoiceStories,
  listPublishedVoiceStories,
} from '@/modules/voices/voice.service';

export async function GET(req: Request) {
  try {
    const home = new URL(req.url).searchParams.get('home') === '1';
    const stories = home
      ? await listHomepageVoiceStories()
      : await listPublishedVoiceStories(12);
    return NextResponse.json({ success: true, data: stories });
  } catch (error) {
    console.error('[voices] list failed', error);
    return NextResponse.json({ success: true, data: [] });
  }
}
