import 'server-only';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { shareSiteOrigin } from '@/lib/share-cards/ogHelpers';
import { vendorProductHref } from '@/lib/share-cards/types';

export function catalogShareMetadata(opts: {
  title: string;
  description: string;
  path: string;
  ogPath: string;
}): Metadata {
  const origin = shareSiteOrigin();
  const url = `${origin}${opts.path.startsWith('/') ? opts.path : `/${opts.path}`}`;
  const image = opts.ogPath.startsWith('http')
    ? opts.ogPath
    : `${origin}${opts.ogPath.startsWith('/') ? opts.ogPath : `/${opts.ogPath}`}`;

  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      type: 'website',
      images: [
        {
          url: image,
          width: 1080,
          height: 1080,
          alt: opts.title,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
      images: [image],
    },
  };
}

function clip(text: string | null | undefined, fallback: string): string {
  const trimmed = text?.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 160 ? `${trimmed.slice(0, 159).trimEnd()}…` : trimmed;
}

/** Resolve vendorId for legacy `/product/[id]` → vendor catalog redirects. */
export async function resolveProductVendorId(id: string): Promise<string | null> {
  const product = await prisma.product.findFirst({
    where: { id },
    select: { vendorId: true },
  });
  return product?.vendorId ?? null;
}

export async function productShareMetadata(id: string, routeVendorId?: string): Promise<Metadata> {
  const product = await prisma.product.findFirst({
    where: { id, isActive: true, approvalStatus: 'approved', archivedAt: null },
    select: {
      name: true,
      description: true,
      vendorId: true,
      vendor: { select: { id: true, slug: true } },
    },
  });
  const vendor = product?.vendor;
  if (!product || !vendor?.id) {
    if (routeVendorId) return vendorShareMetadata(routeVendorId);
    return { title: 'Horeca1' };
  }
  if (routeVendorId) {
    const route = routeVendorId.trim();
    const matches = route === vendor.id || (vendor.slug != null && route === vendor.slug);
    if (!matches) return vendorShareMetadata(routeVendorId);
  }
  const title = product.name || 'Horeca1';
  return catalogShareMetadata({
    title,
    description: clip(product.description, `Shop ${title} on Horeca1`),
    path: vendorProductHref(vendor.slug || vendor.id, id),
    ogPath: `/api/og/product/${id}?format=square`,
  });
}

export async function vendorShareMetadata(idOrSlug: string): Promise<Metadata> {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const vendor = await prisma.vendor.findFirst({
    where: {
      isActive: true,
      ...(UUID_RE.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }),
    },
    select: { displayName: true, businessName: true, description: true, slug: true, id: true },
  });
  const title = vendor?.displayName || vendor?.businessName || 'Horeca1';
  const pathId = vendor?.slug || vendor?.id || idOrSlug;
  return catalogShareMetadata({
    title,
    description: clip(vendor?.description, `Order from ${title} on Horeca1`),
    path: `/vendor/${pathId}`,
    ogPath: `/api/og/vendor/${encodeURIComponent(pathId)}?format=square`,
  });
}

export async function brandShareMetadata(slug: string): Promise<Metadata> {
  const brand = await prisma.brand.findFirst({
    where: { slug, isActive: true, approvalStatus: 'approved' },
    select: { name: true, description: true },
  });
  const title = brand?.name || 'Horeca1';
  return catalogShareMetadata({
    title,
    description: clip(brand?.description, `Find ${title} on Horeca1`),
    path: `/brand/${slug}`,
    ogPath: `/api/og/brand/${encodeURIComponent(slug)}?format=square`,
  });
}

export async function collectionShareMetadata(slug: string): Promise<Metadata> {
  const collection = await prisma.collection.findFirst({
    where: { slug, isActive: true },
    select: { name: true, description: true },
  });
  const title = collection?.name || 'Horeca1';
  return catalogShareMetadata({
    title,
    description: clip(collection?.description, `Browse ${title} on Horeca1`),
    path: `/collections/${slug}`,
    ogPath: `/api/og/collection/${encodeURIComponent(slug)}?format=square`,
  });
}
