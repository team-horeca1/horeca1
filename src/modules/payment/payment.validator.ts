import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum(['razorpay']),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

export const abandonPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
});
