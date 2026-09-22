import { Suspense } from 'react';
import VendorStorePage from './store-client';
import { productShareMetadata } from '@/lib/share-cards/pageMetadata';

async function productQuery(
  searchParams: Promise<{ product?: string | string[] }>,
): Promise<string> {
  const sp = await searchParams;
  const raw = sp?.product;
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  const { id } = await params;
  try {
    const productId = await productQuery(searchParams);
    // Layout owns the supplier preview. This page only overrides it for ?product=.
    if (!productId) return {};
    return await productShareMetadata(productId, id);
  } catch {
    return {};
  }
}

export default function VendorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-[14px] text-gray-500">Loading store...</p>
        </div>
      }
    >
      <VendorStorePage />
    </Suspense>
  );
}
