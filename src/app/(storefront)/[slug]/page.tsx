import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import VendorStorePage from '../vendor/[id]/store-client';
import { BrandStore } from '@/components/features/brand/BrandStore';
import { resolvePublicSlug } from '@/lib/publicSlugResolve';
import {
  brandProductShareMetadata,
  brandShareMetadata,
  productShareMetadata,
  vendorShareMetadata,
} from '@/lib/share-cards/pageMetadata';

function LoadingStore() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-[14px] text-gray-500">Loading store...</p>
    </div>
  );
}

type SlugSearch = { sku?: string | string[]; product?: string | string[] };

function firstQuery(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() || '';
  return value?.trim() || '';
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SlugSearch>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const sku = firstQuery(sp.sku) || firstQuery(sp.product);
  try {
    const hit = await resolvePublicSlug(slug);
    if (!hit) return { title: 'Horeca1' };
    if (hit.kind === 'brand') {
      if (sku) return await brandProductShareMetadata(hit.slug, sku);
      return await brandShareMetadata(hit.slug);
    }
    if (hit.kind === 'product') {
      return await productShareMetadata(hit.id, hit.vendorSlug || hit.vendorId);
    }
    return await vendorShareMetadata(hit.slug);
  } catch {
    return { title: 'Horeca1' };
  }
}

export default async function PublicSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SlugSearch>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const initialSkuId = firstQuery(sp.sku) || firstQuery(sp.product);
  const hit = await resolvePublicSlug(slug);
  if (!hit) notFound();

  if (hit.kind === 'brand') {
    return <BrandStore brandId={hit.slug} initialSkuId={initialSkuId} />;
  }

  if (hit.kind === 'product') {
    return (
      <Suspense fallback={<LoadingStore />}>
        <VendorStorePage
          forcedVendorKey={hit.vendorSlug || hit.vendorId}
          forcedProductId={hit.id}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingStore />}>
      <VendorStorePage forcedVendorKey={hit.slug} />
    </Suspense>
  );
}
