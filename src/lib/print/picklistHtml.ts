/** Shared printable PICK SLIP HTML (Orders picklist + delivery boy print). */

export type PicklistHtmlItem = {
  productName: string;
  sku?: string | null;
  pack?: string | null;
  qty: number;
};

export type PicklistHtmlInput = {
  orderNumber: string;
  customerName: string;
  customerPhone?: string | null;
  address?: string | null;
  items: PicklistHtmlItem[];
  /** When true, include auto-print script (vendor API window). */
  autoPrint?: boolean;
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPicklistHtml(input: PicklistHtmlInput): string {
  const orderNumber = escapeHtml(input.orderNumber);
  const customerName = escapeHtml(input.customerName || 'Customer');
  const phone = input.customerPhone ? escapeHtml(input.customerPhone) : '';
  const address = input.address?.trim()
    ? escapeHtml(input.address.trim())
    : null;

  const rows = input.items
    .map((item, idx) => {
      const name = escapeHtml(item.productName);
      const sku = escapeHtml(item.sku?.trim() || '—');
      const pack = escapeHtml(item.pack?.trim() || '—');
      const qty = Number.isFinite(item.qty) ? item.qty : 0;
      return `<tr><td>${idx + 1}</td><td>${name}</td><td>${sku}</td><td>${pack}</td><td style="text-align:center;font-weight:bold">${qty}</td><td></td></tr>`;
    })
    .join('');

  const customerLine = phone
    ? `Customer: ${customerName} · ${phone}`
    : `Customer: ${customerName}`;

  const addressBlock = address ? `<p>Address: ${address}</p>` : '';
  const printScript = input.autoPrint
    ? '<script>window.onload=()=>window.print()</script>'
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Picklist ${orderNumber}</title>
<style>body{font-family:monospace;font-size:12px;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:4px}h1{font-size:18px;margin:0 0 12px}</style></head>
<body><h1>PICK SLIP — ${orderNumber}</h1>
<p>${customerLine}</p>
${addressBlock}
<table><thead><tr><th>#</th><th>Product</th><th>SKU</th><th>Pack</th><th>Qty</th><th>Picked</th></tr></thead><tbody>${rows}</tbody></table>
${printScript}</body></html>`;
}

/** Open a blank window, write picklist HTML, and trigger print. */
export function openPicklistPrintWindow(html: string): boolean {
  if (typeof window === 'undefined') return false;
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Give the document a tick to paint before print (autoPrint may already fire).
  try {
    win.focus();
    if (!html.includes('window.print()')) {
      win.print();
    }
  } catch {
    /* popup blockers / restricted frames */
  }
  return true;
}
