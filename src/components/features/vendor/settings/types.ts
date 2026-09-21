export interface ServiceArea {
  id: string;
  pincode: string;
  isActive: boolean;
  outletId?: string | null;
  cityLabel?: string | null;
  areaLabel?: string | null;
  deliversMon?: boolean;
  deliversTue?: boolean;
  deliversWed?: boolean;
  deliversThu?: boolean;
  deliversFri?: boolean;
  deliversSat?: boolean;
  deliversSun?: boolean;
  cutoffTime?: string;
  thirdPartyDeliveryAvailable?: boolean;
}

export interface DeliverySlot {
  id: string;
  dayOfWeek: number;
  slotStart: string;
  slotEnd: string;
  cutoffTime: string;
  isActive: boolean;
  outletId?: string | null;
}

export interface VendorSettings {
  id: string;
  businessName: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  minOrderValue: number;
  creditEnabled: boolean;
  vendorType: string | null;
  multiWarehouseEnabled: boolean;
  autoDisableOos: boolean;
  deliveryFee: number;
  freeDeliveryAbove: number | null;
  selfPickupOffered?: boolean;
  deliverThroughPublicHolidays?: boolean;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  addressPincode: string | null;
  gstNumber: string | null;
  pickupAddressLine?: string | null;
  pickupCity?: string | null;
  pickupState?: string | null;
  pickupPincode?: string | null;
  serviceAreas: ServiceArea[];
  deliverySlots: DeliverySlot[];
  user: { email: string; phone: string | null; fullName: string };
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  bankAccountType: string | null;
}

export interface VendorDocument {
  id: string;
  type: 'fssai' | 'gst' | 'pan' | 'bank_proof' | 'other';
  fileUrl: string;
  fileName: string;
  status: string;
  adminNote: string | null;
  uploadedAt: string;
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  fssai: 'FSSAI License',
  gst: 'GST Certificate',
  pan: 'PAN Card',
  bank_proof: 'Bank Proof',
  other: 'Other Document',
};

export function formatTime(t: string): string {
  const match = t.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return t;
  const h = parseInt(match[1], 10);
  return `${h % 12 || 12}:${match[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

export type SettingsTabId = 'store' | 'delivery' | 'payments' | 'policies' | 'documents';

export const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: 'store', label: 'Store' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'payments', label: 'Payments' },
  { id: 'policies', label: 'Policies' },
  { id: 'documents', label: 'Documents' },
];
