/**
 * Complete-profile after customer self-register.
 * Updates optional BA / outlet / password fields without overwriting
 * identity collected at signup (name, legal name, display name, mobile).
 */

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/errorHandler';
import { GST_RE, PAN_RE, PINCODE_RE } from '@/lib/validators/vendor-kyc';
import { normalizeOutletName } from '@/lib/constants/customerProfile';
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
  const outletName = trim(input.outletName);

  if (gstin && !GST_RE.test(gstin)) throw Errors.badRequest('Invalid GSTIN');
  if (pan && !PAN_RE.test(pan)) throw Errors.badRequest('Invalid PAN');
  if (pincode && !PINCODE_RE.test(pincode)) throw Errors.badRequest('Pincode must be 6 digits');
  if (password && password.length < 6) throw Errors.badRequest('Password must be at least 6 characters');

  const addressLine = trim(input.addressLine || input.billingAddressLine);
  const hasAddress = !!addressLine || !!pincode;
  // Account billing prefers the billing fields; delivery is only the fallback.
  const billingLine = trim(input.billingAddressLine) || addressLine;
  const billingPincode = trim(input.billingPincode) || pincode;
  if (billingPincode && !PINCODE_RE.test(billingPincode)) {
    throw Errors.badRequest('Billing pincode must be 6 digits');
  }
  const outletId = member?.businessAccount.primaryOutletId ?? null;

  const normalizedOutletName = normalizeOutletName(outletName);
  if (hasAddress) {
    if (!normalizedOutletName) {
      throw Errors.badRequest('Enter a branch / outlet name before saving the address');
    }
    if (!addressLine || addressLine.length < 5) {
      throw Errors.badRequest('Enter the full delivery address');
    }
    if (!pincode || !PINCODE_RE.test(pincode)) {
      throw Errors.badRequest('Pincode must be 6 digits');
    }
  }

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
        businessSize: opt(input.businessSize),
        workPhone: opt(input.workPhone),
        gstTreatment: opt(input.gstTreatment),
        placeOfSupply: opt(input.placeOfSupply),
        gstin: gstin || null,
        pan: pan || null,
        fssaiNumber: opt(input.fssaiNumber),
        ...(hasAddress
          ? {
              billingAddressLine: billingLine || null,
              billingCity: opt(input.billingCity || input.city),
              billingState: opt(input.billingState || input.state),
              billingPincode: billingPincode || null,
            }
          : {}),
      },
    });

    if (hasAddress && outletId) {
      const ba = await tx.businessAccount.findUnique({
        where: { id: businessAccountId },
        select: { legalName: true },
      });
      const outlet = mapToPrimaryOutlet({
        ...input,
        // Lets the mapper drop a billingName that merely repeats the account name.
        legalName: input.legalName || ba?.legalName || undefined,
        outletName: normalizedOutletName,
        billingName: trim(input.billingName) || undefined,
      });
      const existing = await tx.outlet.findUnique({
        where: { id: outletId },
        select: { name: true },
      });
      // Prefer typed name; heal legacy "— Main" on the existing row if needed.
      const nextName =
        normalizeOutletName(outlet.name)
        || normalizeOutletName(existing?.name)
        || '';

      await tx.outlet.update({
        where: { id: outletId },
        data: {
          name: nextName,
          addressLine: outlet.addressLine,
          flatInfo: outlet.flatInfo,
          landmark: outlet.landmark,
          city: outlet.city,
          state: outlet.state,
          pincode: outlet.pincode,
          latitude: outlet.latitude,
          longitude: outlet.longitude,
          placeId: outlet.placeId,
          billingName: outlet.billingName,
          requiresAddressUpdate: false,
        },
      });

      // Keep SavedAddress in lockstep — storefront edit reads this row via the bridge.
      const savedPayload = {
        outletId,
        label: nextName || 'Outlet',
        businessName: outlet.billingName || ba?.legalName || nextName || null,
        fullAddress: outlet.addressLine,
        shortAddress: outlet.addressLine.split(',').slice(0, 2).join(', '),
        flatInfo: outlet.flatInfo,
        landmark: outlet.landmark,
        city: outlet.city,
        state: outlet.state,
        pincode: outlet.pincode,
        latitude: outlet.latitude ?? 0,
        longitude: outlet.longitude ?? 0,
        placeId: outlet.placeId,
        isDefault: true,
      };
      const existingSaved = await tx.savedAddress.findFirst({
        where: { OR: [{ outletId }, { userId, isDefault: true }] },
        orderBy: { isDefault: 'desc' },
      });
      if (existingSaved) {
        await tx.savedAddress.updateMany({
          where: { userId, isDefault: true, id: { not: existingSaved.id } },
          data: { isDefault: false },
        });
        await tx.savedAddress.update({
          where: { id: existingSaved.id },
          data: savedPayload,
        });
      } else {
        await tx.savedAddress.create({
          data: { userId, ...savedPayload },
        });
      }
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
