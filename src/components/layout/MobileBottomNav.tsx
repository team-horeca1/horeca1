'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Search,
  Package,
  CreditCard,
  User,
  X,
  ChevronRight,
  ShoppingCart,
  ListOrdered,
  History,
  Truck,
  Wallet,
  Building2,
  Users,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import { useStableSession } from '@/hooks/useStableSession';

type PopupId = 'orders' | 'credit' | 'profile' | null;

interface CreditSummary {
  availableCredit: string;
  outstandingAmount: string;
  currentDueDate: string | null;
  vendorName: string | null;
}

interface MobileBottomNavProps {
  onSearchClick?: () => void;
  onBusinessSwitchClick?: () => void;
}

const LONG_PRESS_MS = 450;

function NavPopup({
  children,
  onClose,
  anchorLabel,
}: {
  children: React.ReactNode;
  onClose: () => void;
  anchorLabel: string;
}) {
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[9998] bg-black/45"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={`${anchorLabel} menu`}
        className="fixed bottom-[72px] left-3 right-3 z-[9999] bg-white rounded-2xl shadow-cdl-3 border border-divider overflow-hidden"
      >
        <div className="p-2">{children}</div>
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-full border border-divider flex items-center justify-center text-text-secondary bg-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

function PopupRow({
  href,
  onClick,
  icon: Icon,
  title,
  subtitle,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle?: string;
}) {
  const inner = (
    <>
      <div className="size-9 rounded-full bg-primary-light flex items-center justify-center shrink-0">
        <Icon size={18} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[15px] font-semibold text-text leading-tight">{title}</p>
        {subtitle && (
          <p className="text-[12px] text-text-secondary truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      <ChevronRight size={16} className="text-text-muted shrink-0" />
    </>
  );

  const cls =
    'w-full flex items-center gap-3 px-3 py-3 min-h-[48px] rounded-xl hover:bg-ivory transition-colors';

  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}

export function MobileBottomNav({
  onSearchClick,
  onBusinessSwitchClick,
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { totalItems, totalAmount } = useCart();
  const { isAuthenticated } = useStableSession();
  const [popup, setPopup] = useState<PopupId>(null);
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const hidden =
    pathname === '/cart'
    || pathname?.includes('/cart/shipment/')
    || pathname?.includes('/order-lists/')
    || pathname?.includes('/recently-viewed/');

  useEffect(() => {
    if (!isAuthenticated || popup !== 'credit') return;
    let cancelled = false;
    fetch('/api/v1/wallet', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.success || !Array.isArray(json.data) || json.data.length === 0) return;
        const w = json.data[0] as CreditSummary & { vendor?: { businessName: string } | null };
        setCreditSummary({
          availableCredit: w.availableCredit,
          outstandingAmount: w.outstandingAmount,
          currentDueDate: w.currentDueDate,
          vendorName: w.vendor?.businessName ?? null,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated, popup]);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (id: PopupId, action: () => void) => {
    longPressTriggered.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setPopup(null);
      action();
    }, LONG_PRESS_MS);
  };

  const navItems = [
    { id: 'home' as const, label: 'Home', icon: Home, href: '/', popup: null as PopupId },
    { id: 'search' as const, label: 'Search', icon: Search, href: undefined, popup: null as PopupId },
    { id: 'orders' as const, label: 'Orders', icon: Package, href: undefined, popup: 'orders' as PopupId },
    { id: 'credit' as const, label: 'Credit', icon: CreditCard, href: undefined, popup: 'credit' as PopupId },
    { id: 'profile' as const, label: 'Profile', icon: User, href: undefined, popup: 'profile' as PopupId },
  ];

  const isActive = (item: (typeof navItems)[number]) => {
    if (item.id === 'home') return pathname === '/';
    if (item.id === 'search') return pathname?.startsWith('/search');
    if (item.id === 'orders') return pathname?.startsWith('/orders') || pathname === '/cart';
    if (item.id === 'credit') return pathname?.startsWith('/wallet');
    if (item.id === 'profile') return pathname?.startsWith('/profile');
    return false;
  };

  const handleTap = useCallback(
    (item: (typeof navItems)[number]) => {
      if (longPressTriggered.current) {
        longPressTriggered.current = false;
        return;
      }
      if (item.id === 'search') {
        onSearchClick?.();
        return;
      }
      if (item.popup) {
        setPopup((p) => (p === item.popup ? null : item.popup));
        return;
      }
      if (item.href) {
        setPopup(null);
        router.push(item.href);
      }
    },
    [onSearchClick, router],
  );

  if (hidden) return null;

  const formatInr = (v: string | number) =>
    `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <>
      {popup === 'orders' && (
        <NavPopup anchorLabel="Orders" onClose={() => setPopup(null)}>
          <PopupRow
            href="/cart"
            onClick={() => setPopup(null)}
            icon={ShoppingCart}
            title="Cart"
            subtitle={
              totalItems > 0
                ? `${totalItems} items · ${formatInr(totalAmount)}`
                : 'Your cart is empty'
            }
          />
          <PopupRow href="/order-lists" onClick={() => setPopup(null)} icon={ListOrdered} title="Quick Order" subtitle="Upload or paste items" />
          <PopupRow href="/orders" onClick={() => setPopup(null)} icon={History} title="Order History" subtitle="Last 180 days" />
          <PopupRow href="/orders" onClick={() => setPopup(null)} icon={Truck} title="Track Deliveries" subtitle="View active orders" />
        </NavPopup>
      )}

      {popup === 'credit' && (
        <NavPopup anchorLabel="Credit" onClose={() => setPopup(null)}>
          {!isAuthenticated ? (
            <PopupRow href="/login" onClick={() => setPopup(null)} icon={CreditCard} title="Log in to see credit" subtitle="DiSCCO credit lines" />
          ) : (
            <>
              <PopupRow
                href="/wallet"
                onClick={() => setPopup(null)}
                icon={CreditCard}
                title="DiSCCO Credit Line"
                subtitle={
                  creditSummary
                    ? `${formatInr(creditSummary.availableCredit)} available`
                    : 'View your credit lines'
                }
              />
              {creditSummary && Number(creditSummary.outstandingAmount) > 0 && (
                <PopupRow
                  href="/wallet"
                  onClick={() => setPopup(null)}
                  icon={Wallet}
                  title="Payments Due"
                  subtitle={`${formatInr(creditSummary.outstandingAmount)} outstanding`}
                />
              )}
              <PopupRow href="/wallet" onClick={() => setPopup(null)} icon={Wallet} title="Transaction Ledger" subtitle="All credit activity" />
            </>
          )}
        </NavPopup>
      )}

      {popup === 'profile' && (
        <NavPopup anchorLabel="Profile" onClose={() => setPopup(null)}>
          <PopupRow
            href={isAuthenticated ? '/profile' : '/login'}
            onClick={() => setPopup(null)}
            icon={User}
            title="My Account"
            subtitle="Manage profile details"
          />
          <PopupRow
            href={isAuthenticated ? '/profile' : '/login'}
            onClick={() => {
              setPopup(null);
              onBusinessSwitchClick?.();
            }}
            icon={Building2}
            title="My Businesses"
            subtitle="Switch or manage outlets"
          />
          <PopupRow href="/profile/team" onClick={() => setPopup(null)} icon={Users} title="Team" subtitle="Users & permissions" />
          <PopupRow href="/profile" onClick={() => setPopup(null)} icon={Settings} title="Settings" subtitle="App preferences" />
        </NavPopup>
      )}

      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-[9997] bg-white border-t border-divider pb-[env(safe-area-inset-bottom,0px)] h-[72px] shadow-cdl-2"
        aria-label="Main navigation"
      >
        <div className="flex items-stretch justify-around h-full px-1">
          {navItems.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                aria-expanded={item.popup ? popup === item.popup : undefined}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px] active:scale-[0.97] transition-transform bg-transparent border-0"
                onClick={() => handleTap(item)}
                onPointerDown={() => {
                  if (item.id === 'orders') {
                    startLongPress('orders', () => router.push('/cart'));
                  } else if (item.id === 'credit') {
                    startLongPress('credit', () => router.push('/wallet'));
                  } else if (item.id === 'profile') {
                    startLongPress('profile', () => onBusinessSwitchClick?.());
                  }
                }}
                onPointerUp={clearLongPress}
                onPointerLeave={clearLongPress}
                onPointerCancel={clearLongPress}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.25 : 1.75}
                  className={cn(active ? 'text-primary fill-primary/15' : 'text-text-secondary')}
                />
                <span
                  className={cn(
                    'text-[10px] font-medium',
                    active ? 'text-primary font-semibold' : 'text-text-secondary',
                  )}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
