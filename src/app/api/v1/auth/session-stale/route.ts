// GET /api/v1/auth/session-stale — lightweight stale-session probe for client refresh
import { NextResponse } from 'next/server';
import { withAuth } from '@/middleware/auth';
import { redis } from '@/lib/redis';

export const GET = withAuth(async (_req, ctx) => {
  const staleKey = `session:stale:${ctx.userId}`;
  const isStale = await redis.get(staleKey);
  return NextResponse.json({ success: true, data: { stale: !!isStale } });
});
