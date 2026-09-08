import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/middleware/auth';
import { errorResponse } from '@/middleware/errorHandler';
import {
  effectiveCustomerUserId,
  effectiveCustomerBusinessAccountId,
} from '@/lib/resolveCustomerImpersonation';
import { completeCustomerProfile } from '@/lib/completeProfile';
import { GST_RE, PAN_RE } from '@/lib/validators/vendor-kyc';

export const dynamic = 'force-dynamic';

const optionalStr = z.string().optional();

const CompleteProfileBody = z.object({
  salutation: optionalStr,
  designation: optionalStr,
  businessType: z.string().max(50).optional(),
  subType: z.string().max(80).optional(),
  cuisine: z.string().max(120).optional(),
  workPhone: optionalStr,
  password: optionalStr,
  gstTreatment: optionalStr,
  placeOfSupply: optionalStr,
  gstin: z.string().max(15).optional(),
  pan: z.string().max(10).optional(),
  fssaiNumber: z.string().max(50).optional(),
  outletName: optionalStr,
  addressLine: optionalStr,
  flatInfo: optionalStr,
  landmark: optionalStr,
  city: optionalStr,
  state: optionalStr,
  pincode: optionalStr,
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  placeId: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  const gstin = (data.gstin ?? '').trim().toUpperCase();
  if (gstin && !GST_RE.test(gstin)) {
    ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'Format: 22ABCDE1234F1Z5' });
  }
  const pan = (data.pan ?? '').trim().toUpperCase();
  if (pan && !PAN_RE.test(pan)) {
    ctx.addIssue({ code: 'custom', path: ['pan'], message: 'Format: ABCDE1234F' });
  }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = CompleteProfileBody.parse(await req.json());
    const userId = effectiveCustomerUserId(ctx);
    const result = await completeCustomerProfile(
      userId,
      effectiveCustomerBusinessAccountId(ctx),
      body,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
});
