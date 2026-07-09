// GET    /api/v1/vendor/customer-tasks?customerId=UUID  — list tasks for a customer (vendor-scoped)
// POST   /api/v1/vendor/customer-tasks                  — create a task
// PATCH  /api/v1/vendor/customer-tasks?id=UUID          — update / toggle isDone
// DELETE /api/v1/vendor/customer-tasks?id=UUID          — delete a task
// PROTECTED: Vendor only

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { vendorOnly } from '@/middleware/rbac';
import { Errors, errorResponse } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { resolveVendorId } from '@/lib/resolveVendorId';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1).max(255),
  notes: z.string().max(4000).nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  notes: z.string().max(4000).nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  isDone: z.boolean().optional(),
});

// ─── GET — list tasks for a customer ─────────────────────────────────────────

export const GET = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.view');
    const vendorId = await resolveVendorId(ctx, req);
    const url = new URL(req.url);
    const customerId = url.searchParams.get('customerId');
    if (!customerId) throw Errors.badRequest('customerId is required');

    const tasks = await prisma.vendorCustomerTask.findMany({
      where: { vendorId, customerId },
      orderBy: [{ isDone: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    return errorResponse(error);
  }
});

// ─── POST — create a task ─────────────────────────────────────────────────────

export const POST = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.create');
    const vendorId = await resolveVendorId(ctx, req);
    const body = createSchema.parse(await req.json());

    const task = await prisma.vendorCustomerTask.create({
      data: {
        vendorId,
        customerId: body.customerId,
        title: body.title,
        notes: body.notes ?? null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

// ─── PATCH — update / toggle isDone ──────────────────────────────────────────

export const PATCH = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.edit');
    const vendorId = await resolveVendorId(ctx, req);
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) throw Errors.badRequest('id is required');

    const body = patchSchema.parse(await req.json());

    const existing = await prisma.vendorCustomerTask.findFirst({ where: { id, vendorId } });
    if (!existing) throw Errors.notFound('Task');

    const task = await prisma.vendorCustomerTask.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
        ...(body.isDone !== undefined && { isDone: body.isDone }),
      },
    });

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    return errorResponse(error);
  }
});

// ─── DELETE — remove a task ───────────────────────────────────────────────────

export const DELETE = vendorOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.delete');
    const vendorId = await resolveVendorId(ctx, req);
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) throw Errors.badRequest('id is required');

    const existing = await prisma.vendorCustomerTask.findFirst({ where: { id, vendorId } });
    if (!existing) throw Errors.notFound('Task');

    await prisma.vendorCustomerTask.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
