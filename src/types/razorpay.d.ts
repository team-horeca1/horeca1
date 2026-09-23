// Single source of truth for the Razorpay checkout global (loaded from
// https://checkout.razorpay.com/v1/checkout.js). Declared once here instead of
// duplicated per-page (duplicate Window augmentations trip TS2687).
interface RazorpayCheckoutInstance {
  open(): void;
  on(
    event: string,
    handler: (response: { error?: { description?: string; reason?: string } }) => void,
  ): void;
}

interface Window {
  Razorpay: new (options: Record<string, unknown>) => RazorpayCheckoutInstance;
}
