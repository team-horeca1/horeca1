import type { Metadata } from 'next';
import InviteLandingClient from '@/components/features/promo/InviteLandingClient';

export const metadata: Metadata = {
  title: 'You are invited · HoReCa Hub',
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  return <InviteLandingClient token={token} />;
}
