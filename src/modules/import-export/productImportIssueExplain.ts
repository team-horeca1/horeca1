/**
 * Maps raw product-import error strings into user-facing reason + fix copy.
 * Used by ProductImportModal (admin + vendor) so every failure shows what
 * went wrong and how to fix it — not just the Zod/Prisma message.
 */

export type ImportIssueSeverity = 'error' | 'warning' | 'info';

export interface ExplainedImportIssue {
  severity: ImportIssueSeverity;
  /** Short label for the card header */
  title: string;
  /** What happened */
  reason: string;
  /** Concrete next step */
  solution: string;
}

interface Rule {
  test: (message: string, field?: string) => boolean;
  explain: (message: string, field?: string) => ExplainedImportIssue;
}

const RULES: Rule[] = [
  {
    test: (m) => /expected string, received undefined/i.test(m) || /expected number, received undefined/i.test(m),
    explain: (_m, field) => ({
      severity: 'error',
      title: 'Missing or wrong column',
      reason: field
        ? `Column “${field}” is empty or the sheet header does not match what import expects.`
        : 'A required value is missing — often because the spreadsheet headers do not match the template.',
      solution:
        'Download the latest product template (or re-export your catalog) and keep headers like Item Name, Taxable Rate / Net Rate, Parent Category, Sub-Category. Do not rename columns.',
    }),
  },
  {
    test: (m) => /product name is required/i.test(m) || /item name is required/i.test(m),
    explain: () => ({
      severity: 'error',
      title: 'Product name missing',
      reason: 'Every row needs a product name.',
      solution: 'Fill the “Item Name” (or “Product Name”) column for this row, then re-upload or fix it in the review grid.',
    }),
  },
  {
    test: (m) => /taxable rate must be > 0/i.test(m) || /taxable rate/i.test(m) && /required|must/i.test(m),
    explain: () => ({
      severity: 'error',
      title: 'Price missing or zero',
      reason: 'Taxable (net) rate must be a number greater than zero.',
      solution: 'Set “Taxable Rate”, “Net Rate”, or “Taxable Rate (Amt)” to the pre-tax unit price (e.g. 100). Gross/MRP alone is not enough.',
    }),
  },
  {
    test: (m) => /sub-category required/i.test(m) || /pick a valid sub-category/i.test(m),
    explain: () => ({
      severity: 'error',
      title: 'Sub-category required',
      reason: 'Parent category was set without a leaf sub-category. Products must map to a sub-category (2-level tree).',
      solution: 'Fill “Sub-Category” with an exact name under that parent (see the Categories sheet in the export), or pick it in the review grid before importing.',
    }),
  },
  {
    test: (m) => /parent.*sub-category|itself a sub-category|leaf category|assertLeafCategory/i.test(m),
    explain: () => ({
      severity: 'error',
      title: 'Invalid category level',
      reason: 'The category mapped for this product is not a valid leaf (sub-category), or a parent was used as the product category.',
      solution: 'Use Parent Category = root name and Sub-Category = child name. Do not put a root category alone in Sub-Category.',
    }),
  },
  {
    test: (m) => /categor(y|ies).*(not found|unknown|invalid)/i.test(m) || /no matching categor/i.test(m),
    explain: (m) => ({
      severity: 'error',
      title: 'Category not found',
      reason: m,
      solution: 'Copy the exact category name from Admin → Categories (or the Categories sheet in a product export). Spelling and spacing must match.',
    }),
  },
  {
    test: (m) => /sku.*(required|missing)/i.test(m) || (m.toLowerCase() === 'sku is required'),
    explain: () => ({
      severity: 'error',
      title: 'SKU required',
      reason: 'New products need a vendor/POS SKU.',
      solution: 'Fill the “SKU” column with your internal item code, then re-import.',
    }),
  },
  {
    test: (m) => /unique|already exists|duplicate/i.test(m),
    explain: (m) => ({
      severity: 'error',
      title: 'Duplicate product / SKU',
      reason: m,
      solution: 'Use a different SKU for new items, or keep the same SKU so the row updates the existing listing instead of creating a second one.',
    }),
  },
  {
    test: (m) => /moq/i.test(m),
    explain: (m) => ({
      severity: 'error',
      title: 'Invalid MOQ',
      reason: m,
      solution: 'Set “MOQ” to a whole number ≥ 1 (minimum order quantity).',
    }),
  },
  {
    test: (m) => /tax\s*%/i.test(m) || /tax percent/i.test(m),
    explain: (m) => ({
      severity: 'error',
      title: 'Invalid tax %',
      reason: m,
      solution: 'Set “Tax %” to a number between 0 and 100 (e.g. 5 or 12).',
    }),
  },
  {
    test: (m) => /veg|non-?veg|storage type/i.test(m),
    explain: (m) => ({
      severity: 'error',
      title: 'Invalid attribute',
      reason: m,
      solution: 'Veg / Non-Veg must be veg, nonveg, or egg. Storage type examples: Ambient, Chilled, Frozen.',
    }),
  },
  {
    test: (m) => /image/i.test(m),
    explain: (m) => ({
      severity: 'warning',
      title: 'Image issue',
      reason: m,
      solution: 'Put a full https Image URL, or an Image Name that exists under /uploads. You can also paste the URL in the review grid.',
    }),
  },
  {
    test: (m) => /no valid rows/i.test(m),
    explain: () => ({
      severity: 'error',
      title: 'No importable rows',
      reason: 'The file had no rows the importer could read.',
      solution: 'Use the downloadable product template, keep the header row, and ensure at least one data row has Item Name + Taxable Rate.',
    }),
  },
  {
    test: (m) => /took too long|timed out|rolled back/i.test(m),
    explain: (m) => ({
      severity: 'error',
      title: 'Import timed out',
      reason: m,
      solution:
        'Nothing from this attempt was kept. Try again with fewer rows, or use Commit valid rows anyway after fixing any real validation issues.',
    }),
  },
  {
    test: (m) => /master product|listing unique|already listed/i.test(m),
    explain: (m) => ({
      severity: 'error',
      title: 'Catalog listing conflict',
      reason: m,
      solution: 'This vendor already has a listing for that catalog item. Update the existing product instead of creating a duplicate.',
    }),
  },
  {
    test: (m) => /must be a positive number|must be an integer|must be a number/i.test(m),
    explain: (m, field) => ({
      severity: 'error',
      title: field ? `Invalid ${field}` : 'Invalid number',
      reason: m,
      solution: 'Use digits only in price/qty columns (no currency symbols). Clear empty cells that contain spaces or formulas that resolve blank.',
    }),
  },
];

