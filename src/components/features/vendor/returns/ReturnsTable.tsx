'use client';

import { ChevronRight, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReturnType } from '@/modules/return/return.types';
import {
  RETURN_STATUS_LABELS,
  RETURN_STATUS_STYLE,
  RETURN_TYPE_LABELS,
  customerLabel,
  formatDate,
  shortReturnId,
  type ReturnListRow,
} from './returnConstants';

interface Props {
  rows: ReturnListRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}

function typeLabel(type: string): string {
  if (type in RETURN_TYPE_LABELS) {
    return RETURN_TYPE_LABELS[type as ReturnType];
  }
  return type;
}

export function ReturnsTable({
  rows,
  loading,
  selectedId,
  onSelect,
  hasMore,
  onLoadMore,
  loadingMore,
}: Props) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#B45309]" size={28} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-[#AEAEAE] px-4">
        <RotateCcw size={36} className="text-[#E5E7EB] mx-auto mb-3" />
        <p className="text-[14px] font-semibold text-[#7C7C7C]">No returns found</p>
        <p className="text-[12px] mt-1">
          Returns appear here after a customer requests one on a delivered order
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-[#F5F5F5] p-3 space-y-3">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect(row.id)}
            className={cn(
              'w-full text-left bg-[#FAFAFA] rounded-[12px] border p-4 space-y-2 transition-colors',
              selectedId === row.id ? 'border-[#B45309] bg-[#B45309]/5' : 'border-[#EEEEEE]',
            )}
          >
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[#181725] truncate">
                  {shortReturnId(row.id)}
                </p>
                <p className="text-[12px] text-[#7C7C7C]">
                  {row.invoiceNumber ?? row.order.orderNumber}
                </p>
              </div>
              <span
                className={cn(
                  'inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border shrink-0',
                  RETURN_STATUS_STYLE[row.status],
                )}
              >
                {RETURN_STATUS_LABELS[row.status]}
              </span>
            </div>
            <p className="text-[13px] font-semibold text-[#181725]">{customerLabel(row)}</p>
            <div className="flex justify-between text-[11px] text-[#7C7C7C]">
              <span>{typeLabel(row.type)}</span>
              <span>{formatDate(row.createdAt)}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
              <th className="px-5 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Return
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Order / Invoice
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Customer / Outlet
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Type
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Status
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Requested On
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelect(row.id)}
                className={cn(
                  'border-b border-[#F5F5F5] cursor-pointer transition-colors hover:bg-[#B45309]/[0.04]',
                  selectedId === row.id && 'bg-[#B45309]/[0.06]',
                )}
              >
                <td className="px-5 py-3.5">
                  <p className="font-bold text-[#181725] font-mono text-[12px]">
                    {shortReturnId(row.id)}
                  </p>
                </td>
                <td className="px-4 py-3.5">
                  <p className="font-semibold text-[#181725]">
                    {row.invoiceNumber ?? row.order.orderNumber}
                  </p>
                  {row.invoiceNumber && row.invoiceNumber !== row.order.orderNumber && (
                    <p className="text-[11px] text-[#AEAEAE]">{row.order.orderNumber}</p>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <p className="font-semibold text-[#181725]">{customerLabel(row)}</p>
                  {row.order.outlet?.name && (
                    <p className="text-[11px] text-[#AEAEAE]">{row.order.outlet.name}</p>
                  )}
                </td>
                <td className="px-4 py-3.5 text-[#7C7C7C]">{typeLabel(row.type)}</td>
                <td className="px-4 py-3.5">
                  <span
                    className={cn(
                      'inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border',
                      RETURN_STATUS_STYLE[row.status],
                    )}
                  >
                    {RETURN_STATUS_LABELS[row.status]}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-[#7C7C7C]">{formatDate(row.createdAt)}</td>
                <td className="px-4 py-3.5 text-right">
                  <ChevronRight size={16} className="inline text-[#AEAEAE]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center py-4 border-t border-[#F5F5F5]">
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="h-[36px] px-4 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#B45309] disabled:opacity-50 flex items-center gap-2"
          >
            {loadingMore && <Loader2 size={14} className="animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </>
  );
}
