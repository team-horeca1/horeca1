import type { Metadata } from 'next';
import ReturnPickupLinkClient from '@/components/features/return/ReturnPickupLinkClient';

export const metadata: Metadata = {
  title: 'Return pickup · HoReCa Hub',
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function ReturnPickupLinkPage({ params }: PageProps) {
  const { token } = await params;
  return <ReturnPickupLinkClient token={token} />;
}
