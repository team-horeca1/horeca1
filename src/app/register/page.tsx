import { cookies } from 'next/headers';
import { Suspense } from 'react';
import RegisterPageInner from './RegisterPageInner';
import { AFFILIATE_REFERRAL_COOKIE, cleanReferral } from '@/lib/affiliateReferral';

export default async function RegisterPage() {
  const raw = (await cookies()).get(AFFILIATE_REFERRAL_COOKIE)?.value;
  const initialReferralCode = cleanReferral(raw) ?? '';
  return (
    <Suspense fallback={null}>
      <RegisterPageInner initialReferralCode={initialReferralCode} />
    </Suspense>
  );
}
