'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { VendorOutletsManager } from '@/components/features/vendor/VendorOutletsManager';

export default function VendorOutletsPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-[#299E60]" size={28} />
        </div>
      )}
    >
      <VendorOutletsManager />
    </Suspense>
  );
}
