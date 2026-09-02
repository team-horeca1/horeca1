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
import { Bell, Loader2, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CDL } from '@/lib/cdl';
import { IMPERSONATION_CHANGED_EVENT } from '@/lib/clearImpersonation';

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
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

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
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

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
        onClick={() => setOpen((v) => !v)}
        className="relative size-12 flex items-center justify-center hover:bg-ivory rounded-full active:scale-[0.97] transition-transform"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      >
        <Bell size={22} className="text-[#181725]" fill="#181725" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E74C3C] text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(380px,calc(100vw-2rem))] bg-white rounded-[14px] border border-[#EEEEEE] shadow-xl z-[60] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EEEEEE] flex items-center justify-between">
            <p className="text-[14px] font-bold text-[#181725]">Notifications</p>
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
      )}
    </div>
  );
}
