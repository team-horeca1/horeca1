import { z } from 'zod';

// Accepts "+919892392597", "919892392597", "09892392597", or "9892392597".
// Services normalize to the canonical 10-digit form via lib/phone.ts before storing.
const PHONE_INPUT_RE = /^(\+?91|0)?[6-9]\d{9}$/;

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(PHONE_INPUT_RE, 'Invalid phone number').optional(),
  role: z.enum(['customer', 'vendor']).default('customer'),
  pincode: z.string().regex(/^\d{6}$/, 'Invalid pincode').optional(),
  businessName: z.string().optional(),
  gstNumber: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export const otpRequestSchema = z.object({
  phone: z.string().regex(PHONE_INPUT_RE, 'Invalid phone number'),
});

export const otpVerifySchema = z.object({
  phone: z.string().regex(PHONE_INPUT_RE),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().regex(PHONE_INPUT_RE).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  businessName: z.string().optional(),
  gstNumber: z.string().optional(),
  image: z.string().url().optional(),
  verificationToken: z.string().min(1).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
