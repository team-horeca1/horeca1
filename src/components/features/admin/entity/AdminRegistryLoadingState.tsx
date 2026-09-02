'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface AdminRegistryLoadingStateProps {
  message?: string;
}

export function AdminRegistryLoadingState({ message = 'Loading registry...' }: AdminRegistryLoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 bg-white rounded-[16px] border border-divider shadow-sm py-16 lg:py-24">
      <Loader2 className="animate-spin text-primary" size={40} />
      <span className="text-[13px] font-bold text-[#6B7280]">{message}</span>
    </div>
  );
}
