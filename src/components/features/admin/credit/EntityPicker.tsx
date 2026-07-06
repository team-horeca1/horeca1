'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INPUT_CLS, type PickOption } from './adminCreditTypes';

const pasteCls =
  'w-full h-[38px] border border-[#EEEEEE] rounded-[10px] px-3 text-[12px] font-mono outline-none focus:border-[#299E60]/40 transition-colors bg-white placeholder:font-sans';

interface EntityPickerProps {
  value: string;
  onPick: (id: string) => void;
  search: (q: string) => Promise<PickOption[]>;
  placeholder?: string;
  nullOption?: string;
}

export function EntityPicker({ value, onPick, search, placeholder, nullOption }: EntityPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PickOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [chosenLabel, setChosenLabel] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await search(query);
        if (!cancelled) setResults(r);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, search]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const choose = (id: string, lbl: string) => {
    onPick(id);
    setChosenLabel(lbl);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'Search…'}
          className={cn(INPUT_CLS, 'pr-9 h-[40px] text-[13px]')}
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AEAEAE] pointer-events-none" size={16} />
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-[#EEEEEE] rounded-[10px] shadow-lg max-h-[240px] overflow-auto">
            {nullOption && (
              <button
                type="button"
                onClick={() => choose('', nullOption)}
                className="w-full text-left px-4 py-2.5 text-[13px] font-semibold text-[#181725] hover:bg-[#F8F9FB] border-b border-[#F2F2F2]"
              >
                {nullOption}
              </button>
            )}
            {loading ? (
              <div className="px-4 py-3 text-[13px] text-[#7C7C7C] flex items-center gap-2">
                <Loader2 className="animate-spin" size={14} /> Searching…
              </div>
            ) : results.length > 0 ? (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => choose(r.id, r.label)}
                  className="w-full text-left px-4 py-2.5 hover:bg-[#F8F9FB] transition-colors"
                >
                  <div className="text-[13px] font-semibold text-[#181725]">{r.label}</div>
                  <div className="text-[11px] text-[#7C7C7C] font-mono truncate">
                    {r.sub ? `${r.sub} · ` : ''}
                    {r.id}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-[13px] text-[#7C7C7C]">No matches found.</div>
            )}
          </div>
        )}
      </div>

      {value && chosenLabel && (
        <p className="mt-1.5 text-[11px] font-semibold text-[#299E60]">✓ {chosenLabel}</p>
      )}

      <button
        type="button"
        onClick={() => setShowPaste((s) => !s)}
        className="mt-2 text-[11px] font-semibold text-[#7C7C7C] hover:text-[#299E60] transition-colors"
      >
        {showPaste ? 'Hide manual ID entry' : 'Paste ID manually'}
      </button>

      {showPaste && (
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              onPick(e.target.value.trim());
              setChosenLabel(null);
            }}
            placeholder="Paste UUID here"
            className={pasteCls}
          />
          {value && (
            <button
              type="button"
              title="Clear"
              onClick={() => {
                onPick('');
                setChosenLabel(null);
              }}
              className="shrink-0 h-[38px] w-[38px] flex items-center justify-center rounded-[10px] border border-[#EEEEEE] text-[#AEAEAE] hover:text-[#E74C3C] hover:border-[#E74C3C]/40 transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
