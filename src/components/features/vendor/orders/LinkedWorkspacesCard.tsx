'use client';

import Link from 'next/link';
import { ExternalLink, Package, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  deliveryStatusLabel,
  deliveryStatusStyle,
} from '@/components/features/vendor/fulfillment/fulfillmentConstants';
import {
  RETURN_STATUS_LABELS,
  RETURN_STATUS_STYLE,
} from '@/components/features/vendor/returns/returnConstants';
import {
  mapLegacyReturnStatus,
  type ReturnStatus,
} from '@/modules/return/return.types';

export interface LinkedFulfilmentSummary {
  id: string;
  status: string;
}

export interface LinkedReturnSummary {
  id: string;
  status: string;
}

function deliveryLabel(status: string): string {
  return deliveryStatusLabel(status);
}

function deliveryStyle(status: string): string {
  return deliveryStatusStyle(status);
}

function returnLabel(status: string): string {
  const mapped = mapLegacyReturnStatus(status);
  return RETURN_STATUS_LABELS[mapped] ?? status;
}

function returnStyle(status: string): string {
  const mapped = mapLegacyReturnStatus(status) as ReturnStatus;
  return RETURN_STATUS_STYLE[mapped] ?? 'bg-slate-50 text-slate-700 border-slate-200';
}

/**
 * Read-only deep-links from Orders into Delivery and Returns workspaces.
 * Does not add fulfilment/return actions into the order lifecycle.
 */
export function LinkedWorkspacesCard({
  fulfilment,
  returns,
  className,
}: {
  fulfilment: LinkedFulfilmentSummary | null | undefined;
  returns: LinkedReturnSummary[] | null | undefined;
  className?: string;
}) {
  const returnList = returns ?? [];
  const latestReturn = returnList[0] ?? null;

  return (
    <div
      className={cn(
        'rounded-[14px] border border-[#EEEEEE] bg-white p-4',
        className,
      )}
      data-testid="linked-workspaces"
    >
      <h3 className="text-[14px] font-bold text-[#181725]">Linked Workspaces</h3>
      <p className="mt-0.5 text-[11px] text-[#AEAEAE]">
        Open operational workspaces for this order — order lines stay unchanged.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* Delivery */}
        <div
          className="rounded-[12px] border border-[#0F766E]/20 bg-[#0F766E]/[0.04] p-3"
          data-testid="linked-fulfilment"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#0F766E]/10 text-[#0F766E]">
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#0F766E]">
                Delivery
              </p>
              {fulfilment ? (
                <span
                  className={cn(
                    'mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold',
                    deliveryStyle(fulfilment.status),
                  )}
                  data-testid="linked-fulfilment-status"
                >
                  {deliveryLabel(fulfilment.status)}
                </span>
              ) : (
                <p className="mt-1 text-[12px] text-[#7C7C7C]" data-testid="linked-fulfilment-empty">
                  No delivery yet
                </p>
              )}
            </div>
          </div>
          {fulfilment ? (
            <Link
              href={`/vendor/delivery?id=${fulfilment.id}`}
              data-testid="open-fulfilment"
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] border border-[#0F766E]/30 bg-white px-3 text-[12px] font-bold text-[#0F766E] hover:bg-[#0F766E]/10"
            >
              Open Delivery
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>

        {/* Returns */}
        <div
          className="rounded-[12px] border border-[#B45309]/20 bg-[#B45309]/[0.04] p-3"
          data-testid="linked-returns"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#B45309]/10 text-[#B45309]">
              <RotateCcw className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#B45309]">
                Returns
              </p>
              {latestReturn ? (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold',
                      returnStyle(latestReturn.status),
                    )}
                    data-testid="linked-returns-status"
                  >
                    {returnLabel(latestReturn.status)}
                  </span>
                  {returnList.length > 1 && (
                    <span
                      className="text-[11px] font-semibold text-[#7C7C7C]"
                      data-testid="linked-returns-count"
                    >
                      {returnList.length} returns
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-[12px] text-[#7C7C7C]" data-testid="linked-returns-empty">
                  No returns
                </p>
              )}
            </div>
          </div>
          {latestReturn ? (
            <Link
              href={`/vendor/returns?id=${latestReturn.id}`}
              data-testid="open-returns"
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] border border-[#B45309]/30 bg-white px-3 text-[12px] font-bold text-[#B45309] hover:bg-[#B45309]/10"
            >
              Open Returns
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span
              className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-[10px] border border-dashed border-[#EEEEEE] px-3 text-[12px] font-semibold text-[#AEAEAE]"
              data-testid="open-returns-disabled"
            >
              No returns to open
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
