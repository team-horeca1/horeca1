'use client';

import { useRef, useState } from 'react';
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
  /** stacked = one type per card (modals). table = 2-col register/admin. */
  variant?: 'table' | 'stacked';
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
    'inline-flex items-center px-3 py-2 rounded-[10px] text-[12px] font-semibold border transition-colors text-left whitespace-normal max-w-full min-h-10',
    selected
      ? 'border-primary bg-primary-light text-primary'
      : 'border-divider bg-white text-text-secondary hover:border-primary/30',
  );
}

function isOtherLabel(label: string): boolean {
  return label.toLowerCase() === OTHER_OPTION.toLowerCase();
}

export function VendorTypeMatrix({
  value,
  onChange,
  error,
  className,
  variant = 'table',
}: VendorTypeMatrixProps) {
  const selections = getEffectiveVendorTypeSelections(value);
  const [draftByType, setDraftByType] = useState<Record<string, string>>({});
  const [openOtherByType, setOpenOtherByType] = useState<Record<string, boolean>>({});
  const [customTypeDraft, setCustomTypeDraft] = useState('');
  const [customSubDraft, setCustomSubDraft] = useState('');
  /** Last live-synced Other draft per type — replaced as the user types so Continue sees it without Enter. */
  const provisionalByTypeRef = useRef<Record<string, string>>({});
  const provisionalCustomSubRef = useRef<string>('');

  const customSelection = selections.find((s) => !isPresetVendorType(s.type));
  const customTypeName = customSelection?.type ?? customTypeDraft;

  const commit = (next: VendorTypeSelection[]) => {
    onChange(buildPatchFromSelections(next));
  };

  const upsertType = (type: string, subTypes: string[], base: VendorTypeSelection[] = selections) => {
    const slug = slugForVendorType(type) ?? type;
    const existing = base.find((s) => s.type === type);
    let next: VendorTypeSelection[];
    if (subTypes.length === 0) {
      next = base.filter((s) => s.type !== type);
    } else if (existing) {
      next = base.map((s) => (s.type === type ? { ...s, slug, subTypes } : s));
    } else {
      next = [...base, { type, slug, subTypes }];
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

  /**
   * Keep typed "Other" text in vendorTypeSelections immediately (not only on Enter),
   * replacing the previous provisional label so validation passes on Continue.
   */
  const syncProvisionalSub = (type: string, raw: string) => {
    const label = raw.trim().slice(0, PROFILE_LABEL_MAX);
    const prev = provisionalByTypeRef.current[type];
    const existing = selections.find((s) => s.type === type);
    let current = existing?.subTypes ?? [];
    if (prev) current = current.filter((s) => s !== prev);

    if (!label || isOtherLabel(label)) {
      delete provisionalByTypeRef.current[type];
      upsertType(type, current);
      return;
    }

    if (!current.some((s) => s.toLowerCase() === label.toLowerCase())) {
      current = [...current, label];
    }
    provisionalByTypeRef.current[type] = label;
    upsertType(type, current);
  };

  const finalizeDraftSub = (type: string) => {
    const draft = (draftByType[type] ?? '').trim();
    if (draft && !isOtherLabel(draft)) {
      syncProvisionalSub(type, draft);
      delete provisionalByTypeRef.current[type];
    }
    setDraftByType((prev) => ({ ...prev, [type]: '' }));
  };

  const syncCustomProvisionalSub = (raw: string) => {
    const typeName = (customSelection?.type || customTypeDraft).trim();
    if (!typeName) return;
    const label = raw.trim().slice(0, PROFILE_LABEL_MAX);
    const prev = provisionalCustomSubRef.current;
    const existing = selections.find((s) => s.type === typeName);
    let current = existing?.subTypes ?? [];
    if (prev) current = current.filter((s) => s !== prev);

    if (!label || isOtherLabel(label)) {
      provisionalCustomSubRef.current = '';
      upsertType(typeName, current);
      return;
    }

    if (!current.some((s) => s.toLowerCase() === label.toLowerCase())) {
      current = [...current, label];
    }
    provisionalCustomSubRef.current = label;
    upsertType(typeName, current);
  };

  const finalizeCustomDraftSub = () => {
    const draft = customSubDraft.trim();
    const typeName = (customSelection?.type || customTypeDraft).trim();
    if (draft && typeName && !isOtherLabel(draft)) {
      syncCustomProvisionalSub(draft);
      provisionalCustomSubRef.current = '';
    }
    setCustomSubDraft('');
  };

  const renameCustomType = (nextName: string) => {
    const trimmed = nextName.slice(0, PROFILE_LABEL_MAX);
    setCustomTypeDraft(trimmed);
    if (!customSelection) return;
    const slug = slugForVendorType(trimmed.trim()) ?? customSelection.slug;
    if (!trimmed.trim()) {
      provisionalCustomSubRef.current = '';
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

  const renderSubTypeChips = (type: string) => {
    const presetSubs = subTypesForVendorType(type);
    const draftLabel = (draftByType[type] ?? '').trim();
    const provisional = provisionalByTypeRef.current[type];
    const extraSubs = (selections.find((s) => s.type === type)?.subTypes ?? [])
      .filter((st) => !presetSubs.includes(st) && st !== draftLabel && st !== provisional);
    const otherOpen = openOtherByType[type] || extraSubs.length > 0 || Boolean(draftLabel) || Boolean(provisional);
    return (
      <div className="flex flex-wrap gap-2 items-center min-w-0">
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
          onClick={() => {
            if (otherOpen) finalizeDraftSub(type);
            setOpenOtherByType((prev) => ({ ...prev, [type]: !otherOpen }));
          }}
          className={chipClass(otherOpen)}
        >
          {OTHER_OPTION}
        </button>
        {otherOpen && (
          <FormInput
            className="h-10 w-full min-w-0 sm:w-auto sm:min-w-[10rem] sm:max-w-[16rem] text-[13px]"
            value={draftByType[type] ?? ''}
            onChange={(v) => {
              const next = v.slice(0, PROFILE_LABEL_MAX);
              setDraftByType((prev) => ({ ...prev, [type]: next }));
              syncProvisionalSub(type, next);
            }}
            placeholder="Type your sub-type"
            maxLength={PROFILE_LABEL_MAX}
            onBlur={() => finalizeDraftSub(type)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              finalizeDraftSub(type);
            }}
          />
        )}
      </div>
    );
  };

  const hint = (
    <p className="text-[12px] text-text-muted mt-2 leading-relaxed">
      Select every type that applies. For Other, type your label — no need to press Enter.
    </p>
  );

  const customSubChips = (customSelection?.subTypes ?? []).filter(
    (st) => st !== customSubDraft.trim() && st !== provisionalCustomSubRef.current,
  );

  if (variant === 'stacked') {
    return (
      <FormField label="Supplier type & sub-types" required className={cn('min-w-0', className)} dataField="vendorTypeSelections" error={error}>
        <div className="space-y-3 min-w-0">
          {VENDOR_BUSINESS_TYPES.map((type) => {
            const rowActive = selections.some((s) => s.type === type);
            return (
              <div
                key={type}
                className={cn(
                  'rounded-[12px] border px-3.5 py-3 min-w-0',
                  rowActive ? 'border-primary/25 bg-primary-light/30' : 'border-divider bg-white',
                )}
              >
                <p className={cn(
                  'text-[13px] font-semibold mb-2.5',
                  rowActive ? 'text-primary' : 'text-text',
                )}>
                  {type}
                </p>
                {renderSubTypeChips(type)}
              </div>
            );
          })}
          <div
            className={cn(
              'rounded-[12px] border px-3.5 py-3 min-w-0 space-y-2.5',
              customSelection ? 'border-primary/25 bg-primary-light/30' : 'border-divider bg-white',
            )}
          >
            <p className={cn(
              'text-[13px] font-semibold',
              customSelection ? 'text-primary' : 'text-text',
            )}>
              Other supplier type
            </p>
            <FormInput
              value={customTypeName}
              onChange={renameCustomType}
              placeholder="Type your supplier type"
              maxLength={PROFILE_LABEL_MAX}
            />
            <div className="flex flex-wrap gap-2 items-center min-w-0">
              {customSubChips.map((st) => (
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
                className="h-10 w-full min-w-0 text-[13px]"
                value={customSubDraft}
                onChange={(v) => {
                  const next = v.slice(0, PROFILE_LABEL_MAX);
                  setCustomSubDraft(next);
                  syncCustomProvisionalSub(next);
                }}
                placeholder="Type a sub-type"
                maxLength={PROFILE_LABEL_MAX}
                onBlur={finalizeCustomDraftSub}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  finalizeCustomDraftSub();
                }}
              />
            </div>
          </div>
        </div>
        {hint}
      </FormField>
    );
  }

  return (
    <FormField label="Supplier type & sub-types" required className={cn('min-w-0', className)} dataField="vendorTypeSelections" error={error}>
      <div className="rounded-xl border border-divider overflow-hidden min-w-0">
        <div className="hidden sm:grid sm:grid-cols-[minmax(0,8.75rem)_minmax(0,1fr)] bg-ivory border-b border-divider px-3 py-2">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Supplier type</span>
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Sub-types (select all that apply)</span>
        </div>
        <div className="divide-y divide-divider">
          {VENDOR_BUSINESS_TYPES.map((type) => {
            const rowActive = selections.some((s) => s.type === type);
            return (
              <div
                key={type}
                className={cn(
                  'px-3 py-3 min-w-0 sm:grid sm:grid-cols-[minmax(0,8.75rem)_minmax(0,1fr)] sm:gap-3 sm:items-start',
                  rowActive && 'bg-primary-light/20',
                )}
              >
                <p className={cn(
                  'text-[13px] font-semibold mb-2 sm:mb-0',
                  rowActive ? 'text-primary' : 'text-text',
                )}>
                  {type}
                </p>
                {renderSubTypeChips(type)}
              </div>
            );
          })}
          <div
            className={cn(
              'px-3 py-3 min-w-0 sm:grid sm:grid-cols-[minmax(0,8.75rem)_minmax(0,1fr)] sm:gap-3 sm:items-start',
              customSelection && 'bg-primary-light/20',
            )}
          >
            <div className="mb-2 sm:mb-0 min-w-0">
              <p className={cn(
                'text-[13px] font-semibold mb-1.5',
                customSelection ? 'text-primary' : 'text-text',
              )}>
                Other
              </p>
              <FormInput
                value={customTypeName}
                onChange={renameCustomType}
                placeholder="Type your supplier type"
                maxLength={PROFILE_LABEL_MAX}
              />
            </div>
            <div className="flex flex-wrap gap-2 items-center min-w-0">
              {customSubChips.map((st) => (
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
                className="h-10 w-full min-w-0 sm:w-auto sm:min-w-[10rem] sm:max-w-[16rem] text-[13px]"
                value={customSubDraft}
                onChange={(v) => {
                  const next = v.slice(0, PROFILE_LABEL_MAX);
                  setCustomSubDraft(next);
                  syncCustomProvisionalSub(next);
                }}
                placeholder="Type a sub-type"
                maxLength={PROFILE_LABEL_MAX}
                onBlur={finalizeCustomDraftSub}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  finalizeCustomDraftSub();
                }}
              />
            </div>
          </div>
        </div>
      </div>
      {hint}
    </FormField>
  );
}
