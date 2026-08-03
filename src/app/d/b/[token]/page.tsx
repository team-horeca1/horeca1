import type { Metadata } from 'next';
import DeliveryBoyPortalList from '@/components/features/delivery/DeliveryBoyPortalList';

export const metadata: Metadata = {
  title: 'Delivery runs · HoReCa Hub',
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function DeliveryBoyPortalPage({ params }: PageProps) {
  const { token } = await params;
  return <DeliveryBoyPortalList token={token} />;
}
