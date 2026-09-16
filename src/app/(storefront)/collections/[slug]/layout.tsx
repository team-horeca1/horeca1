import { prisma } from '@/lib/prisma';
import { catalogShareMetadata } from '@/lib/share-cards/pageMetadata';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await prisma.collection.findFirst({
    where: { slug, isActive: true },
    select: { name: true, description: true },
  });
  const title = collection?.name || 'Horeca1';
  const description =
    collection?.description?.slice(0, 160) || `Browse ${title} on Horeca1`;
  return catalogShareMetadata({
    title,
    description,
    path: `/collections/${slug}`,
    ogPath: `/api/og/collection/${encodeURIComponent(slug)}?format=square`,
  });
}

export default function CollectionShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
