import { prisma } from '@/lib/prisma';
import {
  HERO_FALLBACK,
  clampHeroOffset,
  isHeroAlignX,
  isHeroAlignY,
  resolveHeroImages,
  type HeroAlignX,
  type HeroAlignY,
} from '@/modules/homepage/homepage-hero.constants';

export { HERO_FALLBACK };

export type HomepageHeroDto = {
  id: string | null;
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
  eyebrow: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
  showText: boolean;
  showCta: boolean;
  copyAlignX: HeroAlignX;
  copyAlignY: HeroAlignY;
  copyOffsetX: number;
  copyOffsetY: number;
  showTextMobile: boolean;
  showCtaMobile: boolean;
  copyAlignXMobile: HeroAlignX;
  copyAlignYMobile: HeroAlignY;
  copyOffsetXMobile: number;
  copyOffsetYMobile: number;
  /** Resolved URLs for storefront (never blank). */
  resolvedDesktopImageUrl: string;
  resolvedMobileImageUrl: string;
};

/** Ensure a single HomepageHero row exists; return it. */
export async function ensureHomepageHero() {
  const existing = await prisma.homepageHero.findFirst();
  if (existing) return existing;
  return prisma.homepageHero.create({
    data: {
      eyebrow: HERO_FALLBACK.eyebrow,
      headline: HERO_FALLBACK.headline,
      ctaLabel: HERO_FALLBACK.ctaLabel,
      ctaHref: HERO_FALLBACK.ctaHref,
    },
  });
}

export async function getHomepageHeroDto(): Promise<HomepageHeroDto> {
  const row = await ensureHomepageHero();
  const images = resolveHeroImages(row.desktopImageUrl, row.mobileImageUrl);
  return {
    id: row.id,
    desktopImageUrl: row.desktopImageUrl,
    mobileImageUrl: row.mobileImageUrl,
    eyebrow: row.eyebrow,
    headline: row.headline,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    showText: row.showText,
    showCta: row.showCta,
    copyAlignX: isHeroAlignX(row.copyAlignX) ? row.copyAlignX : 'left',
    copyAlignY: isHeroAlignY(row.copyAlignY) ? row.copyAlignY : 'bottom',
    copyOffsetX: clampHeroOffset(row.copyOffsetX),
    copyOffsetY: clampHeroOffset(row.copyOffsetY),
    showTextMobile: row.showTextMobile,
    showCtaMobile: row.showCtaMobile,
    copyAlignXMobile: isHeroAlignX(row.copyAlignXMobile) ? row.copyAlignXMobile : 'left',
    copyAlignYMobile: isHeroAlignY(row.copyAlignYMobile) ? row.copyAlignYMobile : 'bottom',
    copyOffsetXMobile: clampHeroOffset(row.copyOffsetXMobile),
    copyOffsetYMobile: clampHeroOffset(row.copyOffsetYMobile),
    ...images,
  };
}
