'use client';

import { cn } from '@/lib/utils';
import { FormField } from '@/components/ui/form';
import {
  VENDOR_BUSINESS_TYPES,
  subTypesForVendorType,
  slugForVendorType,
  type VendorBusinessType,
  type VendorTypeSelection,
} from '@/lib/constants/vendorProfile';
import { getEffectiveVendorTypeSelections } from '@/lib/validators/vendor-profile';
import type { VendorProfileInput } from '@/lib/validators/vendor-profile';

interface VendorTypeMatrixProps {
  value: VendorProfileInput;
  onChange: (patch: Partial<VendorProfileInput>) => void;
  error?: string;
  className?: string;
}

function buildPatchFromSelections(selections: VendorTypeSelection[]): Partial<VendorProfileInput> {
  const first = selections[0];
  return {
    vendorTypeSelections: selections,
    vendorBusinessType: first?.type ?? '',
    vendorType: first?.slug ?? '',
    subType: first?.subTypes[0] ?? '',
  };
}

export function VendorTypeMatrix({ value, onChange, error, className }: VendorTypeMatrixProps) {
  const selections = getEffectiveVendorTypeSelections(value);

  const isSubTypeSelected = (type: VendorBusinessType, subType: string): boolean =>
    selections.some((s) => s.type === type && s.subTypes.includes(subType));

  const toggleSubType = (type: VendorBusinessType, subType: string) => {
    const slug = slugForVendorType(type) ?? type;
    const existing = selections.find((s) => s.type === type);
    let next: VendorTypeSelection[];

    if (existing) {
      const has = existing.subTypes.includes(subType);
      const newSubs = has
        ? existing.subTypes.filter((s) => s !== subType)
        : [...existing.subTypes, subType];
      if (newSubs.length === 0) {
        next = selections.filter((s) => s.type !== type);
      } else {
        next = selections.map((s) =>
          s.type === type ? { ...s, subTypes: newSubs } : s,
        );
      }
    } else {
      next = [...selections, { type, slug, subTypes: [subType] }];
    }

    onChange({
      ...buildPatchFromSelections(next),
      categoriesHandled: [],
    });
  };

  return (
    <FormField label="Vendor Type & Sub-types" required className={className}>
      <div className="rounded-xl border border-[#EEEEEE] overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-[minmax(140px,1fr)_2fr] bg-[#FAFAFA] border-b border-[#EEEEEE] px-3 py-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Vendor Type</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sub-types (select all that apply)</span>
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {VENDOR_BUSINESS_TYPES.map((type) => {
            const subTypes = subTypesForVendorType(type);
            const rowActive = selections.some((s) => s.type === type);
            return (
              <div
                key={type}
                className={cn(
                  'px-3 py-3 sm:grid sm:grid-cols-[minmax(140px,1fr)_2fr] sm:gap-3 sm:items-start',
                  rowActive && 'bg-[#FAFFFE]',
                )}
              >
                <p className={cn(
                  'text-[12.5px] font-bold mb-2 sm:mb-0',
                  rowActive ? 'text-[#299E60]' : 'text-[#181725]',
                )}>
                  {type}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {subTypes.map((st) => {
                    const selected = isSubTypeSelected(type, st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => toggleSubType(type, st)}
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border transition-colors text-left',
                          selected
                            ? 'border-[#299E60] bg-[#EEF8F1] text-[#299E60]'
                            : 'border-[#EEEEEE] bg-white text-gray-500 hover:border-gray-300',
                        )}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5">
        You can select multiple vendor types and multiple sub-types per type.
      </p>
      {error && <p className="text-[11px] text-red-600 font-medium mt-1">{error}</p>}
    </FormField>
  );
}
