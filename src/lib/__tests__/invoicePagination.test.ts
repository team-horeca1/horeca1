import { describe, expect, it } from 'vitest';
import PDFDocument from 'pdfkit';

/**
 * Smoke-test the pagination pattern used by generateInvoicePdf:
 * ensureSpace + height-capped text must not produce one page per cell.
 */
describe('invoice pagination pattern', () => {
  it('keeps many table rows on a small number of pages', async () => {
    const buf = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const LEFT = 30;
      const PAGE_W = doc.page.width - 60;
      const TOP = 40;
      const BOTTOM = 48;
      let y = 90;
      let inItemsTable = false;

      const drawHeader = () => {
        doc.rect(LEFT, y, PAGE_W, 28).stroke();
        doc.font('Helvetica-Bold').fontSize(8).text('Description', LEFT + 4, y + 8, {
          width: 200,
          height: 16,
          lineBreak: false,
        });
        y += 28;
      };

      const ensureSpace = (needed: number) => {
        if (y + needed <= doc.page.height - BOTTOM) return;
        doc.addPage();
        y = TOP;
        if (inItemsTable) drawHeader();
      };

      inItemsTable = true;
      drawHeader();

      for (let i = 0; i < 40; i++) {
        const rowH = 28;
        ensureSpace(rowH);
        doc.rect(LEFT, y, PAGE_W, rowH).stroke();
        doc.font('Helvetica').fontSize(8).text(
          `Product line ${i + 1} with a wrapping name that is intentionally long`,
          LEFT + 4,
          y + 6,
          { width: 200, height: rowH - 8 },
        );
        doc.text(String(i + 1), LEFT + 220, y + 6, {
          width: 40,
          height: rowH - 8,
          lineBreak: false,
        });
        y += rowH;
      }
      inItemsTable = false;

      ensureSpace(40);
      doc.font('Helvetica-Bold').fontSize(10).text('TOTAL 999.00', LEFT, y, {
        height: 14,
        lineBreak: false,
      });

      const range = doc.bufferedPageRange();
      expect(range.count).toBeGreaterThanOrEqual(1);
      expect(range.count).toBeLessThanOrEqual(3);

      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.font('Helvetica').fontSize(8).text(`Pg ${i + 1} of ${range.count}`, LEFT, 35, {
          width: PAGE_W,
          align: 'right',
          lineBreak: false,
        });
      }

      doc.end();
    });

    // PDF must contain a page count greater than one but far below the old 34-page blow-up.
    const text = buf.toString('latin1');
    const pageMarkers = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pageMarkers).toBeGreaterThanOrEqual(1);
    expect(pageMarkers).toBeLessThanOrEqual(3);
  });
});
