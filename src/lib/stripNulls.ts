/** Remove null values from a plain object before Zod parse (`.optional()` rejects null). */
export function stripNulls<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    const val = out[key];
    if (val === null) {
      delete out[key];
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = stripNulls(val as Record<string, unknown>);
    }
  }
  return out as T;
}
