import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import {
  HERO_FALLBACK,
  clampHeroPos,
  isHeroAlignX,
  isHeroAlignY,
  resolveHeroImages,
  type HeroAlignX,
  type HeroAlignY,
} from '@/modules/homepage/homepage-hero.constants';

export { HERO_FALLBACK };

export type HomepageHeroSlideDto = {
  id: string;
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
  sortOrder: number;
  isActive: boolean;
  /** Resolved URLs for storefront (never blank). */
  resolvedDesktopImageUrl: string;
  resolvedMobileImageUrl: string;
};

export type HomepageHeroSlideInput = {
  desktopImageUrl?: string | null;
  mobileImageUrl?: string | null;
  eyebrow?: string;
  headline?: string;
  ctaLabel?: string;
  ctaHref?: string;
  showText?: boolean;
  showCta?: boolean;
  copyAlignX?: string;
  copyAlignY?: string;
  copyOffsetX?: number;
  copyOffsetY?: number;
  showTextMobile?: boolean;
  showCtaMobile?: boolean;
  copyAlignXMobile?: string;
  copyAlignYMobile?: string;
  copyOffsetXMobile?: number;
  copyOffsetYMobile?: number;
  isActive?: boolean;
};

type SlideRow = {
  id: string;
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
  eyebrow: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
  showText: boolean;
  showCta: boolean;
  copyAlignX: string;
  copyAlignY: string;
  copyOffsetX: number;
  copyOffsetY: number;
  showTextMobile: boolean;
  showCtaMobile: boolean;
  copyAlignXMobile: string;
  copyAlignYMobile: string;
  copyOffsetXMobile: number;
  copyOffsetYMobile: number;
  sortOrder: number;
  isActive: boolean;
};

function toDto(row: SlideRow): HomepageHeroSlideDto {
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
    copyOffsetX: clampHeroPos(row.copyOffsetX),
    copyOffsetY: clampHeroPos(row.copyOffsetY),
    showTextMobile: row.showTextMobile,
    showCtaMobile: row.showCtaMobile,
    copyAlignXMobile: isHeroAlignX(row.copyAlignXMobile) ? row.copyAlignXMobile : 'left',
    copyAlignYMobile: isHeroAlignY(row.copyAlignYMobile) ? row.copyAlignYMobile : 'bottom',
    copyOffsetXMobile: clampHeroPos(row.copyOffsetXMobile),
    copyOffsetYMobile: clampHeroPos(row.copyOffsetYMobile),
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    ...images,
  };
}

/** Fallback slide when DB has no active rows (storefront never blank). */
export function fallbackHeroSlide(): HomepageHeroSlideDto {
  return {
    id: 'fallback',
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
    sortOrder: 0,
    isActive: true,
    resolvedDesktopImageUrl: HERO_FALLBACK.desktopImageUrl,
    resolvedMobileImageUrl: HERO_FALLBACK.mobileImageUrl,
  };
}

/** Active slides for the storefront, ordered. Always returns ≥1 (fallback). */
export async function getHomepageHeroSlides(): Promise<HomepageHeroSlideDto[]> {
  const rows = await prisma.homepageHeroSlide.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  if (rows.length === 0) return [fallbackHeroSlide()];
  return rows.map(toDto);
}

/** All slides for admin (active + inactive). */
export async function listHomepageHeroSlides(): Promise<HomepageHeroSlideDto[]> {
  const rows = await prisma.homepageHeroSlide.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toDto);
}

export async function getHomepageHeroSlideById(id: string): Promise<HomepageHeroSlideDto> {
  const row = await prisma.homepageHeroSlide.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('Hero slide');
  return toDto(row);
}

export async function createHomepageHeroSlide(
  input: HomepageHeroSlideInput = {},
): Promise<HomepageHeroSlideDto> {
  const max = await prisma.homepageHeroSlide.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (max._max.sortOrder ?? -1) + 1;

  const row = await prisma.homepageHeroSlide.create({
    data: {
      desktopImageUrl: input.desktopImageUrl ?? null,
      mobileImageUrl: input.mobileImageUrl ?? null,
      eyebrow: input.eyebrow ?? HERO_FALLBACK.eyebrow,
      headline: input.headline ?? HERO_FALLBACK.headline,
      ctaLabel: input.ctaLabel ?? HERO_FALLBACK.ctaLabel,
      ctaHref: input.ctaHref ?? HERO_FALLBACK.ctaHref,
      showText: input.showText ?? HERO_FALLBACK.showText,
      showCta: input.showCta ?? HERO_FALLBACK.showCta,
      copyAlignX: input.copyAlignX ?? HERO_FALLBACK.copyAlignX,
      copyAlignY: input.copyAlignY ?? HERO_FALLBACK.copyAlignY,
      copyOffsetX: input.copyOffsetX ?? HERO_FALLBACK.copyOffsetX,
      copyOffsetY: input.copyOffsetY ?? HERO_FALLBACK.copyOffsetY,
      showTextMobile: input.showTextMobile ?? HERO_FALLBACK.showTextMobile,
      showCtaMobile: input.showCtaMobile ?? HERO_FALLBACK.showCtaMobile,
      copyAlignXMobile: input.copyAlignXMobile ?? HERO_FALLBACK.copyAlignXMobile,
      copyAlignYMobile: input.copyAlignYMobile ?? HERO_FALLBACK.copyAlignYMobile,
      copyOffsetXMobile: input.copyOffsetXMobile ?? HERO_FALLBACK.copyOffsetXMobile,
      copyOffsetYMobile: input.copyOffsetYMobile ?? HERO_FALLBACK.copyOffsetYMobile,
      isActive: input.isActive ?? true,
      sortOrder,
    },
  });

  return toDto(row);
}

