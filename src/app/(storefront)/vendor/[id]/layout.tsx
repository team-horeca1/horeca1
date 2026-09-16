import { vendorShareMetadata } from '@/lib/share-cards/pageMetadata';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return vendorShareMetadata(id);
}

export default function VendorShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
