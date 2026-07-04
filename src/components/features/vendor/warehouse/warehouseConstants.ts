export const WAREHOUSE_STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  printed: 'bg-blue-50 text-blue-700 border-blue-100',
  picked: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  cancelled: 'bg-[#FDF2F2] text-[#EF4444] border-[#FEE2E2]',
  pending: 'bg-[#FFF8EB] text-[#D97706] border-[#FEF3C7]',
  out_for_delivery: 'bg-purple-50 text-purple-700 border-purple-100',
  delivered: 'bg-[#EEF8F1] text-[#299E60] border-[#D1FAE5]',
  received: 'bg-[#EEF8F1] text-[#299E60] border-[#D1FAE5]',
};

export type WarehouseTab = 'picklists' | 'dispatches' | 'grn';

export interface PicklistItem {
  productId: string;
  productName: string;
  qty: number;
}

export interface GrnLine {
  productId: string;
  productName: string;
  qty: number;
}

export interface OrderLookup {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount?: number | string;
  user?: { fullName: string; businessName: string | null };
}

export interface ProductLookup {
  id: string;
  name: string;
  sku: string | null;
  basePrice?: number | string;
}
