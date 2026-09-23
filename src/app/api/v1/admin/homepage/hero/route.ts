// GET   /api/v1/admin/homepage/hero — read CMS row
// PATCH /api/v1/admin/homepage/hero — update images + copy

import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import {
  HERO_ALIGN_X,
  HERO_ALIGN_Y,
  HERO_POS_MAX,
  HERO_POS_MIN,
  clampHeroPos,
  isSafeHeroHref,
  isSafeHeroImageUrl,
  trimHeroCopy,
} from '@/modules/homepage/homepage-hero.constants';
import {
  ensureHomepageHero,
  getHomepageHeroDto,
} from '@/modules/homepage/homepage-hero.service';

const optionalImageUrl = z
  .union([z.string().max(1024), z.literal(''), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v.trim() === '') return null;
    return v.trim();
  })
  .refine((v) => v == null || isSafeHeroImageUrl(v), {
    message: 'Use a site path or an https image URL',
  });

const offsetSchema = z
  .number()
  .int()
  .min(HERO_POS_MIN)
  .max(HERO_POS_MAX)
  .optional()
  .transform((v) => (v === undefined ? undefined : clampHeroPos(v)));

const patchSchema = z.object({
  desktopImageUrl: optionalImageUrl,
  mobileImageUrl: optionalImageUrl,
  eyebrow: z.string().max(255).transform(trimHeroCopy).optional(),
  headline: z.string().max(500).transform(trimHeroCopy).optional(),
  ctaLabel: z.string().trim().max(120).optional(),
  ctaHref: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === '' || isSafeHeroHref(value), {
      message: 'Use a site path or an http(s) URL',
    })
    .optional(),
  showText: z.boolean().optional(),
  showCta: z.boolean().optional(),
  copyAlignX: z.enum(HERO_ALIGN_X).optional(),
  copyAlignY: z.enum(HERO_ALIGN_Y).optional(),
  copyOffsetX: offsetSchema,
  copyOffsetY: offsetSchema,
  showTextMobile: z.boolean().optional(),
  showCtaMobile: z.boolean().optional(),
  copyAlignXMobile: z.enum(HERO_ALIGN_X).optional(),
  copyAlignYMobile: z.enum(HERO_ALIGN_Y).optional(),
  copyOffsetXMobile: offsetSchema,
  copyOffsetYMobile: offsetSchema,
});

type HeroPatchData = {
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
};

function snapshotHero(row: {
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
}) {
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
  };
}

export const GET = adminOnly(async (_req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.view');
    const data = await getHomepageHeroDto();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'settings.edit');
    const body = patchSchema.parse(await req.json());
    const existing = await ensureHomepageHero();

    const data: HeroPatchData = {};
    if (body.desktopImageUrl !== undefined) data.desktopImageUrl = body.desktopImageUrl;
    if (body.mobileImageUrl !== undefined) data.mobileImageUrl = body.mobileImageUrl;
    if (body.eyebrow !== undefined) data.eyebrow = body.eyebrow;
    if (body.headline !== undefined) data.headline = body.headline;
    if (body.ctaLabel !== undefined) data.ctaLabel = body.ctaLabel;
    if (body.ctaHref !== undefined) data.ctaHref = body.ctaHref;
    if (body.showText !== undefined) data.showText = body.showText;
    if (body.showCta !== undefined) data.showCta = body.showCta;
    if (body.copyAlignX !== undefined) data.copyAlignX = body.copyAlignX;
    if (body.copyAlignY !== undefined) data.copyAlignY = body.copyAlignY;
    if (body.copyOffsetX !== undefined) data.copyOffsetX = body.copyOffsetX;
    if (body.copyOffsetY !== undefined) data.copyOffsetY = body.copyOffsetY;
    if (body.showTextMobile !== undefined) data.showTextMobile = body.showTextMobile;
    if (body.showCtaMobile !== undefined) data.showCtaMobile = body.showCtaMobile;
    if (body.copyAlignXMobile !== undefined) data.copyAlignXMobile = body.copyAlignXMobile;
    if (body.copyAlignYMobile !== undefined) data.copyAlignYMobile = body.copyAlignYMobile;
    if (body.copyOffsetXMobile !== undefined) data.copyOffsetXMobile = body.copyOffsetXMobile;
    if (body.copyOffsetYMobile !== undefined) data.copyOffsetYMobile = body.copyOffsetYMobile;

    const updated = await prisma.homepageHero.update({
      where: { id: existing.id },
      data,
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.homepageHeroUpdate,
      entity: 'HomepageHero',
      entityId: updated.id,
      before: snapshotHero(existing),
      after: snapshotHero(updated),
    });

    revalidatePath('/');

    const dto = await getHomepageHeroDto();
    return NextResponse.json({ success: true, data: dto });
  } catch (error) {
    return errorResponse(error);
  }
});
