import { NextResponse } from 'next/server';
import {
  fallbackHeroSlide,
  getHomepageHeroSlides,
} from '@/modules/homepage/homepage-hero.service';

/** Public homepage hero slides — no auth. */
export async function GET() {
  try {
    const slides = await getHomepageHeroSlides();
    return NextResponse.json({ success: true, data: { slides } });
  } catch (error) {
    console.error('[homepage/hero] failed', error);
    return NextResponse.json({
      success: true,
      data: { slides: [fallbackHeroSlide()] },
    });
  }
}
