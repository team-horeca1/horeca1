'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isVendorActionableProductNotification } from '@/lib/vendorNotifications';

interface VendorNotification {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  referenceId: string | null;
  referenceType: string | null;
}

function notificationAccent(title: string | null, type: string): string {
  const t = (title ?? type).toLowerCase();
  if (t.includes('reject') || t.includes('needs changes')) return 'bg-[#FFF0F0] text-[#E74C3C]';
  if (t.includes('approv')) return 'bg-primary-light text-primary';
  if (t.includes('pending')) return 'bg-[#FFF7E6] text-[#F59E0B]';
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

async function markNotificationRead(notificationId: string) {
  await fetch('/api/v1/notifications/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationId }),
  });
}

export function getVendorNotificationHref(
  n: Pick<VendorNotification, 'referenceId' | 'referenceType' | 'title'>
): string | null {
  if (n.referenceType === 'product' && n.referenceId && isVendorActionableProductNotification(n.title)) {
    return `/vendor/products?edit=${n.referenceId}`;
  }
  return null;
}

export async function handleVendorNotificationClick(
  n: VendorNotification,
  router: { push: (href: string) => void }
) {
  if (!n.readAt) {
    try {
      await markNotificationRead(n.id);
    } catch {
      /* non-blocking */
    }
  }
  const href = getVendorNotificationHref(n);
  if (href) router.push(href);
}

export function vendorNotificationAccent(title: string | null, type: string): string {
  const t = (title ?? type).toLowerCase();
  if (t.includes('reject') || t.includes('needs changes')) return 'bg-[#FFF0F0] text-[#E74C3C]';
  if (t.includes('approv')) return 'bg-primary-light text-primary';
  if (t.includes('pending')) return 'bg-[#FFF7E6] text-[#F59E0B]';
  if (type === 'order' || t.includes('order')) return 'bg-blue-50 text-blue-600';
  if (t.includes('low') || t.includes('stock')) return 'bg-amber-50 text-amber-600';
  if (t.includes('payment') || t.includes('credit')) return 'bg-primary-light text-primary';
  return 'bg-[#F5F5F5] text-[#7C7C7C]';
}

export function VendorNotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<VendorNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/vendor/notifications');
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data.notifications);
        setUnreadCount(json.data.unreadCount);
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
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => void fetchNotifications(), 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
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

  const onItemClick = async (n: VendorNotification) => {
    setOpen(false);
    if (!n.readAt) {
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    await handleVendorNotificationClick(n, router);
  };

  const recent = notifications.slice(0, 5);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative hover:bg-gray-50 rounded-full p-2 transition-colors"
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
        <div className="absolute right-0 top-full mt-2 w-[min(360px,calc(100vw-2rem))] bg-white rounded-[14px] border border-[#EEEEEE] shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EEEEEE] flex items-center justify-between">
            <p className="text-[14px] font-bold text-[#181725]">Notifications</p>
            {unreadCount > 0 && (
              <span className="text-[11px] font-bold text-[#E74C3C]">{unreadCount} unread</span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={22} className="animate-spin text-primary" />
            </div>
          ) : recent.length === 0 ? (
            <p className="text-[13px] text-[#AEAEAE] text-center py-10 px-4">No notifications yet</p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto divide-y divide-[#F5F5F5]">
              {recent.map((n) => {
                const href = getVendorNotificationHref(n);
                return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void onItemClick(n)}
                  disabled={!href}
                  className={cn(
                    'w-full text-left px-4 py-3 hover:bg-[#FAFAFA] transition-colors flex gap-3',
                    !n.readAt && 'bg-blue-50/20',
                    !href && 'cursor-default'
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 w-8 h-8 rounded-[8px] shrink-0 flex items-center justify-center text-[10px] font-bold uppercase',
                      notificationAccent(n.title, n.type)
                    )}
                  >
                    {(n.title ?? n.type).slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-[13px] leading-snug truncate',
                        n.readAt ? 'text-[#7C7C7C]' : 'font-bold text-[#181725]'
                      )}
                    >
                      {n.title ?? n.type}
                    </p>
                    {n.body && (
                      <p className="text-[12px] text-[#AEAEAE] mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-[11px] text-[#AEAEAE] mt-1">{relativeTime(n.createdAt)}</p>
                  </div>
                </button>
              );})}
            </div>
          )}

          <div className="border-t border-[#EEEEEE] px-4 py-3">
            <Link
              href="/vendor/notifications"
              onClick={() => setOpen(false)}
              className="text-[13px] font-bold text-primary hover:underline"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
