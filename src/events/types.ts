// All event type definitions for the HoReCa1 event bus
// Each module emits events that other modules can listen to

export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  vendorId: string;
  totalAmount: number;
  items: Array<{ productId: string; quantity: number }>;
}

export interface OrderConfirmedPayload {
  orderId: string;
  userId: string;
  vendorId: string;
}

export interface OrderShippedPayload {
  orderId: string;
  userId: string;
  vendorId: string;
}

export interface OrderDeliveredPayload {
  orderId: string;
  userId: string;
  vendorId: string;
}

export interface OrderCancelledPayload {
  orderId: string;
  userId: string;
  vendorId: string;
  reason?: string;
}

// B-4: the remaining lifecycle transitions now carry events + listeners so
// every status change notifies the customer (no more silently-dropped emits).
export interface OrderProcessingPayload { orderId: string; userId: string; vendorId: string; }
export interface OrderReadyForDispatchPayload { orderId: string; userId: string; vendorId: string; }
export interface OrderPartiallyDeliveredPayload { orderId: string; userId: string; vendorId: string; }
export interface OrderReturnedPayload { orderId: string; userId: string; vendorId: string; }

// V2.2 Phase 5 — delivery OTP issued to the customer. The listener delivers
// the code over SMS + email + in-app so they can read it to the delivery
// agent, who enters it to confirm handover.
export interface OrderDeliveryOtpPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  vendorId: string;
  otp: string;
}

export interface PaymentReceivedPayload {
  orderId: string;
  paymentId: string;
  userId: string;
  vendorId: string;
  amount: number;
}

export interface PaymentFailedPayload {
  orderId: string;
  userId: string;
  vendorId: string;
  reason: string;
}

export interface StockUpdatedPayload {
  productId: string;
  vendorId: string;
  qtyAvailable: number;
  lowStockThreshold: number;
}

export interface CreditAppliedPayload {
  creditAccountId: string;
  orderId: string;
  userId: string;
  vendorId: string;
  amount: number;
}

export interface CreditDuePayload {
  creditAccountId: string;
  userId: string;
  vendorId: string;
  amount: number;
  dueDate: string;
}

export interface UserRegisteredPayload {
  userId: string;
  email: string;
  role: string;
  /** Present when the new user arrived via `/invite/<token>`. */
  referralToken?: string;
}

export interface VendorOnboardedPayload {
  vendorId: string;
  userId: string;
  businessName: string;
}

export interface ListOrderedPayload {
  listId: string;
  userId: string;
  vendorId: string;
  orderId: string;
}

export interface ListCreatedPayload {
  listId: string;
  userId: string;
  vendorId: string;
  name: string;
}

export interface ProductSubmittedPayload {
  productId: string;
  vendorId: string;
  productName: string;
}

export interface ProductApprovedPayload {
  productId: string;
  vendorId: string;
  productName: string;
  approvedBy: string;
}

export interface ProductRejectedPayload {
  productId: string;
  vendorId: string;
  productName: string;
  rejectedBy: string;
  reason?: string;
}

export interface ProductEditSubmittedPayload {
  productId: string;
  vendorId: string;
  productName: string;
}

export interface ProductEditApprovedPayload {
  productId: string;
  vendorId: string;
  productName: string;
  approvedBy: string;
}

export interface ProductEditRejectedPayload {
  productId: string;
  vendorId: string;
  productName: string;
  rejectedBy: string;
  reason?: string;
}

export interface MasterProductSyncedToVendorPayload {
  masterProductId: string;
  productId: string;
  vendorId: string;
  productName: string;
}

export interface CategorySuggestedPayload {
  categoryId: string;
  categoryName: string;
  suggestedBy: string;
}

export interface CategoryApprovedPayload {
  categoryId: string;
  categoryName: string;
  approvedBy: string;
  suggestedBy?: string;
}

export interface CategoryRejectedPayload {
  categoryId: string;
  categoryName: string;
  rejectedBy: string;
  suggestedBy?: string;
  reason?: string;
}

export interface BrandCreatedPayload {
  brandId: string;
  userId: string;
  brandName: string;
}

export interface BrandApprovedPayload {
  brandId: string;
  brandName: string;
  approvedBy: string;
}

export interface BrandRejectedPayload {
  brandId: string;
  brandName: string;
  rejectedBy: string;
  reason?: string;
}

// A lightweight (account-less) brand was auto-created from a product import or
// vendor add and needs admin approval before its products can go live.
export interface BrandSuggestedPayload {
  brandId: string;
  brandName: string;
  suggestedBy?: string;
}

export interface BrandProductCreatedPayload {
  brandMasterProductId: string;
  brandId: string;
  productName: string;
}

export interface BrandProductMappedPayload {
  mappingId: string;
  brandId: string;
  brandMasterProductId: string;
  distributorProductId: string;
  confidenceScore: number;
  status: string;
}

export interface BrandDistributorInviteCreatedPayload {
  inviteId: string;
  brandId: string;
  businessName: string;
  email: string;
}

// Event map: event name → payload type
export interface EventMap {
  OrderCreated: OrderCreatedPayload;
  OrderConfirmed: OrderConfirmedPayload;
  OrderProcessing: OrderProcessingPayload;
  OrderReadyForDispatch: OrderReadyForDispatchPayload;
  OrderShipped: OrderShippedPayload;
  OrderPartiallyDelivered: OrderPartiallyDeliveredPayload;
  OrderDelivered: OrderDeliveredPayload;
  OrderReturned: OrderReturnedPayload;
  OrderCancelled: OrderCancelledPayload;
  OrderDeliveryOtp: OrderDeliveryOtpPayload;
  PaymentReceived: PaymentReceivedPayload;
  PaymentFailed: PaymentFailedPayload;
  StockUpdated: StockUpdatedPayload;
  CreditApplied: CreditAppliedPayload;
  CreditDue: CreditDuePayload;
  UserRegistered: UserRegisteredPayload;
  VendorOnboarded: VendorOnboardedPayload;
  ListOrdered: ListOrderedPayload;
  ListCreated: ListCreatedPayload;
  ProductSubmitted: ProductSubmittedPayload;
  ProductApproved: ProductApprovedPayload;
  ProductRejected: ProductRejectedPayload;
  ProductEditSubmitted: ProductEditSubmittedPayload;
  ProductEditApproved: ProductEditApprovedPayload;
  ProductEditRejected: ProductEditRejectedPayload;
  MasterProductSyncedToVendor: MasterProductSyncedToVendorPayload;
  CategorySuggested: CategorySuggestedPayload;
  CategoryApproved: CategoryApprovedPayload;
  CategoryRejected: CategoryRejectedPayload;
  BrandCreated: BrandCreatedPayload;
  BrandApproved: BrandApprovedPayload;
  BrandRejected: BrandRejectedPayload;
  BrandSuggested: BrandSuggestedPayload;
  BrandProductCreated: BrandProductCreatedPayload;
  BrandProductMapped: BrandProductMappedPayload;
  BrandDistributorInviteCreated: BrandDistributorInviteCreatedPayload;
}

export type EventName = keyof EventMap;
