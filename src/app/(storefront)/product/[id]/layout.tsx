import { prisma } from '@/lib/prisma';
import { catalogShareMetadata } from '@/lib/share-cards/pageMetadata';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, isActive: true, approvalStatus: 'approved', archivedAt: null },
    select: { name: true, description: true },
  });
  const title = product?.name || 'Horeca1';
  const description =
    product?.description?.slice(0, 160) || `Shop ${title} on Horeca1`;
  return catalogShareMetadata({
    title,
    description,
    path: `/product/${id}`,
    ogPath: `/api/og/product/${id}?format=square`,
  });
}

export default function ProductShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
