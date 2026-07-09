import { describe, it, expect } from 'vitest';
import { buildInvoiceLineItems, type InvoiceLineInput } from '../invoice-items';

// A line whose SNAPSHOT (order-time) values diverge from the current LIVE product.
// A correct invoice must show the snapshot (old) values, not the edited live ones.
function lineWithDivergentEdit(overrides: Partial<InvoiceLineInput> = {}): InvoiceLineInput {
  return {
    productName: 'Basmati Rice 5kg', // snapshot name
    hsn: '1006', // snapshot HSN
    packSize: 'Bag', // snapshot UoM
    taxPercent: 5, // snapshot tax
    categoryName: 'Rice & Grains', // snapshot category
    quantity: 3,
    fulfilledQty: 2,
    // Order lines store GROSS (inc-GST). 100 taxable @ 5% → 105 gross.
    unitPrice: 105,
    product: {
      // Live product was edited AFTER the order:
      hsn: '9999',
      unit: 'Carton',
      packSize: 'Carton',
      taxPercent: 18,
      category: { name: 'Edited Category' },
    },
    ...overrides,
  };
}

describe('buildInvoiceLineItems — transaction immutability', () => {
  it('shows snapshot values, NOT the edited live product (the 6.4 regression)', () => {
    const [line] = buildInvoiceLineItems({ isPartial: false, items: [lineWithDivergentEdit()] });
    expect(line.category).toBe('Rice & Grains'); // not 'Edited Category'
    expect(line.hsn).toBe('1006'); // not '9999'
    expect(line.taxPercent).toBe(5); // not 18
    expect(line.unit).toBe('Bag'); // not 'Carton'
    expect(line.productName).toBe('Basmati Rice 5kg');
  });

  it('falls back to the live product only when the snapshot value is null (legacy rows)', () => {
    const [line] = buildInvoiceLineItems({
      isPartial: false,
      items: [lineWithDivergentEdit({ categoryName: null, hsn: null, taxPercent: null, packSize: null })],
    });
    expect(line.category).toBe('Edited Category');
    expect(line.hsn).toBe('9999');
    expect(line.taxPercent).toBe(18);
    expect(line.unit).toBe('Carton');
  });

  it("uses 'Other' when neither snapshot nor live category exists", () => {
    const [line] = buildInvoiceLineItems({
      isPartial: false,
      items: [lineWithDivergentEdit({ categoryName: null, product: { hsn: null, unit: null, packSize: null, taxPercent: null, category: null } })],
    });
    expect(line.category).toBe('Other');
  });

  it('bills fulfilledQty on partial orders and drops zero-qty lines', () => {
    const items = [
      lineWithDivergentEdit({ fulfilledQty: 2 }),
      lineWithDivergentEdit({ fulfilledQty: 0 }),
    ];
    const lines = buildInvoiceLineItems({ isPartial: true, items });
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
    expect(lines[0].preTax).toBe(200); // taxable 100 × 2 (backed out from gross 105)
  });

  it('bills ordered quantity on non-partial orders', () => {
    const [line] = buildInvoiceLineItems({ isPartial: false, items: [lineWithDivergentEdit()] });
    expect(line.quantity).toBe(3);
    expect(line.unitPrice).toBeCloseTo(100, 5); // taxable after back-out
    expect(line.total).toBeCloseTo(315, 5); // 300 taxable + 5% tax
  });
});
