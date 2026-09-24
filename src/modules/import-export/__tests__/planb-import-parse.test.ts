import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';
import { parseProductImport } from '../excel.service';
import { IMPORT_TX_OPTS } from '../import-commit';
import { explainProductImportIssue } from '../productImportIssueExplain';
import { friendlyErrorMessage } from '@/middleware/errorHandler';

describe('Plan B import template', () => {
  const buf = readFileSync(resolve(process.cwd(), 'error/PlanB_import_template.xlsx'));

  it('parses 11 products with 0 errors and real Excel sheet rows 3–13', () => {
    const { rows, errors } = parseProductImport(buf);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(11);
    expect(rows.map((r) => r.sheetRow)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(rows[0]!.name).toBe('Plan B Vegan Classic Slices 150 gm');
    expect(rows[10]!.name).toBe('Plan B Vegan Buttery Spread 200 gm');
  });
});

describe('import transaction budget', () => {
  it('uses a timeout well above Prisma’s 5s default', () => {
    expect(IMPORT_TX_OPTS.timeout).toBeGreaterThanOrEqual(60_000);
    expect(IMPORT_TX_OPTS.maxWait).toBeGreaterThanOrEqual(15_000);
  });
});

describe('P2028 messaging', () => {
  it('does not blame a delete when a transaction times out', () => {
    const msg = friendlyErrorMessage({ code: 'P2028' }, 'fallback');
    expect(msg).not.toMatch(/delete/i);
    expect(msg).toMatch(/took too long/i);
  });

  it('explains timeouts as import timed out, not delete', () => {
    const explained = explainProductImportIssue(
      'Import rolled back: This save took too long and was rolled back. Please try again.',
    );
    expect(explained.title).toBe('Import timed out');
    expect(explained.reason).not.toMatch(/delete/i);
    expect(explained.solution).toMatch(/Nothing from this attempt was kept/i);
  });
});
