import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { vendorProductHref } from '@/lib/share-cards/types';

/** Old product URLs open the supplier catalog card instead of a standalone page. */
export default async function ProductRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id },
    select: { vendorId: true },
  });
  if (!product?.vendorId) notFound();
  redirect(vendorProductHref(product.vendorId, id));
}
