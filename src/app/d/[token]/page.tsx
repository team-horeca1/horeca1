import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import DeliveryLinkClient from '@/components/features/delivery/DeliveryLinkClient';
import { deliveryLinkService } from '@/modules/fulfillment/delivery-link.service';

export const metadata: Metadata = {
  title: 'Delivery · HoReCa Hub',
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

/** Legacy per-order link — prefer boy portal when a resource portal exists. */
export default async function DeliveryLinkPage({ params }: PageProps) {
  const { token } = await params;
  try {
    const boy = await deliveryLinkService.resolveLegacyToBoyPortal(token);
    if (boy) redirect(boy.boyPath);
  } catch {
    /* fall through to single-order view */
  }
  return <DeliveryLinkClient token={token} />;
}
