'use client';

/**
 * Generic in-app notification bell for the admin and brand portals.
 *
 * Uses the shared, per-user endpoints (scoped server-side by ctx.userId):
 *   GET  /api/v1/notifications?channel=in_app&limit=50
 *   POST /api/v1/notifications/read       { notificationId }
 *   POST /api/v1/notifications/read-all
 *
 * The vendor portal has its own VendorNotificationBell (extra filtering of
 * admin-only titles); this one is intentionally role-agnostic.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, BellOff, BellRing, Loader2, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CDL } from '@/lib/cdl';
import { IMPERSONATION_CHANGED_EVENT } from '@/lib/clearImpersonation';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useStableSession } from '@/hooks/useStableSession';

interface AppNotification {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  referenceId: string | null;
  referenceType: string | null;
}

function accent(title: string | null, type: string): string {
  const t = (title ?? type).toLowerCase();
  if (t.includes('reject') || t.includes('needs changes') || t.includes('not approved') || t.includes('failed')) {
    return 'bg-[#FFF0F0] text-[#E74C3C]';
  }
  if (t.includes('approv')) return 'bg-success-light text-success';
  if (t.includes('pending') || t.includes('suggest')) return 'bg-warning-light text-warning';
  if (t.includes('order')) return 'bg-info-light text-info';
  if (t.includes('payment') || t.includes('credit')) return 'bg-success-light text-success';
  return 'bg-[#F5F5F5] text-[#7C7C7C]';
}

function relativeTime(isoStr: string) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(isoStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function NotificationBell({ accentColor = CDL.primary }: { accentColor?: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [topOffset, setTopOffset] = useState<number>(56);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isAuthenticated } = useStableSession();
  const { permission, subscribed, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();
  const pushSupported = isAuthenticated && permission !== 'unsupported';

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const updatePosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTopOffset(Math.round(rect.bottom + 6));
    }
  }, []);

  const toggleOpen = () => {
    if (!open) {
      updatePosition();
    }
    setOpen((v) => !v);
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/notifications?channel=in_app&limit=50');
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data.notifications ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
    const onFocus = () => void fetchNotifications();
    const onImpersonation = () => void fetchNotifications();
    window.addEventListener('focus', onFocus);
    window.addEventListener(IMPERSONATION_CHANGED_EVENT, onImpersonation);
    const interval = window.setInterval(() => void fetchNotifications(), 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(IMPERSONATION_CHANGED_EVENT, onImpersonation);
      window.clearInterval(interval);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleReposition = () => updatePosition();

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, updatePosition]);

  const markRead = async (n: AppNotification) => {
    if (n.readAt) return;
    setNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item))
    );
    try {
      await fetch('/api/v1/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: n.id }),
      });
    } catch {
      /* non-blocking */
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((item) => (item.readAt ? item : { ...item, readAt: now })));
    try {
      await fetch('/api/v1/notifications/read-all', { method: 'POST' });
    } catch {
      /* non-blocking */
    }
  };

  const recent = notifications.slice(0, 8);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className="relative w-9 h-9 flex items-center justify-center hover:bg-ivory rounded-lg active:scale-[0.97] transition-all"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      >
        <Bell size={21} className="text-[#181725]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center border border-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Mobile backdrop so tapping anywhere outside closes the panel */}
          <div
            className="fixed inset-0 z-[10000] bg-black/20 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            style={{ '--mobile-dropdown-top': `${topOffset}px` } as React.CSSProperties}
            className={cn(
              "fixed inset-x-3 max-w-sm mx-auto top-[var(--mobile-dropdown-top,56px)] z-[10001] bg-white rounded-2xl border border-[#EEEEEE] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150",
              "sm:absolute sm:inset-x-auto sm:max-w-none sm:mx-0 sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] sm:rounded-[14px] sm:shadow-xl sm:z-[60]"
            )}
          >
            <div className="px-4 py-3 border-b border-[#EEEEEE] flex items-center justify-between">
              <p className="text-[14px] font-bold text-[#181725]">Notifications</p>
              <div className="flex items-center gap-2">
                {pushSupported && (
                  <button
                    type="button"
                    onClick={subscribed ? unsubscribe : subscribe}
                    disabled={pushLoading}
                    title={subscribed ? 'Push notifications enabled. Tap to turn off.' : 'Enable push notifications'}
                    className={cn(
                      'p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-medium',
                      subscribed
                        ? 'text-emerald-700 hover:bg-emerald-50'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    )}
                    aria-label={subscribed ? 'Disable push notifications' : 'Enable push notifications'}
                  >
                    {pushLoading ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : subscribed ? (
                      <>
                        <BellRing size={13} className="text-emerald-600" />
                        <span className="text-[10px] font-semibold text-emerald-600">Push on</span>
                      </>
                    ) : (
                      <>
                        <BellOff size={13} />
                        <span className="text-[10px]">Push off</span>
                      </>
                    )}
                  </button>
                )}
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="flex items-center gap-1 text-[11px] font-bold hover:underline"
                    style={{ color: accentColor }}
                  >
                    <CheckCheck size={13} /> Mark all read
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin" style={{ color: accentColor }} />
              </div>
            ) : recent.length === 0 ? (
              <p className="text-[13px] text-[#AEAEAE] text-center py-10 px-4">No notifications yet</p>
            ) : (
              <div className="max-h-[360px] overflow-y-auto divide-y divide-[#F5F5F5]">
                {recent.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void markRead(n)}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-[#FAFAFA] transition-colors flex gap-3',
                      !n.readAt && 'bg-blue-50/20'
                    )}
                  >
                    <div
                      className={cn(
                        'mt-0.5 w-8 h-8 rounded-[8px] shrink-0 flex items-center justify-center text-[10px] font-bold uppercase',
                        accent(n.title, n.type)
                      )}
                    >
                      {(n.title ?? n.type).slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-[13px] leading-snug',
                          n.readAt ? 'text-[#7C7C7C]' : 'font-bold text-[#181725]'
                        )}
                      >
                        {n.title ?? n.type}
                      </p>
                      {n.body && <p className="text-[12px] text-[#AEAEAE] mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[11px] text-[#AEAEAE] mt-1">{relativeTime(n.createdAt)}</p>
                    </div>
                    {!n.readAt && (
                      <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
