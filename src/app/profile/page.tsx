'use client';

import React, { Suspense } from 'react';
import { ProfileScreen } from '@/components/auth/ProfileScreen';
import { AdminCustomerImpersonationBanner } from '@/components/features/admin/AdminCustomerImpersonationBanner';
import { useRouter, useSearchParams } from 'next/navigation';

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from');

  const onClose = () => {
    if (from === 'vendor') router.push('/vendor/dashboard');
    else if (from === 'brand') router.push('/brand/portal');
    else router.push('/');
  };

  return (
    <main className="min-h-screen bg-[#F2F3F2]">
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <AdminCustomerImpersonationBanner />
      </div>
      <ProfileScreen isOpen={true} onClose={onClose} />
    </main>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#F2F3F2]" />}>
      <ProfilePageContent />
    </Suspense>
  );
}
