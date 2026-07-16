/** Stable JSON key order for permission-matrix equality checks. */
export function sortPermissionJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortPermissionJson);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, sortPermissionJson(val)]),
    );
  }
  return v;
}
