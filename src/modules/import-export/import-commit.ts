// Pure helpers for the two-pass bulk-import flow (validate-all → atomic commit).
// No prisma/IO here so the commit-planning + error-report logic is unit-testable.

import type { ImportError } from '@/modules/import-export/excel.service';

/**
 * Interactive transaction budget for product import commits.
 * Default Prisma timeout is 5s — too low for multi-row creates (inventory,
 * categories, slabs, master lock). Matches the pattern in userHardDelete.
 */
export const IMPORT_TX_OPTS = { maxWait: 15_000, timeout: 60_000 } as const;

export interface PartitionInput {
  /** All data row numbers in the sheet (1-based sheet rows, i.e. header is row 1). */
  rowNumbers: number[];
  /** Row numbers that failed validation (parse or business). */
  errorRowNumbers: number[];
  /** Row numbers the user chose to skip in the review table. */
  skipRowNumbers: number[];
  /** Commit valid rows even when some rows are invalid. */
  force: boolean;
}

export interface PartitionResult {
  /** Strict mode + at least one invalid row → commit nothing. */
  blocked: boolean;
  /** Rows to actually write (never includes invalid or user-skipped rows). */
  commitRowNumbers: number[];
  /** Invalid rows excluded from the commit (only when force = true). */
  skippedInvalid: number[];
  /** Rows the user explicitly skipped. */
  skippedByUser: number[];
}

/**
 * Decide which rows commit. Strict (force=false): ANY invalid row blocks the whole
 * import — commit nothing. Force=true (or no errors): commit every row that is neither
 * invalid nor user-skipped. Pure + deterministic.
 */
export function partitionImportRows(input: PartitionInput): PartitionResult {
  const errorSet = new Set(input.errorRowNumbers);
  const skipSet = new Set(input.skipRowNumbers);
  const hasErrors = errorSet.size > 0;

  if (hasErrors && !input.force) {
    return {
      blocked: true,
      commitRowNumbers: [],
      skippedInvalid: input.rowNumbers.filter((r) => errorSet.has(r)),
      skippedByUser: input.rowNumbers.filter((r) => skipSet.has(r)),
    };
  }

  const commitRowNumbers: number[] = [];
  const skippedInvalid: number[] = [];
  const skippedByUser: number[] = [];
  for (const r of input.rowNumbers) {
    if (skipSet.has(r)) skippedByUser.push(r);
    else if (errorSet.has(r)) skippedInvalid.push(r);
    else commitRowNumbers.push(r);
  }
  return { blocked: false, commitRowNumbers, skippedInvalid, skippedByUser };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = Array.isArray(value) ? value.join('; ') : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Original-row context for the error report, keyed by sheet/preview row number. */
export interface ImportErrorRowData {
  name?: string;
  sku?: string;
  hsn?: string;
  brand?: string;
  netRate?: number | string | null;
}

/**
 * Build a downloadable error-report CSV: one line per errored row with the original
 * row data (looked up by row number — alignment-proof, since the parser compacts/skips
 * rows) plus an `Errors` column joining all messages for that row. Rows without data
 * (e.g. parse failures) still get a line with their number + message.
 */
export function buildImportErrorReportCsv(
  rowData: Map<number, ImportErrorRowData>,
  errors: ImportError[],
): string {
  const byRow = new Map<number, string[]>();
  for (const e of errors) {
    const list = byRow.get(e.row) ?? [];
    list.push(e.field ? `${e.field}: ${e.message}` : e.message);
    byRow.set(e.row, list);
  }

  const header = ['Row', 'Item Name', 'SKU', 'HSN', 'Brand', 'Net Rate', 'Errors'];
  const lines = [header.map(csvCell).join(',')];

  for (const rowNum of [...byRow.keys()].sort((a, b) => a - b)) {
    const d = rowData.get(rowNum);
    lines.push(
      [rowNum, d?.name, d?.sku, d?.hsn, d?.brand, d?.netRate, byRow.get(rowNum)!.join(' | ')]
        .map(csvCell)
        .join(','),
    );
  }

  return lines.join('\r\n');
}
