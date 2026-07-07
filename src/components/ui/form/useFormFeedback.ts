'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { extractApiError, type ParsedApiError } from '@/lib/apiError';
import { focusFirstFormError, type FocusFormErrorOptions } from '@/lib/formErrorFocus';

export interface ApplyErrorOptions extends FocusFormErrorOptions {
  /** Run after field errors are set (e.g. switch tab/step). */
  onFieldError?: (field: string | undefined, fields: Record<string, string>) => void;
  /** Show sonner toast (default true). */
  toast?: boolean;
}

export function useFormFeedback() {
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearErrors = useCallback(() => {
    setBannerError(null);
    setFieldErrors({});
  }, []);

  const applyParsedError = useCallback(
    (parsed: ParsedApiError, options: ApplyErrorOptions = {}) => {
      const { toast: showToast = true, onFieldError, ...focusOpts } = options;
      setBannerError(parsed.message);

      const fields = parsed.fields ?? (parsed.field ? { [parsed.field]: parsed.message } : {});
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields);
        onFieldError?.(parsed.field, fields);
        focusFirstFormError(fields, focusOpts);
      }

      if (showToast) toast.error(parsed.message);
      return parsed;
    },
    [],
  );

  const applyApiError = useCallback(
    (json: unknown, options: ApplyErrorOptions = {}) => {
      return applyParsedError(extractApiError(json), options);
    },
    [applyParsedError],
  );

  const applyValidationErrors = useCallback(
    (
      errors: Record<string, string>,
      message?: string,
      options: ApplyErrorOptions = {},
    ) => {
      const msg = message ?? 'Please fix the highlighted fields';
      setBannerError(msg);
      setFieldErrors(errors);
      const firstField = Object.keys(errors).find((k) => k !== '_server' && errors[k]);
      options.onFieldError?.(firstField, errors);
      focusFirstFormError(errors, options);
      if (options.toast !== false) toast.error(msg);
      return msg;
    },
    [],
  );

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      const remaining = Object.keys(next).filter((k) => k !== '_server' && next[k]);
      if (remaining.length === 0) setBannerError(null);
      return next;
    });
  }, []);

  return {
    bannerError,
    fieldErrors,
    setFieldErrors,
    setBannerError,
    clearErrors,
    clearFieldError,
    applyApiError,
    applyValidationErrors,
    applyParsedError,
  };
}
