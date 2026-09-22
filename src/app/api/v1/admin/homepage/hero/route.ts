// GET   /api/v1/admin/homepage/hero — read CMS row
// PATCH /api/v1/admin/homepage/hero — update images + copy

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { requirePermission } from '@/lib/permissions/engine';
import { errorResponse } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import {
  ensureHomepageHero,
  getHomepageHeroDto,
} from '@/modules/homepage/homepage-hero.service';

const optionalUrl = z
  .union([z.string().max(1024), z.literal(''), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    return v.trim();
  });

const patchSchema = z.object({
  desktopImageUrl: optionalUrl,
  mobileImageUrl: optionalUrl,
  eyebrow: z.string().min(1).max(255).optional(),
  headline: z.string().min(1).max(500).optional(),
  ctaLabel: z.string().min(1).max(120).optional(),
  ctaHref: z.string().min(1).max(500).optional(),
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
    } = {};

    if (body.desktopImageUrl !== undefined) data.desktopImageUrl = body.desktopImageUrl;
    if (body.mobileImageUrl !== undefined) data.mobileImageUrl = body.mobileImageUrl;
    if (body.eyebrow !== undefined) data.eyebrow = body.eyebrow.trim();
    if (body.headline !== undefined) data.headline = body.headline.trim();
    if (body.ctaLabel !== undefined) data.ctaLabel = body.ctaLabel.trim();
    if (body.ctaHref !== undefined) data.ctaHref = body.ctaHref.trim();

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
      },
      after: {
        desktopImageUrl: updated.desktopImageUrl,
        mobileImageUrl: updated.mobileImageUrl,
        eyebrow: updated.eyebrow,
        headline: updated.headline,
        ctaLabel: updated.ctaLabel,
        ctaHref: updated.ctaHref,
      },
    });

    const dto = await getHomepageHeroDto();
    return NextResponse.json({ success: true, data: dto });
  } catch (error) {
    return errorResponse(error);
  }
});
