import { cookies } from 'next/headers';
import { Suspense } from 'react';
import VendorRegisterClient from './VendorRegisterClient';
import { AFFILIATE_REFERRAL_COOKIE, cleanReferral } from '@/lib/affiliateReferral';

export default async function VendorRegisterPage() {
  const raw = (await cookies()).get(AFFILIATE_REFERRAL_COOKIE)?.value;
  const initialReferralCode = cleanReferral(raw) ?? '';
  return (
    <Suspense fallback={null}>
      <VendorRegisterClient initialReferralCode={initialReferralCode} />
    </Suspense>
  );
}
