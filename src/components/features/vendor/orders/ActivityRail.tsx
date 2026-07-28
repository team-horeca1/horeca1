'use client';

import React, { useState } from 'react';
import {
  formatWorkbenchDateTime,
  WORKBENCH_EVENT_LABELS,
  WORKBENCH_STATUS_LABELS,
  type WorkbenchEvent,
} from './types';
import { cn } from '@/lib/utils';

export function ActivityRail({
  events,
  paymentStatus,
  paymentMethod,
  totalAmount,
  orderNumber,
}: {
  events: WorkbenchEvent[];
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  totalAmount?: number;
  orderNumber?: string;
}) {
  const [tab, setTab] = useState<'timeline' | 'status' | 'activity'>('timeline');

  const statusEvents = events.filter(
    (e) =>
      e.action === 'status.changed' ||
      e.action === 'order.auto_accepted' ||
      e.action === 'order.cancelled',
  );
  const rows = tab === 'status' ? statusEvents : events;

  return (
    <aside
      className="flex h-full min-h-0 w-full flex-col border-t border-[#EEEEEE] bg-white lg:w-[min(100%,300px)] lg:border-l lg:border-t-0"
      data-testid="workspace-activity-rail"
    >
      <div className="border-b border-[#EEEEEE] px-4 py-3">
        <h3 className="text-[13px] font-bold text-[#181725]">Activity</h3>
        <p className="text-[11px] text-[#AEAEAE]">OrderEvent timeline</p>
      </div>

      <div className="border-b border-[#EEEEEE] px-3 py-2" data-testid="workspace-invoice-meta">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#AEAEAE]">Invoice</p>
        <p className="mt-0.5 text-[12px] font-semibold text-[#181725]">
          {orderNumber ?? '—'}
        </p>
        <p className="text-[11px] text-[#7C7C7C]">
          {paymentMethod ? paymentMethod.replace(/_/g, ' ') : '—'}
          {paymentStatus ? ` · ${paymentStatus}` : ''}
          {totalAmount != null
            ? ` · ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalAmount)}`
            : ''}
        </p>
        <p className="mt-1 text-[10px] text-[#AEAEAE]">PDF uses accepted / fulfilled qty (Rule 14)</p>
      </div>

      <div className="flex gap-1 border-b border-[#EEEEEE] p-2">
        {([
          ['timeline', 'Timeline'],
          ['status', 'Status'],
          ['activity', 'Log'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 rounded-[8px] px-2 py-1.5 text-[11px] font-bold transition-colors',
              tab === id ? 'bg-[#299E60] text-white' : 'bg-[#F5F5F5] text-[#7C7C7C] hover:bg-[#EEEEEE]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" data-testid="order-events-panel">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-[#AEAEAE]">No events yet.</p>
        ) : (
          rows.map((ev) => (
            <div key={ev.id} className="flex gap-2 border-b border-[#F5F5F5] pb-2 last:border-0">
              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#299E60]" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[#181725]">
                  {WORKBENCH_EVENT_LABELS[ev.action] ?? ev.action}
                  {ev.fromStatus && ev.toStatus && ev.fromStatus !== ev.toStatus && (
                    <span className="font-normal text-[#7C7C7C]">
                      {' '}
                      ({WORKBENCH_STATUS_LABELS[ev.fromStatus] ?? ev.fromStatus} →{' '}
                      {WORKBENCH_STATUS_LABELS[ev.toStatus] ?? ev.toStatus})
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-[#AEAEAE]">
                  {formatWorkbenchDateTime(ev.createdAt)}
                  {ev.actor?.fullName ? ` · ${ev.actor.fullName}` : ''}
                </p>
                {tab === 'activity' && typeof ev.payload?.reason === 'string' && (
                  <p className="text-[11px] text-[#7C7C7C]">— {String(ev.payload.reason)}</p>
                )}
                {tab === 'activity' &&
                  ev.payload?.fromQty != null &&
                  ev.payload?.toQty != null && (
                    <p className="text-[11px] text-[#7C7C7C]">
                      qty {String(ev.payload.fromQty)} → {String(ev.payload.toQty)}
                    </p>
                  )}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
