import type { Metadata } from 'next';
import PayoutClaimClient from '@/components/features/promo/PayoutClaimClient';

export const metadata: Metadata = {
  title: 'Claim payout · HoReCa Hub',
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function PayoutPage({ params }: PageProps) {
  const { token } = await params;
  return <PayoutClaimClient token={token} />;
}
