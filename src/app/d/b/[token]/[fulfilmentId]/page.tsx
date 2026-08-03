import type { Metadata } from 'next';
import DeliveryLinkClient from '@/components/features/delivery/DeliveryLinkClient';

export const metadata: Metadata = {
  title: 'Delivery order · HoReCa Hub',
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string; fulfilmentId: string }>;
};

export default async function DeliveryBoyOrderPage({ params }: PageProps) {
  const { token, fulfilmentId } = await params;
  return <DeliveryLinkClient token={token} fulfilmentId={fulfilmentId} />;
}
