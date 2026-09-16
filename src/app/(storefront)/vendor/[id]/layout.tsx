import { prisma } from '@/lib/prisma';
import { catalogShareMetadata } from '@/lib/share-cards/pageMetadata';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await prisma.vendor.findFirst({
    where: { id, isActive: true },
    select: { displayName: true, businessName: true, description: true },
  });
  const title = vendor?.displayName || vendor?.businessName || 'Horeca1';
  const description =
    vendor?.description?.slice(0, 160) || `Order from ${title} on Horeca1`;
  return catalogShareMetadata({
    title,
    description,
    path: `/vendor/${id}`,
    ogPath: `/api/og/vendor/${id}?format=square`,
  });
}

export default function VendorShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
