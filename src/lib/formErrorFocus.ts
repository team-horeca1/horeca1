/**
 * Scroll to and focus the first invalid form field.
 */

export interface FocusFormErrorOptions {
  /** Preferred field order when multiple errors exist. */
  fieldOrder?: string[];
  /** Prefix for element ids, e.g. "ff-" → id="ff-phone". */
  idPrefix?: string;
  /** data-field attribute selector instead of id. */
  dataField?: boolean;
}

function resolveElement(field: string, options: FocusFormErrorOptions): HTMLElement | null {
  const { idPrefix = 'ff-', dataField = false } = options;
  if (dataField) {
    return document.querySelector<HTMLElement>(`[data-field="${field}"]`);
  }
  return document.getElementById(`${idPrefix}${field}`);
}

/** Scroll to the first field with an error and focus its control. */
export function focusFirstFormError(
  errors: Record<string, string>,
  options: FocusFormErrorOptions = {},
): void {
  const keys = Object.keys(errors).filter((k) => k !== '_server' && errors[k]);
  if (keys.length === 0) return;

  const field =
    options.fieldOrder?.find((f) => errors[f]) ??
    keys[0];

  setTimeout(() => {
    const el = resolveElement(field, options);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true });
  }, 60);
}
