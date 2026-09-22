import { prisma } from '@/lib/prisma';
import { HERO_FALLBACK } from '@/modules/homepage/homepage-hero.constants';

export { HERO_FALLBACK };

export type HomepageHeroDto = {
  id: string | null;
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
  eyebrow: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
  /** Resolved URLs for storefront (never blank). */
  resolvedDesktopImageUrl: string;
  resolvedMobileImageUrl: string;
};

function resolveImages(row: {
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
}): Pick<HomepageHeroDto, 'resolvedDesktopImageUrl' | 'resolvedMobileImageUrl'> {
  const desktop = row.desktopImageUrl?.trim() || HERO_FALLBACK.desktopImageUrl;
  const mobile =
    row.mobileImageUrl?.trim() ||
    row.desktopImageUrl?.trim() ||
    HERO_FALLBACK.mobileImageUrl;
  return { resolvedDesktopImageUrl: desktop, resolvedMobileImageUrl: mobile };
}

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
  const images = resolveImages(row);
  return {
    id: row.id,
    desktopImageUrl: row.desktopImageUrl,
    mobileImageUrl: row.mobileImageUrl,
    eyebrow: row.eyebrow || HERO_FALLBACK.eyebrow,
    headline: row.headline || HERO_FALLBACK.headline,
    ctaLabel: row.ctaLabel || HERO_FALLBACK.ctaLabel,
    ctaHref: row.ctaHref || HERO_FALLBACK.ctaHref,
    ...images,
  };
}
