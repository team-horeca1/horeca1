'use client';

import { cn } from '@/lib/utils';
import { ORDER_PAYMENT_STYLE } from '@/components/features/orders/orderStatus';

export function OrderPaymentBadge({
  paymentStatus,
  className,
}: {
  paymentStatus: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-[11px] font-bold px-2.5 py-1 rounded-[6px] uppercase',
        ORDER_PAYMENT_STYLE[paymentStatus] || 'bg-gray-100 text-gray-500',
        className,
      )}
    >
      {paymentStatus}
    </span>
  );
}
