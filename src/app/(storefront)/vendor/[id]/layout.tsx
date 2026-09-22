import { productShareMetadata, vendorShareMetadata } from '@/lib/share-cards/pageMetadata';

/**
 * Product share links land on this store with `?product=`.
 * Pages also set that metadata; this layout covers the same query when the
 * framework supplies searchParams here.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ product?: string | string[] }>;
}) {
  const { id } = await params;
  try {
    let productId = '';
    if (searchParams) {
      const sp = await searchParams;
      const raw = sp?.product;
      productId = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
    }
    if (productId) return await productShareMetadata(productId, id);
    return await vendorShareMetadata(id);
  } catch {
    return { title: 'Horeca1' };
  }
}

export default function VendorShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
