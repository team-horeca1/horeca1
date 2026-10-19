'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ORDER_STATUS_TABS,
  ORDER_TAB_LABELS,
  type OrderStatusTab,
} from '@/components/features/orders/orderStatus';

export type VendorOption = { id: string; name: string };

type Props = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  paymentStatus: string;
  onPaymentStatusChange: (v: string) => void;
  paymentMethod: string;
  onPaymentMethodChange: (v: string) => void;
  /** Admin-only vendor filter */
  vendorId?: string;
  onVendorIdChange?: (v: string) => void;
  vendors?: VendorOption[];
  hasActiveFilters: boolean;
  onClear: () => void;
  today?: string;
  className?: string;
};

export function OrderListFilters({
  activeTab,
  onTabChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  paymentStatus,
  onPaymentStatusChange,
  paymentMethod,
  onPaymentMethodChange,
  vendorId,
  onVendorIdChange,
  vendors,
  hasActiveFilters,
  onClear,
  today,
  className,
}: Props) {
  const maxDate = today ?? new Date().toISOString().slice(0, 10);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 flex-wrap">
        {ORDER_STATUS_TABS.map((tab: OrderStatusTab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={cn(
              'px-4 py-2 rounded-[10px] text-[13px] font-bold transition-all',
              activeTab === tab
                ? 'bg-primary text-white shadow-sm shadow-primary/30'
                : 'bg-white text-[#7C7C7C] border border-[#EEEEEE] hover:border-primary/30',
            )}
          >
            {ORDER_TAB_LABELS[tab] || tab.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="date"
          value={dateFrom}
          max={maxDate}
          onChange={(e) => onDateFromChange(e.target.value)}
          title="From date"
          className="h-[36px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] text-[#181725] outline-none focus:border-primary/40 bg-white shadow-sm"
        />
        <input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          max={maxDate}
          onChange={(e) => onDateToChange(e.target.value)}
          title="To date"
          className="h-[36px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] text-[#181725] outline-none focus:border-primary/40 bg-white shadow-sm"
        />
        <select
          value={paymentStatus}
          onChange={(e) => onPaymentStatusChange(e.target.value)}
          className="h-[36px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] text-[#7C7C7C] outline-none focus:border-primary/40 bg-white shadow-sm"
        >
          <option value="">All Payment Status</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="refunded">Refunded</option>
        </select>
        <select
          value={paymentMethod}
          onChange={(e) => onPaymentMethodChange(e.target.value)}
          data-testid="payment-method-filter"
          className="h-[36px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] text-[#7C7C7C] outline-none focus:border-primary/40 bg-white shadow-sm"
        >
          <option value="">All Methods</option>
          <option value="cod">Cash / COD</option>
          <option value="online">Online</option>
          <option value="credit">Credit</option>
          <option value="vendor_credit">Vendor Credit</option>
        </select>
        {vendors && onVendorIdChange && (
          <select
            value={vendorId ?? ''}
            onChange={(e) => onVendorIdChange(e.target.value)}
            data-testid="vendor-filter"
            className="h-[36px] border border-[#EEEEEE] rounded-[10px] px-3 text-[13px] text-[#7C7C7C] outline-none focus:border-primary/40 bg-white shadow-sm min-w-[160px]"
          >
            <option value="">All Vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClear}
            className="h-[36px] px-3 rounded-[10px] border border-[#EEEEEE] bg-white text-[12px] font-bold text-[#7C7C7C] hover:bg-[#F5F5F5] flex items-center gap-1.5 transition-all"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
