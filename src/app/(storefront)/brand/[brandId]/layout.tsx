import { prisma } from '@/lib/prisma';
import { catalogShareMetadata } from '@/lib/share-cards/pageMetadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await prisma.brand.findFirst({
    where: { slug: brandId, isActive: true, approvalStatus: 'approved' },
    select: { name: true, description: true },
  });
  const title = brand?.name || 'Horeca1';
  const description =
    brand?.description?.slice(0, 160) || `Find ${title} on Horeca1`;
  return catalogShareMetadata({
    title,
    description,
    path: `/brand/${brandId}`,
    ogPath: `/api/og/brand/${encodeURIComponent(brandId)}?format=square`,
  });
}

export default function BrandShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
