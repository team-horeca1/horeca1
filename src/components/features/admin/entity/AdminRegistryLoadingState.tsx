'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface AdminRegistryLoadingStateProps {
  message?: string;
}

export function AdminRegistryLoadingState({ message = 'Loading registry...' }: AdminRegistryLoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 bg-white rounded-[24px] border border-[#EEEEEE] shadow-sm py-24 m-8">
      <Loader2 className="animate-spin text-[#299E60]" size={40} />
      <span className="text-[13px] font-bold text-[#6B7280]">{message}</span>
    </div>
  );
}
