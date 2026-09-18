import { vendorShareMetadata } from '@/lib/share-cards/pageMetadata';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return await vendorShareMetadata(id);
  } catch {
    // Never let OG metadata crash the storefront page (e.g. bad id shape).
    return { title: 'Horeca1' };
  }
}

export default function VendorShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
