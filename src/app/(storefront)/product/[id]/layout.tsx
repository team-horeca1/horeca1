import { productShareMetadata } from '@/lib/share-cards/pageMetadata';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return productShareMetadata(id);
}

export default function ProductShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
