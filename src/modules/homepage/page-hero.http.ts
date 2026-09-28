import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLog';
import type { AuthContext } from '@/middleware/auth';
import { bodyToSlideInput, slideBodySchema } from '@/modules/homepage/homepage-hero.schema';
import {
  createPageHeroSlide,
  deletePageHeroSlide,
  getPageHeroSlideById,
  listPageHeroSlides,
  reorderPageHeroSlides,
  revalidatePageHero,
  snapshotHeroSlide,
  updatePageHeroSlide,
  type PageHeroOwner,
} from '@/modules/homepage/page-hero.service';

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

function slideIdFromPath(req: NextRequest): string {
  const id = req.nextUrl.pathname.split('/').at(-1);
  if (!id || id === 'hero' || id === 'reorder') throw Errors.badRequest('Missing slide id');
  return id;
}

type Handler = (req: NextRequest, ctx: AuthContext) => Promise<Response>;

export function pageHeroCollectionHandlers(resolveOwner: (req: NextRequest, ctx: AuthContext) => Promise<PageHeroOwner>): {
  GET: Handler;
  POST: Handler;
} {
  const GET: Handler = async (req, ctx) => {
    try {
      const owner = await resolveOwner(req, ctx);
      const slides = await listPageHeroSlides(owner);
      return NextResponse.json({ success: true, data: { slides } });
    } catch (error) {
      return errorResponse(error);
    }
  };

  const POST: Handler = async (req, ctx) => {
    try {
      const owner = await resolveOwner(req, ctx);
      const body = slideBodySchema.parse(await req.json().catch(() => ({})));
      const slide = await createPageHeroSlide(owner, bodyToSlideInput(body));
      logAction(ctx, req, {
        action: AUDIT_ACTIONS.pageHeroCreate,
        entity: 'PageHeroSlide',
        entityId: slide.id,
        after: snapshotHeroSlide(slide),
      });
      await revalidatePageHero(owner);
      return NextResponse.json({ success: true, data: slide }, { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  };

  return { GET, POST };
}

export function pageHeroItemHandlers(resolveOwner: (req: NextRequest, ctx: AuthContext) => Promise<PageHeroOwner>): {
  PATCH: Handler;
  DELETE: Handler;
} {
  const PATCH: Handler = async (req, ctx) => {
    try {
      const owner = await resolveOwner(req, ctx);
      const id = slideIdFromPath(req);
      const before = await getPageHeroSlideById(owner, id);
      const body = slideBodySchema.parse(await req.json());
      const slide = await updatePageHeroSlide(owner, id, bodyToSlideInput(body));
      logAction(ctx, req, {
        action: AUDIT_ACTIONS.pageHeroUpdate,
        entity: 'PageHeroSlide',
        entityId: slide.id,
        before: snapshotHeroSlide(before),
        after: snapshotHeroSlide(slide),
      });
      await revalidatePageHero(owner);
      return NextResponse.json({ success: true, data: slide });
    } catch (error) {
      return errorResponse(error);
    }
  };

  const DELETE: Handler = async (req, ctx) => {
    try {
      const owner = await resolveOwner(req, ctx);
      const id = slideIdFromPath(req);
      const before = await getPageHeroSlideById(owner, id);
      await deletePageHeroSlide(owner, id);
      logAction(ctx, req, {
        action: AUDIT_ACTIONS.pageHeroDelete,
        entity: 'PageHeroSlide',
        entityId: id,
        before: snapshotHeroSlide(before),
      });
      await revalidatePageHero(owner);
      return NextResponse.json({ success: true, data: { id } });
    } catch (error) {
      return errorResponse(error);
    }
  };

  return { PATCH, DELETE };
}

export function pageHeroReorderHandler(resolveOwner: (req: NextRequest, ctx: AuthContext) => Promise<PageHeroOwner>): Handler {
  return async (req, ctx) => {
    try {
      const owner = await resolveOwner(req, ctx);
      const { orderedIds } = reorderSchema.parse(await req.json());
      const slides = await reorderPageHeroSlides(owner, orderedIds);
      logAction(ctx, req, {
        action: AUDIT_ACTIONS.pageHeroReorder,
        entity: 'PageHeroSlide',
        after: { orderedIds },
      });
      await revalidatePageHero(owner);
      return NextResponse.json({ success: true, data: { slides } });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
