import { cookies } from 'next/headers';
import { Suspense } from 'react';
import BrandRegisterClient from './BrandRegisterClient';
import { AFFILIATE_REFERRAL_COOKIE, cleanReferral } from '@/lib/affiliateReferral';

export default async function BrandRegisterPage() {
  const raw = (await cookies()).get(AFFILIATE_REFERRAL_COOKIE)?.value;
  const initialReferralCode = cleanReferral(raw) ?? '';
  return (
    <Suspense fallback={null}>
      <BrandRegisterClient initialReferralCode={initialReferralCode} />
    </Suspense>
  );
}
