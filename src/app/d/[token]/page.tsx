import type { Metadata } from 'next';
import DeliveryLinkClient from '@/components/features/delivery/DeliveryLinkClient';

export const metadata: Metadata = {
  title: 'Delivery · HoReCa Hub',
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function DeliveryLinkPage({ params }: PageProps) {
  const { token } = await params;
  return <DeliveryLinkClient token={token} />;
}
