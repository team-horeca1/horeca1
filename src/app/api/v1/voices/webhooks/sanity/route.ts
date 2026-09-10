import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { generateVoiceShareCards, voicesSiteOrigin } from '@/modules/voices/voice.shareCards';

export const runtime = 'nodejs';

function parseSignature(header: string) {
  const parts: Record<string, string> = {};
  for (const piece of header.split(',')) {
    const eq = piece.indexOf('=');
    if (eq === -1) continue;
    parts[piece.slice(0, eq).trim()] = piece.slice(eq + 1).trim();
  }
  return parts;
}

function hmacValid(rawBody: string, signatureHeader: string, secret: string) {
  const { t, v1 } = parseSignature(signatureHeader);
  if (!t || !v1) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  return timingSafeEqual(a, b);
}

function authorized(req: Request, rawBody: string) {
  const secret = process.env.SANITY_WEBHOOK_SECRET;
  if (!secret) return false;

  const sig =
    req.headers.get('sanity-webhook-signature') ||
    req.headers.get('x-sanity-signature') ||
    '';
  if (sig && hmacValid(rawBody, sig, secret)) return true;

  const header = req.headers.get('authorization') || req.headers.get('x-sanity-webhook-secret') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : header;
  const query = new URL(req.url).searchParams.get('secret');
  return bearer === secret || query === secret;
}

function documentFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload._type === 'voiceStory') return payload;
  const nested = payload.value;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const doc = nested as Record<string, unknown>;
    if (doc._type === 'voiceStory') return doc;
  }
  return payload;
}

function slugFromPayload(payload: Record<string, unknown>): string | null {
  const slug = payload.slug;
  if (typeof slug === 'string' && slug) return slug;
  if (slug && typeof slug === 'object' && 'current' in slug) {
    const current = (slug as { current?: unknown }).current;
    if (typeof current === 'string') return current;
  }
  return null;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!authorized(req, rawBody)) {
    return NextResponse.json({ success: false, error: { message: 'Unauthorized' } }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: { message: 'Invalid JSON' } }, { status: 400 });
  }

  const doc = documentFromPayload(payload);
  const type = doc._type;
  if (type !== 'voiceStory') {
    return NextResponse.json({ success: true, skipped: true });
  }
  if (doc.published !== true) {
    return NextResponse.json({ success: true, skipped: true });
  }

  const slug = slugFromPayload(doc);
  const rawId = typeof doc._id === 'string' ? doc._id : null;
  const id = rawId ? rawId.replace(/^drafts\./, '') : null;
  if (!slug || !id) {
    return NextResponse.json({ success: false, error: { message: 'Missing slug' } }, { status: 400 });
  }

  try {
    const publishedAt = typeof doc.publishedAt === 'string' ? doc.publishedAt : null;
    const data = await generateVoiceShareCards({
      slug,
      id,
      origin: voicesSiteOrigin(req),
      publishedAt,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to render share cards';
    const status = message === 'Write token missing' ? 503 : 502;
    return NextResponse.json({ success: false, error: { message } }, { status });
  }
}
