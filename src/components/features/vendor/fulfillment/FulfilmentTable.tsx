'use client';

import type { MouseEvent } from 'react';
import { ChevronRight, Copy, ExternalLink, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  canBulkAssign,
  copyText,
  customerLabel,
  deliveryStatusLabel,
  deliveryStatusStyle,
  formatEta,
  fulfilmentOutletLabels,
  magicLinkAbsoluteUrl,
  type FulfilmentListRow,
} from './fulfillmentConstants';

function CustomerCell({ row }: { row: FulfilmentListRow }) {
  const { deliver, fulfill } = fulfilmentOutletLabels(row);
  return (
    <>
      <p className="font-semibold text-[#181725]">{customerLabel(row.order)}</p>
      {(deliver || fulfill) && (
        <p className="text-[10px] text-[#7C7C7C] mt-0.5 leading-snug">
          {deliver && (
            <span>
              Deliver: <span className="font-semibold text-[#181725]">{deliver}</span>
            </span>
          )}
          {deliver && fulfill && ' · '}
          {fulfill && (
            <span>
              Fulfill: <span className="font-semibold text-[#299E60]">{fulfill}</span>
            </span>
          )}
        </p>
      )}
    </>
  );
}

interface Props {
  rows: FulfilmentListRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAllAssignable: () => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}

export function FulfilmentTable({
  rows,
  loading,
  selectedId,
  onSelect,
  selectedIds,
  onToggleSelect,
  onToggleSelectAllAssignable,
  hasMore,
  onLoadMore,
  loadingMore,
}: Props) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#0F766E]" size={28} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-[#AEAEAE] px-4">
        <p className="text-[14px] font-semibold text-[#7C7C7C]">No deliveries found</p>
        <p className="text-[12px] mt-1">
          Accept an order to create a delivery automatically
        </p>
      </div>
    );
  }

  const assignableIds = rows.filter((r) => canBulkAssign(r.status)).map((r) => r.id);
  const allAssignableSelected =
    assignableIds.length > 0 && assignableIds.every((id) => selectedIds.has(id));

  const copyLink = async (path: string, e: MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(magicLinkAbsoluteUrl(path));
    if (ok) toast.success('Delivery link copied');
    else toast.error('Could not copy link');
  };

  const visitLink = (path: string, e: MouseEvent) => {
    e.stopPropagation();
    window.open(magicLinkAbsoluteUrl(path), '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden p-3 space-y-3">
        {rows.map((row) => {
          const assignable = canBulkAssign(row.status);
          return (
            <div
              key={row.id}
              className={cn(
                'w-full text-left bg-[#FAFAFA] rounded-[12px] border p-4 space-y-2 transition-colors',
                selectedId === row.id ? 'border-[#0F766E] bg-[#0F766E]/5' : 'border-[#EEEEEE]',
              )}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.id)}
                  disabled={!assignable}
                  onChange={() => onToggleSelect(row.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 h-4 w-4 accent-[#0F766E] disabled:opacity-30"
                  aria-label={`Select ${row.order.orderNumber}`}
                  title={assignable ? 'Select for bulk assign' : 'Only Packed orders can be bulk-assigned'}
                />
                <button
                  type="button"
                  onClick={() => onSelect(row.id)}
                  className="flex-1 min-w-0 text-left space-y-2"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-[#181725] truncate">
                        {row.order.orderNumber}
                      </p>
                      <p className="text-[12px] text-[#7C7C7C]">{row.fulfilmentNumber}</p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border shrink-0',
                        deliveryStatusStyle(row.status),
                      )}
                    >
                      {deliveryStatusLabel(row.status)}
                    </span>
                  </div>
                  <div className="text-[13px]">
                    <CustomerCell row={row} />
                  </div>
                  <div className="flex justify-between text-[11px] text-[#7C7C7C]">
                    <span>{row.deliveryResource?.name ?? 'Unassigned'}</span>
                    <span>ETA {formatEta(row.eta)}</span>
                  </div>
                </button>
              </div>
              {row.magicLink && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={(e) => visitLink(row.magicLink!.path, e)}
                    className="h-[36px] rounded-[10px] border border-[#0F766E]/25 bg-white text-[12px] font-bold text-[#0F766E] flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink size={13} /> Visit
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void copyLink(row.magicLink!.path, e)}
                    className="h-[36px] rounded-[10px] border border-[#0F766E]/25 bg-white text-[12px] font-bold text-[#0F766E] flex items-center justify-center gap-1.5"
                  >
                    <Copy size={13} /> Copy
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allAssignableSelected}
                  disabled={assignableIds.length === 0}
                  onChange={onToggleSelectAllAssignable}
                  className="h-4 w-4 accent-[#0F766E] disabled:opacity-30"
                  aria-label="Select all packed"
                  title="Select all Packed rows on this page"
                />
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Order #
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Status
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Boy
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Link
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                ETA
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-bold text-[#7C7C7C] uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const assignable = canBulkAssign(row.status);
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelect(row.id)}
                  className={cn(
                    'border-b border-[#F5F5F5] cursor-pointer transition-colors hover:bg-[#0F766E]/[0.04]',
                    selectedId === row.id && 'bg-[#0F766E]/[0.06]',
                    selectedIds.has(row.id) && 'bg-[#0F766E]/[0.03]',
                  )}
                >
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      disabled={!assignable}
                      onChange={() => onToggleSelect(row.id)}
                      className="h-4 w-4 accent-[#0F766E] disabled:opacity-30"
                      aria-label={`Select ${row.order.orderNumber}`}
                      title={
                        assignable
                          ? 'Select for bulk assign'
                          : 'Only Packed orders can be bulk-assigned'
                      }
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-[#181725]">{row.order.orderNumber}</p>
                    <p className="text-[11px] text-[#AEAEAE]">{row.fulfilmentNumber}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <CustomerCell row={row} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border',
                        deliveryStatusStyle(row.status),
                      )}
                    >
                      {deliveryStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[#7C7C7C]">
                    {row.deliveryResource?.name ?? row.magicLink?.deliveryBoyName ?? '—'}
                  </td>
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    {row.magicLink ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => visitLink(row.magicLink!.path, e)}
                          className="inline-flex items-center gap-1 text-[12px] font-bold text-[#0F766E] hover:underline"
                          title="Open magic link"
                        >
                          <ExternalLink size={13} />
                          Visit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => void copyLink(row.magicLink!.path, e)}
                          className="inline-flex items-center gap-1 text-[12px] font-bold text-[#0F766E] hover:underline"
                          title="Copy magic link"
                        >
                          <Link2 size={13} />
                          Copy
                        </button>
                      </div>
                    ) : (
                      <span className="text-[#AEAEAE]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-[#7C7C7C]">{formatEta(row.eta)}</td>
                  <td className="px-4 py-3.5 text-right">
                    <ChevronRight size={16} className="inline text-[#AEAEAE]" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center py-4 border-t border-[#F5F5F5]">
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="h-[36px] px-4 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold text-[#0F766E] disabled:opacity-50 flex items-center gap-2"
          >
            {loadingMore && <Loader2 size={14} className="animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </>
  );
}
