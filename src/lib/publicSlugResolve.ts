import 'server-only';
import { prisma } from '@/lib/prisma';
import { isPublicSlug } from '@/lib/publicSlug';

export type PublicSlugHit =
  | { kind: 'vendor'; id: string; slug: string }
  | { kind: 'brand'; slug: string }
  | { kind: 'product'; id: string; vendorId: string; vendorSlug: string | null };

/**
 * One short name can only open one page.
 * A supplier store wins over a brand or product with the same slug.
 * When two products still share a slug, the older listing keeps it.
 * /brand/:slug and /vendor/:id still open those pages when the short name is taken.
 */
export async function resolvePublicSlug(raw: string): Promise<PublicSlugHit | null> {
  const slug = raw.trim().toLowerCase();
  if (!isPublicSlug(slug)) return null;

  const vendor = await prisma.vendor.findFirst({
    where: { slug: { equals: slug, mode: 'insensitive' }, isActive: true },
    select: { id: true, slug: true },
  });
  if (vendor?.slug) return { kind: 'vendor', id: vendor.id, slug: vendor.slug };

  const brand = await prisma.brand.findFirst({
    where: { slug: { equals: slug, mode: 'insensitive' }, isActive: true, approvalStatus: 'approved' },
    select: { slug: true },
  });
  if (brand?.slug) return { kind: 'brand', slug: brand.slug };

  const product = await prisma.product.findFirst({
    where: {
      slug: { equals: slug, mode: 'insensitive' },
      isActive: true,
      approvalStatus: 'approved',
      archivedAt: null,
      vendor: { isActive: true },
    },
    // Oldest listing keeps a shared slug. updatedAt would move the public
    // link to whichever store edited the product last.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      vendorId: true,
      vendor: { select: { slug: true } },
    },
  });
  if (!product?.vendorId) return null;
  return {
    kind: 'product',
    id: product.id,
    vendorId: product.vendorId,
    vendorSlug: product.vendor?.slug ?? null,
  };
}
