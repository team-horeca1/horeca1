import { revalidatePath } from 'next/cache';
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
import type { HomepageHeroSlideInput } from '@/modules/homepage/homepage-hero.service';
import { snapshotHeroSlide } from '@/modules/homepage/homepage-hero.service';

export { snapshotHeroSlide };

export type PageHeroOwner =
  | { vendorId: string; brandId?: undefined }
  | { brandId: string; vendorId?: undefined };

export type PageHeroSlideDto = {
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
  resolvedDesktopImageUrl: string;
  resolvedMobileImageUrl: string;
};

type SlideRow = {
  id: string;
  vendorId: string | null;
  brandId: string | null;
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

export async function vendorPageHeroOwner(vendorId: string): Promise<PageHeroOwner> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
  if (!vendor) throw Errors.notFound('Vendor');
  return { vendorId: vendor.id };
}

export async function brandPageHeroOwner(brandId: string): Promise<PageHeroOwner> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } });
  if (!brand) throw Errors.notFound('Brand');
  return { brandId: brand.id };
}

function ownerWhere(owner: PageHeroOwner) {
  return owner.vendorId ? { vendorId: owner.vendorId } : { brandId: owner.brandId };
}

function assertOwner(row: SlideRow, owner: PageHeroOwner) {
  const matches = owner.vendorId
    ? row.vendorId === owner.vendorId
    : row.brandId === owner.brandId;
  if (!matches) throw Errors.notFound('Hero slide');
}

export function slideHasImage(row: {
  desktopImageUrl?: string | null;
  mobileImageUrl?: string | null;
}): boolean {
  return Boolean(row.desktopImageUrl?.trim() || row.mobileImageUrl?.trim());
}

function toDto(row: SlideRow): PageHeroSlideDto {
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

/** Active slides that have a photo. Empty means the page shows no slider. */
export async function listActivePageHeroSlides(owner: PageHeroOwner): Promise<PageHeroSlideDto[]> {
  const rows = await prisma.pageHeroSlide.findMany({
    where: { ...ownerWhere(owner), isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.filter(slideHasImage).map((row) => {
    const dto = toDto(row);
    const desktop = row.desktopImageUrl?.trim() || row.mobileImageUrl?.trim() || '';
    const mobile = row.mobileImageUrl?.trim() || desktop;
    return {
      ...dto,
      resolvedDesktopImageUrl: desktop,
      resolvedMobileImageUrl: mobile,
    };
  });
}

export async function listPageHeroSlides(owner: PageHeroOwner): Promise<PageHeroSlideDto[]> {
  const rows = await prisma.pageHeroSlide.findMany({
    where: ownerWhere(owner),
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toDto);
}

async function requireOwned(owner: PageHeroOwner, id: string): Promise<SlideRow> {
  const row = await prisma.pageHeroSlide.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('Hero slide');
  assertOwner(row, owner);
  return row;
}

export async function getPageHeroSlideById(
  owner: PageHeroOwner,
  id: string,
): Promise<PageHeroSlideDto> {
  return toDto(await requireOwned(owner, id));
}

const PHOTO_ONLY = {
  eyebrow: '',
  headline: '',
  ctaLabel: '',
  ctaHref: '',
  showText: false,
  showCta: false,
  showTextMobile: false,
  showCtaMobile: false,
};

export async function createPageHeroSlide(
  owner: PageHeroOwner,
  input: HomepageHeroSlideInput = {},
): Promise<PageHeroSlideDto> {
  const max = await prisma.pageHeroSlide.aggregate({
    where: ownerWhere(owner),
    _max: { sortOrder: true },
  });
  const sortOrder = (max._max.sortOrder ?? -1) + 1;

  const row = await prisma.pageHeroSlide.create({
    data: {
      ...ownerWhere(owner),
      desktopImageUrl: input.desktopImageUrl ?? null,
      mobileImageUrl: input.mobileImageUrl ?? null,
      eyebrow: input.eyebrow ?? PHOTO_ONLY.eyebrow,
      headline: input.headline ?? PHOTO_ONLY.headline,
      ctaLabel: input.ctaLabel ?? PHOTO_ONLY.ctaLabel,
      ctaHref: input.ctaHref ?? PHOTO_ONLY.ctaHref,
      showText: input.showText ?? PHOTO_ONLY.showText,
      showCta: input.showCta ?? PHOTO_ONLY.showCta,
      copyAlignX: input.copyAlignX ?? HERO_FALLBACK.copyAlignX,
      copyAlignY: input.copyAlignY ?? HERO_FALLBACK.copyAlignY,
      copyOffsetX: input.copyOffsetX ?? HERO_FALLBACK.copyOffsetX,
      copyOffsetY: input.copyOffsetY ?? HERO_FALLBACK.copyOffsetY,
      showTextMobile: input.showTextMobile ?? PHOTO_ONLY.showTextMobile,
      showCtaMobile: input.showCtaMobile ?? PHOTO_ONLY.showCtaMobile,
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

export async function updatePageHeroSlide(
  owner: PageHeroOwner,
  id: string,
  input: HomepageHeroSlideInput,
): Promise<PageHeroSlideDto> {
  await requireOwned(owner, id);

  const row = await prisma.pageHeroSlide.update({
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

export async function deletePageHeroSlide(owner: PageHeroOwner, id: string): Promise<void> {
  await requireOwned(owner, id);
  await prisma.pageHeroSlide.delete({ where: { id } });
}

export async function reorderPageHeroSlides(
  owner: PageHeroOwner,
  orderedIds: string[],
): Promise<PageHeroSlideDto[]> {
  const existing = await prisma.pageHeroSlide.findMany({
    where: ownerWhere(owner),
    select: { id: true },
  });
  const existingIds = new Set(existing.map((r) => r.id));

  if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
    throw Errors.badRequest('orderedIds must include every slide exactly once');
  }

  await prisma.$transaction(
    orderedIds.map((id, sortOrder) =>
      prisma.pageHeroSlide.update({
        where: { id },
        data: { sortOrder },
      }),
    ),
  );

  return listPageHeroSlides(owner);
}

export async function revalidatePageHero(owner: PageHeroOwner): Promise<void> {
  if (owner.vendorId) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: owner.vendorId },
      select: { slug: true },
    });
    revalidatePath(`/vendor/${owner.vendorId}`);
    if (vendor?.slug) revalidatePath(`/vendor/${vendor.slug}`);
    return;
  }
  const brand = await prisma.brand.findUnique({
    where: { id: owner.brandId },
    select: { slug: true },
  });
  if (brand?.slug) revalidatePath(`/brand/${brand.slug}`);
}
