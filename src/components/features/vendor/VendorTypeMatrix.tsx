'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { FormField, FormInput } from '@/components/ui/form';
import {
  VENDOR_BUSINESS_TYPES,
  OTHER_OPTION,
  PROFILE_LABEL_MAX,
  subTypesForVendorType,
  slugForVendorType,
  isPresetVendorType,
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

function chipClass(selected: boolean) {
  return cn(
    'px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border transition-colors text-left',
    selected
      ? 'border-primary bg-primary-light text-primary'
      : 'border-[#EEEEEE] bg-white text-gray-500 hover:border-gray-300',
  );
}

export function VendorTypeMatrix({ value, onChange, error, className }: VendorTypeMatrixProps) {
  const selections = getEffectiveVendorTypeSelections(value);
  const [draftByType, setDraftByType] = useState<Record<string, string>>({});
  const [openOtherByType, setOpenOtherByType] = useState<Record<string, boolean>>({});
  const [customTypeDraft, setCustomTypeDraft] = useState('');
  const [customSubDraft, setCustomSubDraft] = useState('');

  const customSelection = selections.find((s) => !isPresetVendorType(s.type));
  const customTypeName = customSelection?.type ?? customTypeDraft;

  const commit = (next: VendorTypeSelection[]) => {
    onChange(buildPatchFromSelections(next));
  };

  const upsertType = (type: string, subTypes: string[]) => {
    const slug = slugForVendorType(type) ?? type;
    const existing = selections.find((s) => s.type === type);
    let next: VendorTypeSelection[];
    if (subTypes.length === 0) {
      next = selections.filter((s) => s.type !== type);
    } else if (existing) {
      next = selections.map((s) => (s.type === type ? { ...s, slug, subTypes } : s));
    } else {
      next = [...selections, { type, slug, subTypes }];
    }
    commit(next);
  };

  const toggleSubType = (type: string, subType: string) => {
    const existing = selections.find((s) => s.type === type);
    const current = existing?.subTypes ?? [];
    const has = current.includes(subType);
    const newSubs = has ? current.filter((s) => s !== subType) : [...current, subType];
    upsertType(type, newSubs);
  };

  const addCustomSub = (type: string, raw: string) => {
    const label = raw.trim().slice(0, PROFILE_LABEL_MAX);
    if (!label || label.toLowerCase() === OTHER_OPTION.toLowerCase()) return;
    const existing = selections.find((s) => s.type === type);
    const current = existing?.subTypes ?? [];
    if (current.some((s) => s.toLowerCase() === label.toLowerCase())) return;
    upsertType(type, [...current, label]);
  };

  const renameCustomType = (nextName: string) => {
    const trimmed = nextName.slice(0, PROFILE_LABEL_MAX);
    setCustomTypeDraft(trimmed);
    if (!customSelection) return;
    const slug = slugForVendorType(trimmed.trim()) ?? customSelection.slug;
    if (!trimmed.trim()) {
      commit(selections.filter((s) => s.type !== customSelection.type));
      return;
    }
    commit(
      selections.map((s) =>
        s.type === customSelection.type
          ? { ...s, type: trimmed.trim(), slug }
          : s,
      ),
    );
  };

  const isSubTypeSelected = (type: string, subType: string): boolean =>
    selections.some((s) => s.type === type && s.subTypes.includes(subType));

  return (
    <FormField label="Supplier Type & Sub-types" required className={className} dataField="vendorTypeSelections">
      <div className="rounded-xl border border-[#EEEEEE] overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-[minmax(140px,1fr)_2fr] bg-[#FAFAFA] border-b border-[#EEEEEE] px-3 py-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Supplier Type</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sub-types (select all that apply)</span>
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {VENDOR_BUSINESS_TYPES.map((type) => {
            const presetSubs = subTypesForVendorType(type);
            const extraSubs = (selections.find((s) => s.type === type)?.subTypes ?? [])
              .filter((st) => !presetSubs.includes(st));
            const rowActive = selections.some((s) => s.type === type);
            const otherOpen = openOtherByType[type] || extraSubs.length > 0;
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
                  rowActive ? 'text-primary' : 'text-[#181725]',
                )}>
                  {type}
                </p>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {presetSubs.map((st) => {
                    const selected = isSubTypeSelected(type, st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => toggleSubType(type, st)}
                        className={chipClass(selected)}
                      >
                        {st}
                      </button>
                    );
                  })}
                  {extraSubs.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => toggleSubType(type, st)}
                      className={chipClass(true)}
                    >
                      {st}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setOpenOtherByType((prev) => ({ ...prev, [type]: !otherOpen }))}
                    className={chipClass(otherOpen)}
                  >
                    {OTHER_OPTION}
                  </button>
                  {otherOpen && (
                    <FormInput
                      className="h-9 min-w-[140px] max-w-[220px] text-[12px]"
                      value={draftByType[type] ?? ''}
                      onChange={(v) => setDraftByType((prev) => ({ ...prev, [type]: v.slice(0, PROFILE_LABEL_MAX) }))}
                      placeholder="Type sub-type, Enter"
                      maxLength={PROFILE_LABEL_MAX}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        addCustomSub(type, draftByType[type] ?? '');
                        setDraftByType((prev) => ({ ...prev, [type]: '' }));
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
          <div
            className={cn(
              'px-3 py-3 sm:grid sm:grid-cols-[minmax(140px,1fr)_2fr] sm:gap-3 sm:items-start',
              customSelection && 'bg-[#FAFFFE]',
            )}
          >
            <div className="mb-2 sm:mb-0">
              <p className={cn(
                'text-[12.5px] font-bold mb-1.5',
                customSelection ? 'text-primary' : 'text-[#181725]',
              )}>
                {OTHER_OPTION}
              </p>
              <FormInput
                value={customTypeName}
                onChange={renameCustomType}
                placeholder="Type your supplier type"
                maxLength={PROFILE_LABEL_MAX}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {(customSelection?.subTypes ?? []).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    if (!customSelection) return;
                    toggleSubType(customSelection.type, st);
                  }}
                  className={chipClass(true)}
                >
                  {st}
                </button>
              ))}
              <FormInput
                className="h-9 min-w-[160px] max-w-[240px] text-[12px]"
                value={customSubDraft}
                onChange={(v) => setCustomSubDraft(v.slice(0, PROFILE_LABEL_MAX))}
                placeholder="Type sub-type, Enter"
                maxLength={PROFILE_LABEL_MAX}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const typeName = (customSelection?.type || customTypeDraft).trim();
                  if (!typeName) return;
                  addCustomSub(typeName, customSubDraft);
                  setCustomSubDraft('');
                }}
              />
            </div>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5">
        You can select multiple supplier types and multiple sub-types per type. Choose Other to type your own.
      </p>
      {error && <p className="text-[11px] text-red-600 font-medium mt-1">{error}</p>}
    </FormField>
  );
}
