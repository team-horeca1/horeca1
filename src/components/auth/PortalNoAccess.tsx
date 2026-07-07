'use client';

import { ShieldAlert } from 'lucide-react';

/** Shown when a portal user is authenticated but has zero permitted nav items. */
export function PortalNoAccess() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <ShieldAlert className="text-red-500" size={28} />
      </div>
      <h2 className="text-[18px] font-bold text-[#181725] mb-2">No access</h2>
      <p className="text-[13px] text-[#7C7C7C] max-w-md">
        Your account does not have permission to view any sections in this portal. Contact your team administrator if you need access.
      </p>
    </div>
  );
}
