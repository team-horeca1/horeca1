'use client';

/**
 * Shared form primitives — the single source of truth for every create /
 * register / onboarding form in the app (customer + vendor + brand register,
 * the admin create wizards, and the account modals).
 *
 * Before this module each form re-declared its own `Field` / `Input` / `inp`
 * with subtly different heights (42 vs 44 vs py-3), focus colours, and label
 * weights. Everything now flows through one CDL token set so the forms look identical.
 *
 * Tokens:
 *   height   44px        radius   10px
 *   bg       #FAFAFA → white on focus
 *   border   #E9E3DD     focus    #6B1D2E (ring + border)
 *   label    13px / medium / #667085 / sentence case
 *   accent   #6B1D2E
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { CDL } from '@/lib/cdl';
import { PasswordToggleButton } from './PasswordField';

export const FORM = {
  brand: CDL.primary,
  brandHover: CDL.primaryDark,
  primaryBtn:
    'bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl shadow-cdl-1 active:scale-[0.97] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px] px-6',
} as const;

const CONTROL_BASE =
  'w-full bg-white focus:bg-white border rounded-xl text-[15px] text-text placeholder:text-text-muted outline-none transition-all duration-150';
const CONTROL_OK =
  'border-divider focus:border-primary focus:ring-2 focus:ring-primary/10';
const CONTROL_ERR =
  'border-error focus:border-error focus:ring-2 focus:ring-error/10';
const CONTROL_DISABLED = 'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed';

/** Input/select height + padding. */
export function inputClass(hasError?: boolean, extra?: string) {
  return cn(CONTROL_BASE, 'h-[44px] px-3.5', hasError ? CONTROL_ERR : CONTROL_OK, CONTROL_DISABLED, extra);
}
/** Select shares the input look; extra right padding for the native arrow. */
export function selectClass(hasError?: boolean, extra?: string) {
  return cn(CONTROL_BASE, 'h-[44px] pl-3.5 pr-9 cursor-pointer', hasError ? CONTROL_ERR : CONTROL_OK, CONTROL_DISABLED, extra);
}
/** Multi-line, auto height. */
export function textareaClass(hasError?: boolean, extra?: string) {
  return cn(CONTROL_BASE, 'px-3.5 py-2.5 resize-none leading-relaxed', hasError ? CONTROL_ERR : CONTROL_OK, CONTROL_DISABLED, extra);
}

export const LABEL_CLASS = 'block text-[13px] font-medium text-text-secondary mb-1.5';

// ─── Label ──────────────────────────────────────────────────────────────────
export function FormLabel({
  children, required, hint, htmlFor, className,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn(LABEL_CLASS, className)}>
      {children}
      {required && <span className="text-red-400 normal-case ml-0.5">*</span>}
      {hint && <span className="ml-1 text-[10px] text-[#AEAEAE] normal-case font-normal">— {hint}</span>}
    </label>
  );
}

// ─── Field wrapper (label + control + error) ────────────────────────────────
export function FormField({
  label, required, hint, error, htmlFor, className, dataField, children,
}: {
  label?: React.ReactNode;
  required?: boolean;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  /** Used by focusFirstFormError — scroll target for validation errors. */
  dataField?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className} data-field={dataField}>
      {label && <FormLabel required={required} hint={hint} htmlFor={htmlFor}>{label}</FormLabel>}
      {children}
      {error && <p className="text-[11px] text-red-600 font-medium mt-1">{error}</p>}
    </div>
  );
}

// ─── Input ──────────────────────────────────────────────────────────────────
type NativeInput = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'className'>;
export interface FormInputProps extends NativeInput {
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
  /** Leading icon (lucide). Adds left padding. */
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  /** Element pinned to the right (e.g. password eye). Adds right padding. */
  rightSlot?: React.ReactNode;
  className?: string;
}

export function FormInput({
  value, onChange, hasError, icon: Icon, rightSlot, className, ...rest
}: FormInputProps) {
  return (
    <div className="relative group">
      {Icon && (
        <Icon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors pointer-events-none z-10" />
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass(hasError, cn(Icon && 'pl-10', rightSlot && 'pr-10', className))}
        {...rest}
      />
      {rightSlot && <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">{rightSlot}</div>}
    </div>
  );
}

// ─── Self-contained text field (label + input + error) ──────────────────────
export function TextField({
  label, required, hint, error, className, dataField, ...inputProps
}: {
  label?: React.ReactNode;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  dataField?: string;
} & FormInputProps) {
  return (
    <FormField label={label} required={required} hint={hint} error={error} className={className} dataField={dataField}>
      <FormInput hasError={!!error} {...inputProps} />
    </FormField>
  );
}

// ─── Select ─────────────────────────────────────────────────────────────────
type NativeSelect = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'className'>;
export function FormSelect({
  value, onChange, hasError, className, children, ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
  className?: string;
  children: React.ReactNode;
} & NativeSelect) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass(hasError, className)} {...rest}>
      {children}
    </select>
  );
}

// ─── Textarea ───────────────────────────────────────────────────────────────
type NativeTextarea = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value' | 'className'>;
export function FormTextarea({
  value, onChange, hasError, className, rows = 3, ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
  className?: string;
} & NativeTextarea) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={textareaClass(hasError, className)} {...rest} />
  );
}

// ─── Phone (+91 prefixed) ───────────────────────────────────────────────────
export function PhoneInput({
  value, onChange, hasError, placeholder = '10 digit mobile number', className, ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
  placeholder?: string;
  className?: string;
} & NativeInput) {
  return (
    <div className="relative flex items-center group">
      <span className="absolute left-4 text-[13px] font-semibold text-text-muted group-focus-within:text-primary transition-colors select-none z-10">+91</span>
      <input
        type="tel"
        inputMode="numeric"
        maxLength={10}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
        placeholder={placeholder}
        className={inputClass(hasError, cn('pl-12', className))}
        {...rest}
      />
    </div>
  );
}

// ─── Section / group heading ────────────────────────────────────────────────
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[13px] font-semibold text-text-secondary', className)}>{children}</p>;
}

export { PasswordField, PasswordToggleButton } from './PasswordField';
export { FormErrorBanner } from './FormErrorBanner';
export { useFormFeedback, type ApplyErrorOptions } from './useFormFeedback';

export function PasswordInput({ value, onChange, hasError, className, ...rest }: FormInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <FormInput
      value={value}
      onChange={onChange}
      hasError={hasError}
      type={visible ? 'text' : 'password'}
      className={className}
      rightSlot={
        <PasswordToggleButton
          visible={visible}
          onToggle={() => setVisible((v) => !v)}
          className="static translate-y-0"
        />
      }
      {...rest}
    />
  );
}
