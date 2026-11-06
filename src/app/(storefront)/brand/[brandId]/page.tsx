import { BrandStore } from '@/components/features/brand/BrandStore';
import { brandProductShareMetadata, brandShareMetadata } from '@/lib/share-cards/pageMetadata';

type BrandSearch = { sku?: string | string[]; product?: string | string[]; cat?: string | string[] };

function firstQuery(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() || '';
  return value?.trim() || '';
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<BrandSearch>;
}) {
  const { brandId } = await params;
  const sp = await searchParams;
  const sku = firstQuery(sp.sku) || firstQuery(sp.product);
  if (sku) return brandProductShareMetadata(brandId, sku);
  return brandShareMetadata(brandId);
}

export default async function BrandStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<BrandSearch>;
}) {
  const { brandId } = await params;
  const sp = await searchParams;
  const initialCatSlug = firstQuery(sp.cat);
  const initialSkuId = firstQuery(sp.sku) || firstQuery(sp.product);
  return (
    <BrandStore
      brandId={brandId}
      initialCatSlug={initialCatSlug}
      initialSkuId={initialSkuId}
    />
  );
}
