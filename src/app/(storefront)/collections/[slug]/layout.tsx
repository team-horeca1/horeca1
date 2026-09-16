import { collectionShareMetadata } from '@/lib/share-cards/pageMetadata';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return collectionShareMetadata(slug);
}

export default function CollectionShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
