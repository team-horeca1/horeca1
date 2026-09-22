import { NextResponse } from 'next/server';
import { getHomepageHeroDto } from '@/modules/homepage/homepage-hero.service';
import { HERO_FALLBACK } from '@/modules/homepage/homepage-hero.constants';

/** Public homepage hero config — no auth. */
export async function GET() {
  try {
    const data = await getHomepageHeroDto();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[homepage/hero] failed', error);
    return NextResponse.json({
      success: true,
      data: {
        id: null,
        desktopImageUrl: null,
        mobileImageUrl: null,
        eyebrow: HERO_FALLBACK.eyebrow,
        headline: HERO_FALLBACK.headline,
        ctaLabel: HERO_FALLBACK.ctaLabel,
        ctaHref: HERO_FALLBACK.ctaHref,
        resolvedDesktopImageUrl: HERO_FALLBACK.desktopImageUrl,
        resolvedMobileImageUrl: HERO_FALLBACK.mobileImageUrl,
      },
    });
  }
}
