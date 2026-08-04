'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DeliveryBoyOption = {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
};

export type DeliveryBoySelection =
  | { mode: 'existing'; deliveryResourceId: string }
  | { mode: 'new'; deliveryBoyName: string; deliveryBoyPhone: string }
  | { mode: 'none' };

type Props = {
  /** Pre-select a roster boy when editing / re-assigning. */
  initialResourceId?: string | null;
  disabled?: boolean;
  /** Focus ring / border accent — delivery teal or return amber. */
  accentClassName?: string;
  onChange: (selection: DeliveryBoySelection) => void;
};

const NEW_VALUE = '__new__';

/**
 * Roster dropdown for assign delivery / return pickup.
 * Loads active DeliveryResource rows; supports inline "Add new boy".
 */
export function DeliveryBoySelect({
  initialResourceId,
  disabled,
  accentClassName = 'focus:border-[#0F766E]/40',
  onChange,
}: Props) {
  const [boys, setBoys] = useState<DeliveryBoyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectValue, setSelectValue] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const emit = useCallback(
    (value: string, name: string, phone: string) => {
      if (!value) {
        onChange({ mode: 'none' });
        return;
      }
      if (value === NEW_VALUE) {
        onChange({
          mode: 'new',
          deliveryBoyName: name.trim(),
          deliveryBoyPhone: phone.trim(),
        });
        return;
      }
      onChange({ mode: 'existing', deliveryResourceId: value });
    },
    [onChange],
  );

  const loadBoys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/vendor/fulfilments/resources');
      const json = (await res.json()) as {
        success?: boolean;
        data?: DeliveryBoyOption[];
      };
      const list = (json.success && Array.isArray(json.data) ? json.data : []).filter(
        (b) => b.isActive !== false,
      );
      setBoys(list);
    } catch {
      setBoys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoys();
  }, [loadBoys]);

  useEffect(() => {
    if (loading) return;
    if (initialResourceId && boys.some((b) => b.id === initialResourceId)) {
      Promise.resolve().then(() => {
        setSelectValue(initialResourceId);
        onChange({ mode: 'existing', deliveryResourceId: initialResourceId });
      });
    }
    // Only seed once roster loads for a given initial id.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional seed on load
  }, [loading, initialResourceId, boys]);

  const inputClass = cn(
    'w-full h-[40px] px-3 rounded-[10px] border border-[#EEEEEE] text-[13px] outline-none',
    accentClassName,
  );

  if (loading) {
    return (
      <div className="flex h-[40px] items-center gap-2 text-[12px] text-[#7C7C7C]">
        <Loader2 size={14} className="animate-spin" />
        Loading delivery boys…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <select
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const value = e.target.value;
          setSelectValue(value);
          emit(value, newName, newPhone);
        }}
        className={cn(inputClass, 'bg-white')}
        aria-label="Select delivery boy"
      >
        <option value="">Select delivery boy…</option>
        {boys.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.phone ? ` · ${b.phone}` : ''}
          </option>
        ))}
        <option value={NEW_VALUE}>+ Add new boy</option>
      </select>

      {selectValue === NEW_VALUE && (
        <div className="space-y-2 rounded-[10px] border border-dashed border-[#DDDDDD] p-2.5">
          <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[#7C7C7C]">
            <UserPlus size={12} /> New delivery boy
          </p>
          <input
            value={newName}
            disabled={disabled}
            onChange={(e) => {
              const name = e.target.value;
              setNewName(name);
              emit(NEW_VALUE, name, newPhone);
            }}
            placeholder="Delivery boy name"
            className={inputClass}
          />
          <input
            value={newPhone}
            disabled={disabled}
            onChange={(e) => {
              const phone = e.target.value;
              setNewPhone(phone);
              emit(NEW_VALUE, newName, phone);
            }}
            placeholder="Phone number"
            inputMode="tel"
            className={inputClass}
          />
        </div>
      )}

      {boys.length === 0 && selectValue !== NEW_VALUE && (
        <p className="text-[11px] text-[#AEAEAE]">
          No boys in roster yet — choose &quot;Add new boy&quot; or add them under Delivery Boy.
        </p>
      )}
    </div>
  );
}

/** True when selection can be submitted to assign APIs. */
export function isDeliveryBoySelectionReady(selection: DeliveryBoySelection): boolean {
  if (selection.mode === 'existing') return Boolean(selection.deliveryResourceId);
  if (selection.mode === 'new') {
    return (
      selection.deliveryBoyName.trim().length > 0 &&
      selection.deliveryBoyPhone.trim().length >= 8
    );
  }
  return false;
}

/** Build assign payload fields from selection. */
export function deliveryBoyAssignFields(selection: DeliveryBoySelection): {
  deliveryResourceId?: string;
  deliveryBoyName?: string;
  deliveryBoyPhone?: string;
} {
  if (selection.mode === 'existing') {
    return { deliveryResourceId: selection.deliveryResourceId };
  }
  if (selection.mode === 'new') {
    return {
      deliveryBoyName: selection.deliveryBoyName.trim(),
      deliveryBoyPhone: selection.deliveryBoyPhone.trim(),
    };
  }
  return {};
}
