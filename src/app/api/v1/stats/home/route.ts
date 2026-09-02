import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

const CACHE_KEY = 'horeca1:stats:home';
const CACHE_TTL_SEC = 60;

const TERMINAL_STATUSES = ['cancelled', 'draft'] as const;

async function computeStats() {
  const [qtyAgg, customerCount] = await Promise.all([
    prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: {
        order: {
          status: { notIn: [...TERMINAL_STATUSES] },
        },
      },
    }),
    prisma.user.count({
      where: {
        role: 'customer',
        orders: { some: { status: { notIn: [...TERMINAL_STATUSES] } } },
      },
    }),
  ]);

  return {
    productsSold: qtyAgg._sum.quantity ?? 0,
    customers: customerCount,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return NextResponse.json({ success: true, data: JSON.parse(cached) });
    }

    const stats = await computeStats();
    await redis.set(CACHE_KEY, JSON.stringify(stats), 'EX', CACHE_TTL_SEC);
    return NextResponse.json({ success: true, data: stats });
  } catch {
    const stats = await computeStats();
    return NextResponse.json({ success: true, data: stats });
  }
}