export function explainProductImportIssue(
  message: string,
  field?: string,
): ExplainedImportIssue {
  const msg = (message || '').trim() || 'Unknown import error';
  for (const rule of RULES) {
    if (rule.test(msg, field)) return rule.explain(msg, field);
  }
  return {
    severity: 'error',
    title: field ? `Issue in ${field}` : 'Import issue',
    reason: msg,
    solution:
      'Fix this row in the review grid or in your spreadsheet, then try again. Prefer downloading the template so column names stay correct. If it keeps failing, download the error report CSV.',
  };
}

export interface ImportIssueInput {
  row: number;
  field?: string;
  message: string;
}

export interface GroupedImportIssue {
  key: string;
  explained: ExplainedImportIssue;
  rows: number[];
  /** First raw message (for detail / download alignment) */
  sampleMessage: string;
  field?: string;
}

/** Group identical problems so 40 “missing name” rows become one card with row list. */
export function groupProductImportIssues(errors: ImportIssueInput[]): GroupedImportIssue[] {
  const map = new Map<string, GroupedImportIssue>();
  for (const err of errors) {
    const explained = explainProductImportIssue(err.message, err.field);
    const key = `${explained.title}::${explained.solution}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.rows.includes(err.row)) existing.rows.push(err.row);
    } else {
      map.set(key, {
        key,
        explained,
        rows: [err.row],
        sampleMessage: err.message,
        field: err.field,
      });
    }
  }
  for (const g of map.values()) g.rows.sort((a, b) => a - b);
  return [...map.values()];
}
