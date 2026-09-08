/**
 * Complete-profile after customer self-register.
 * Updates optional BA / outlet / password fields without overwriting
 * identity collected at signup (name, legal name, display name, mobile).
 */

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { GST_RE, PAN_RE, PINCODE_RE } from '@/lib/validators/vendor-kyc';
import { mapToPrimaryOutlet } from '@/lib/customerProfileMapper';
import type { CustomerProfileInput } from '@/lib/validators/customer-profile';

function trim(v: string | undefined | null): string {
  return (v ?? '').trim();
}

function opt(v: string | undefined | null): string | null {
  const t = trim(v);
  return t || null;
}

export async function completeCustomerProfile(
  userId: string,
  fallbackBusinessAccountId: string | null,
  input: CustomerProfileInput,
) {
  const memberSelect = {
    businessAccountId: true,
    businessAccount: { select: { primaryOutletId: true } },
  } as const;

  let member = fallbackBusinessAccountId
    ? await prisma.businessAccountMember.findUnique({
        where: {
          userId_businessAccountId: {
            userId,
            businessAccountId: fallbackBusinessAccountId,
          },
        },
        select: memberSelect,
      })
    : null;

  if (!member) {
    member = await prisma.businessAccountMember.findFirst({
      where: { userId, isPrimary: true },
      select: memberSelect,
    });
  }

  const businessAccountId = member?.businessAccountId ?? fallbackBusinessAccountId;
  if (!businessAccountId) {
    throw Errors.notFound('Business account');
  }

  const gstin = trim(input.gstin).toUpperCase();
  const pan = trim(input.pan).toUpperCase();
  const pincode = trim(input.pincode || input.billingPincode);
  const password = trim(input.password);

  if (gstin && !GST_RE.test(gstin)) throw Errors.badRequest('Invalid GSTIN');
  if (pan && !PAN_RE.test(pan)) throw Errors.badRequest('Invalid PAN');
  if (pincode && !PINCODE_RE.test(pincode)) throw Errors.badRequest('Pincode must be 6 digits');
  if (password && password.length < 6) throw Errors.badRequest('Password must be at least 6 characters');

  const addressLine = trim(input.addressLine || input.billingAddressLine);
  const hasAddress = !!addressLine || !!pincode;
  const outletId = member?.businessAccount.primaryOutletId ?? null;

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  await prisma.$transaction(async (tx) => {
    await tx.businessAccount.update({
      where: { id: businessAccountId },
      data: {
        salutation: opt(input.salutation),
        designation: opt(input.designation),
        businessType: opt(input.businessType),
        subType: opt(input.subType),
        cuisine: opt(input.cuisine),
        workPhone: opt(input.workPhone),
        gstTreatment: opt(input.gstTreatment),
        placeOfSupply: opt(input.placeOfSupply),
        gstin: gstin || null,
        pan: pan || null,
        fssaiNumber: opt(input.fssaiNumber),
        ...(hasAddress
          ? {
              billingAddressLine: addressLine || null,
              billingCity: opt(input.city || input.billingCity),
              billingState: opt(input.state || input.billingState),
              billingPincode: pincode || null,
            }
          : {}),
      },
    });

    if (hasAddress && outletId) {
      const outlet = mapToPrimaryOutlet(input);
      await tx.outlet.update({
        where: { id: outletId },
        data: {
          name: outlet.name,
          addressLine: outlet.addressLine,
          flatInfo: outlet.flatInfo,
          landmark: outlet.landmark,
          city: outlet.city,
          state: outlet.state,
          pincode: outlet.pincode,
          latitude: outlet.latitude,
          longitude: outlet.longitude,
          placeId: outlet.placeId,
          requiresAddressUpdate: false,
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        ...(passwordHash ? { password: passwordHash } : {}),
        ...(pincode ? { pincode } : {}),
        ...(gstin ? { gstNumber: gstin } : {}),
        profileCompletedAt: new Date(),
      },
    });
  });

  return { profileCompletedAt: new Date() };
}
