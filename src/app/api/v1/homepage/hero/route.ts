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
        showText: HERO_FALLBACK.showText,
        showCta: HERO_FALLBACK.showCta,
        copyAlignX: HERO_FALLBACK.copyAlignX,
        copyAlignY: HERO_FALLBACK.copyAlignY,
        copyOffsetX: HERO_FALLBACK.copyOffsetX,
        copyOffsetY: HERO_FALLBACK.copyOffsetY,
        showTextMobile: HERO_FALLBACK.showTextMobile,
        showCtaMobile: HERO_FALLBACK.showCtaMobile,
        copyAlignXMobile: HERO_FALLBACK.copyAlignXMobile,
        copyAlignYMobile: HERO_FALLBACK.copyAlignYMobile,
        copyOffsetXMobile: HERO_FALLBACK.copyOffsetXMobile,
        copyOffsetYMobile: HERO_FALLBACK.copyOffsetYMobile,
        resolvedDesktopImageUrl: HERO_FALLBACK.desktopImageUrl,
        resolvedMobileImageUrl: HERO_FALLBACK.mobileImageUrl,
      },
    });
  }
}
