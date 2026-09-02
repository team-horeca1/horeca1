'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ConfirmTone = 'danger' | 'primary';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx;
}

interface PendingPrompt {
  opts: ConfirmOptions;
  resolve: (v: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingPrompt | null>(null);

  const confirm: ConfirmFn = useCallback((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve });
    });
  }, []);

  // Resolve via the functional-updater form so we always see the latest pending
  // prompt, even if multiple confirm() calls are queued in quick succession.
  const close = useCallback((result: boolean) => {
    setPending((p) => {
      p?.resolve(result);
      return null;
    });
  }, []);

  const tone: ConfirmTone = pending?.opts.tone ?? 'danger';
  const confirmBg =
    tone === 'danger'
      ? 'bg-error hover:bg-[#b91c1c]'
      : 'bg-primary hover:bg-primary-dark';
  const iconBg = tone === 'danger' ? 'bg-[#FEE2E2] text-error' : 'bg-primary-light text-primary';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[50000] flex items-end justify-center lg:items-center bg-black/45 p-0 lg:p-4"
          onClick={() => close(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white w-full max-w-[420px] rounded-t-[20px] lg:rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lg:hidden flex justify-center pt-3 pb-1">
              <span className="w-9 h-1 rounded-full bg-[#D1D5DB]" />
            </div>
            <div className="relative p-6 pb-5">
              <button
                onClick={() => close(false)}
                className="absolute top-3 right-3 size-12 lg:size-8 flex items-center justify-center rounded-full hover:bg-ivory text-[#667085]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
              <div className="flex items-start gap-4">
                <div className={cn('w-12 h-12 rounded-full flex items-center justify-center shrink-0', iconBg)}>
                  <AlertTriangle size={22} />
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <h3 className="text-[17px] font-bold text-[#181725] leading-tight mb-1.5">
                    {pending.opts.title ?? 'Are you sure?'}
                  </h3>
                  <p className="text-[13.5px] text-[#7C7C7C] leading-relaxed">{pending.opts.message}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-ivory border-t border-divider">
              <button
                onClick={() => close(false)}
                className="min-h-12 px-5 bg-white border border-divider text-[#1C1C1C] rounded-[12px] text-[13px] font-semibold hover:bg-white"
              >
                {pending.opts.cancelText ?? 'Cancel'}
              </button>
              <button
                onClick={() => close(true)}
                autoFocus
                className={cn('min-h-12 px-5 text-white rounded-[12px] text-[13px] font-semibold active:scale-[0.97] transition-transform', confirmBg)}
              >
                {pending.opts.confirmText ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
