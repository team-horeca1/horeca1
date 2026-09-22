import { notFound, redirect } from 'next/navigation';
import { resolveProductVendorId } from '@/lib/share-cards/pageMetadata';
import { vendorProductHref } from '@/lib/share-cards/types';

/** Old product URLs open the supplier catalog card instead of a standalone page. */
export default async function ProductRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vendorId = await resolveProductVendorId(id);
  if (!vendorId) notFound();
  redirect(vendorProductHref(vendorId, id));
}
