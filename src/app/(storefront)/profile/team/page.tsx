'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { TeamPanel } from '@/components/features/team/TeamPanel';

export default function AccountTeamPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      }
    >
      <TeamPanel scope="account" pageShell blockWhenNoAccess />
    </Suspense>
  );
}
