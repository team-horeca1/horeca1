// GET /api/v1/auth/session-stale — stale/revoked/valid probe for client refresh + forced logout
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { isSessionRevoked } from '@/lib/sessionStale';

export async function GET(_req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { success: true, data: { stale: false, revoked: false, valid: false } },
      { status: 401 },
    );
  }

  const [dbUser, revoked, staleRaw] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    }),
    isSessionRevoked(userId),
    redis.get(`session:stale:${userId}`).catch(() => null),
  ]);

  const valid = !!dbUser && dbUser.isActive && !revoked;
  if (!valid) {
    return NextResponse.json(
      { success: true, data: { stale: true, revoked: true, valid: false } },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { stale: !!staleRaw, revoked: false, valid: true },
  });
}
