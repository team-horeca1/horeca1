import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWriteClient } from '@/sanity/lib/writeClient';
import { checkRateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils';

const Body = z.object({
  nomineeName: z.string().trim().min(2).max(120),
  category: z.enum(['chef', 'consultant', 'vendor', 'owner']),
  contact: z.string().trim().min(5).max(120),
  reason: z.string().trim().min(10).max(2000),
  nominatorName: z.string().trim().max(120).optional(),
  relationship: z.string().trim().max(120).optional(),
});

export async function POST(req: NextRequest) {
  const { allowed } = await checkRateLimit(`voice-nom:${getClientIp(req)}`, 5, 10 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: 'Too many nominations. Try again later.' } },
      { status: 429 },
    );
  }

  const write = getWriteClient();
  if (!write) {
    return NextResponse.json(
      { success: false, error: { message: 'Nominations are not configured yet.' } },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: { message: 'Invalid JSON' } }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { message: 'Please fill the required fields.' } },
      { status: 400 },
    );
  }

  const d = parsed.data;
  await write.create({
    _type: 'voiceNomination',
    nomineeName: d.nomineeName,
    category: d.category,
    contact: d.contact,
    reason: d.reason,
    nominatorName: d.nominatorName || undefined,
    relationship: d.relationship || undefined,
    status: 'new',
  });

  return NextResponse.json({ success: true });
}
