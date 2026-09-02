'use client';
import { CDL } from '@/lib/cdl';

import { Bell, BellOff, Loader2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useStableSession } from '@/hooks/useStableSession';

export function PushBell() {
  const { isAuthenticated } = useStableSession();
  const { permission, subscribed, loading, subscribe, unsubscribe } = usePushNotifications();

  // Only show for logged-in users on supported browsers
  if (!isAuthenticated || permission === 'unsupported') return null;

  if (loading) {
    return (
      <button className="relative p-2 rounded-full hover:bg-gray-50 transition-colors" disabled>
        <Loader2 size={20} className="animate-spin text-[#AEAEAE]" />
      </button>
    );
  }

  if (subscribed) {
    return (
      <button
        onClick={unsubscribe}
        title="Disable push notifications"
        className="relative p-2 rounded-full hover:bg-gray-50 transition-colors"
      >
        <Bell size={20} className="text-primary" fill={CDL.primary} />
      </button>
    );
  }

  if (permission === 'denied') return null;

  return (
    <button
      onClick={subscribe}
      title="Enable push notifications"
      className="relative p-2 rounded-full hover:bg-gray-50 transition-colors"
    >
      <BellOff size={20} className="text-[#AEAEAE]" />
    </button>
  );
}
