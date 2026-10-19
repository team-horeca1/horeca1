'use client';

import React from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CustomerTarget } from '../types';

type EffectiveRow = {
  userId: string;
  label: string;
  tags: string[];
  creditStatus: string | null;
  effective: {
    priceListId: string | null;
    priceListName: string;
    via: string;
    assignedAt: string | null;
  };
};

interface Props {
  customer: CustomerTarget | null;
  effective: EffectiveRow | null;
  onExplain?: () => void;
}

export function CustomerPricePanel({ customer, effective, onExplain }: Props) {
  if (!customer) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-[13px] text-[#7C7C7C] text-center">
        Select a customer row to see their effective list and tags.
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4 h-full overflow-auto">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-[12px] bg-[#F8E8EC] text-primary flex items-center justify-center">
          <User size={20} />
        </div>
        <div>
          <h3 className="font-bold text-[#181725]">{customer.label}</h3>
          {customer.creditStatus && (
            <p className="text-[12px] text-[#7C7C7C] capitalize">Credit: {customer.creditStatus}</p>
          )}
        </div>
      </div>

      <div className="p-4 rounded-[12px] bg-[#FAF7F2] border border-[#E9E3DD]">
        <div className="text-[11px] font-medium text-[#7C7C7C] uppercase tracking-wide">Effective list</div>
        <div className="text-[16px] font-bold text-[#181725] mt-1">
          {effective?.effective.priceListName ?? 'Base catalogue'}
        </div>
        <div className="text-[12px] text-[#7C7C7C] mt-0.5">{effective?.effective.via ?? '—'}</div>
        {effective?.effective.assignedAt && (
          <div className="text-[11px] text-[#7C7C7C] mt-1 tabular-nums">
            Since {new Date(effective.effective.assignedAt).toLocaleDateString('en-IN')}
          </div>
        )}
      </div>

      {customer.tags.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-[#7C7C7C] mb-1.5">Tags / segments</div>
          <div className="flex flex-wrap gap-1.5">
            {customer.tags.map((t) => (
              <span key={t} className="px-2 py-0.5 rounded-full bg-white border border-[#E9E3DD] text-[11px]">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {(customer.pincodes.length > 0 || customer.cities.length > 0) && (
        <div className="text-[12px] text-[#7C7C7C] space-y-1">
          {customer.pincodes.length > 0 && (
            <p>Pincodes: {customer.pincodes.slice(0, 8).join(', ')}</p>
          )}
          {customer.cities.length > 0 && (
            <p>Cities: {customer.cities.slice(0, 8).join(', ')}</p>
          )}
        </div>
      )}

      {onExplain && (
        <button
          type="button"
          onClick={onExplain}
          className={cn(
            'w-full h-11 rounded-[12px] border border-primary text-primary font-semibold text-[13px]',
            'hover:bg-[#F8E8EC]',
          )}
        >
          Why this price? (pick a product on Prices tab)
        </button>
      )}
    </div>
  );
}
