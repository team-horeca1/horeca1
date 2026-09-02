'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AccountOutletsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const from = searchParams.get('from');

  useEffect(() => {
    if (from === 'vendor') {
      router.replace('/vendor/account?tab=outlets');
      return;
    }
    router.replace(`/profile?open=outlets&accountId=${params.id}`);
  }, [from, params.id, router]);

  return (
    <div className="py-12 flex justify-center">
      <Loader2 className="animate-spin text-primary" />
    </div>
  );
}
