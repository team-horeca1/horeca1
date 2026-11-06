import { brandShareMetadata } from '@/lib/share-cards/pageMetadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  return brandShareMetadata(brandId);
}

export default function BrandShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
