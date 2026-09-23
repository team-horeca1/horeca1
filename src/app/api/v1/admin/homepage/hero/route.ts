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
  isSafeHeroHref,
  isSafeHeroImageUrl,
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

const patchSchema = z.object({
  desktopImageUrl: optionalImageUrl,
  mobileImageUrl: optionalImageUrl,
  eyebrow: z.string().trim().max(255).optional(),
  headline: z.string().trim().max(500).optional(),
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
});

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

    const data: {
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
    } = {};

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

    const updated = await prisma.homepageHero.update({
      where: { id: existing.id },
      data,
    });

    logAction(ctx, req, {
      action: AUDIT_ACTIONS.homepageHeroUpdate,
      entity: 'HomepageHero',
      entityId: updated.id,
      before: {
        desktopImageUrl: existing.desktopImageUrl,
        mobileImageUrl: existing.mobileImageUrl,
        eyebrow: existing.eyebrow,
        headline: existing.headline,
        ctaLabel: existing.ctaLabel,
        ctaHref: existing.ctaHref,
        showText: existing.showText,
        showCta: existing.showCta,
        copyAlignX: existing.copyAlignX,
        copyAlignY: existing.copyAlignY,
      },
      after: {
        desktopImageUrl: updated.desktopImageUrl,
        mobileImageUrl: updated.mobileImageUrl,
        eyebrow: updated.eyebrow,
        headline: updated.headline,
        ctaLabel: updated.ctaLabel,
        ctaHref: updated.ctaHref,
        showText: updated.showText,
        showCta: updated.showCta,
        copyAlignX: updated.copyAlignX,
        copyAlignY: updated.copyAlignY,
      },
    });

    revalidatePath('/');

    const dto = await getHomepageHeroDto();
    return NextResponse.json({ success: true, data: dto });
  } catch (error) {
    return errorResponse(error);
  }
});
