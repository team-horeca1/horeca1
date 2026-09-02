'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AccountRolesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('from') === 'vendor') {
      router.replace('/vendor/account?tab=team');
      return;
    }
    router.replace('/profile?open=roles');
  }, [searchParams, router]);

  return (
    <div className="py-12 flex justify-center">
      <Loader2 className="animate-spin text-primary" />
    </div>
  );
}