export async function updateHomepageHeroSlide(
  id: string,
  input: HomepageHeroSlideInput,
): Promise<HomepageHeroSlideDto> {
  const existing = await prisma.homepageHeroSlide.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('Hero slide');

  if (input.isActive === false && existing.isActive) {
    const activeCount = await prisma.homepageHeroSlide.count({
      where: { isActive: true },
    });
    if (activeCount <= 1) {
      throw Errors.badRequest('Keep at least one active banner');
    }
  }

  const row = await prisma.homepageHeroSlide.update({
    where: { id },
    data: {
      ...(input.desktopImageUrl !== undefined && { desktopImageUrl: input.desktopImageUrl }),
      ...(input.mobileImageUrl !== undefined && { mobileImageUrl: input.mobileImageUrl }),
      ...(input.eyebrow !== undefined && { eyebrow: input.eyebrow }),
      ...(input.headline !== undefined && { headline: input.headline }),
      ...(input.ctaLabel !== undefined && { ctaLabel: input.ctaLabel }),
      ...(input.ctaHref !== undefined && { ctaHref: input.ctaHref }),
      ...(input.showText !== undefined && { showText: input.showText }),
      ...(input.showCta !== undefined && { showCta: input.showCta }),
      ...(input.copyAlignX !== undefined && { copyAlignX: input.copyAlignX }),
      ...(input.copyAlignY !== undefined && { copyAlignY: input.copyAlignY }),
      ...(input.copyOffsetX !== undefined && { copyOffsetX: input.copyOffsetX }),
      ...(input.copyOffsetY !== undefined && { copyOffsetY: input.copyOffsetY }),
      ...(input.showTextMobile !== undefined && { showTextMobile: input.showTextMobile }),
      ...(input.showCtaMobile !== undefined && { showCtaMobile: input.showCtaMobile }),
      ...(input.copyAlignXMobile !== undefined && { copyAlignXMobile: input.copyAlignXMobile }),
      ...(input.copyAlignYMobile !== undefined && { copyAlignYMobile: input.copyAlignYMobile }),
      ...(input.copyOffsetXMobile !== undefined && { copyOffsetXMobile: input.copyOffsetXMobile }),
      ...(input.copyOffsetYMobile !== undefined && { copyOffsetYMobile: input.copyOffsetYMobile }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  return toDto(row);
}

export async function deleteHomepageHeroSlide(id: string): Promise<void> {
  const existing = await prisma.homepageHeroSlide.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('Hero slide');

  const total = await prisma.homepageHeroSlide.count();
  if (total <= 1) {
    throw Errors.badRequest('Keep at least one banner');
  }

  if (existing.isActive) {
    const activeCount = await prisma.homepageHeroSlide.count({
      where: { isActive: true },
    });
    if (activeCount <= 1) {
      throw Errors.badRequest('Keep at least one active banner');
    }
  }

  await prisma.homepageHeroSlide.delete({ where: { id } });
}

export async function reorderHomepageHeroSlides(orderedIds: string[]): Promise<HomepageHeroSlideDto[]> {
  const existing = await prisma.homepageHeroSlide.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((r) => r.id));

  if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
    throw Errors.badRequest('orderedIds must include every slide exactly once');
  }

  await prisma.$transaction(
    orderedIds.map((id, sortOrder) =>
      prisma.homepageHeroSlide.update({
        where: { id },
        data: { sortOrder },
      }),
    ),
  );

  return listHomepageHeroSlides();
}

/** Snapshot for audit logs. */
export function snapshotHeroSlide(row: HomepageHeroSlideDto | SlideRow) {
  return {
    desktopImageUrl: row.desktopImageUrl,
    mobileImageUrl: row.mobileImageUrl,
    eyebrow: row.eyebrow,
    headline: row.headline,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    showText: row.showText,
    showCta: row.showCta,
    copyAlignX: row.copyAlignX,
    copyAlignY: row.copyAlignY,
    copyOffsetX: row.copyOffsetX,
    copyOffsetY: row.copyOffsetY,
    showTextMobile: row.showTextMobile,
    showCtaMobile: row.showCtaMobile,
    copyAlignXMobile: row.copyAlignXMobile,
    copyAlignYMobile: row.copyAlignYMobile,
    copyOffsetXMobile: row.copyOffsetXMobile,
    copyOffsetYMobile: row.copyOffsetYMobile,
    sortOrder: 'sortOrder' in row ? row.sortOrder : undefined,
    isActive: 'isActive' in row ? row.isActive : undefined,
  };
}
