// GET  /api/v1/admin/users — List all users with pagination
// POST /api/v1/admin/users — Admin creates a customer/vendor without OTP
// WHY: Admin user management page — search users, filter by role, create accounts
// PROTECTED: Admin only
// SUPPORTS: ?role=customer|vendor|admin&search=&cursor=&limit=20

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { withRateLimit } from '@/middleware/withRateLimit';
import { provisionDefaultAccount } from '@/lib/provisionAccount';
import { companyProfileToBusinessAccountUpdate, contactPersonsFromCompanyProfile } from '@/lib/customerProfileMapper';
import { uniqueHcid } from '@/lib/hcid';
import { normalizePhone, phoneLookupVariants } from '@/lib/phone';
import { encryptAdminPassword } from '@/lib/adminPasswordCipher';
import type { Role, CreditStatus, Prisma } from '@prisma/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function vendorSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return `${base}-${Date.now().toString(36)}`;
}

export const GET = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'customers.view');
    const params = req.nextUrl.searchParams;
    const role = params.get('role') as Role | null;
    const search = params.get('search') || undefined;
    const pincode = params.get('pincode') || undefined;
    const salesExecutive = params.get('salesExecutive') || undefined;
    const salespersonId = params.get('salespersonId') || undefined;
    const creditStatus = params.get('creditStatus') || undefined;
    const area = params.get('area') || undefined;
    const tag = params.get('tag') || undefined;
    // P0-4: master-datasheet attribute filters.
    const businessType = params.get('businessType') || undefined;
    const businessSize = params.get('businessSize') || undefined;
    const leadStatus = params.get('leadStatus') || undefined;
    const cuisine = params.get('cuisine') || undefined;
    const cursor = params.get('cursor') || undefined;
    const limit = Math.min(Number(params.get('limit')) || 20, 100);

    // Build where clause. `Record<string, unknown>` is enough — every
    // shape we push in here is a valid Prisma where-clause fragment,
    // and the runtime call validates the shape anyway.
    const where: Record<string, unknown> = {};

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { businessName: { contains: search, mode: 'insensitive' } },
        { hcidDisplay: { contains: search, mode: 'insensitive' } },
      ];
    }

    const andConditions: Record<string, unknown>[] = [];

    if (pincode) {
      andConditions.push({
        OR: [
          { pincode: pincode },
          { accountMemberships: { some: { businessAccount: { outlets: { some: { pincode } } } } } },
        ],
      });
    }

    if (salesExecutive) {
      andConditions.push({
        vendorCustomers: { some: { salesExecutive: { contains: salesExecutive, mode: 'insensitive' } } },
      });
    }

    if (salespersonId) {
      andConditions.push({
        vendorCustomers: { some: { salespersonId } },
      });
    }

    if (creditStatus) {
      // creditStatus comes from the query string so it's typed `string`,
      // but Prisma wants the CreditStatus enum. Validate at the edge,
      // then narrow with the imported enum type.
      andConditions.push({
        creditAccounts: { some: { status: creditStatus as CreditStatus } },
      });
    }

    if (area) {
      andConditions.push({
        OR: [
          {
            accountMemberships: {
              some: {
                businessAccount: {
                  outlets: {
                    some: {
                      OR: [
                        { city: { contains: area, mode: 'insensitive' } },
                        { state: { contains: area, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              },
            },
          },
          { vendorCustomers: { some: { territory: { contains: area, mode: 'insensitive' } } } },
        ],
      });
    }

    if (tag) {
      andConditions.push({
        OR: [
          { vendorCustomers: { some: { tags: { has: tag } } } },
          { accountMemberships: { some: { businessAccount: {
            OR: [{ manualTags: { has: tag } }, { aiTags: { has: tag } }, { behaviourTags: { has: tag } }],
          } } } },
        ],
      });
    }

    // P0-4: filter by the new BusinessAccount attribute columns.
    const attrFilter = (field: string, value: string) => {
      andConditions.push({
        accountMemberships: { some: { businessAccount: { [field]: { contains: value, mode: 'insensitive' } } } },
      });
    };
    if (businessType) attrFilter('businessType', businessType);
    if (businessSize) attrFilter('businessSize', businessSize);
    if (leadStatus) attrFilter('leadStatus', leadStatus);
    if (cuisine) attrFilter('cuisine', cuisine);

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const users = await prisma.user.findMany({
      where,
      take: limit + 1, // Fetch one extra to determine if there's a next page
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor itself
      }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        businessName: true,
        gstNumber: true,
        pincode: true,
        isActive: true,
        hcidDisplay: true,
        createdAt: true,
        accountMemberships: {
          select: {
            isPrimary: true,
            businessAccount: {
              select: {
                id: true,
                legalName: true,
                displayName: true,
                gstin: true,
                pan: true,
                fssaiNumber: true,
                billingAddressLine: true,
                billingCity: true,
                billingState: true,
                billingPincode: true,
                status: true,
                businessType: true,
                subType: true,
                cuisine: true,
                businessSize: true,
                businessStructure: true,
                serviceModel: true,
                monthlyPurchaseBand: true,
                procurementFrequency: true,
                designation: true,
                leadStatus: true,
                creditType: true,
                manualTags: true,
                aiTags: true,
                behaviourTags: true,
                outlets: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    addressLine: true,
                    city: true,
                    state: true,
                    pincode: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
        vendorCustomers: {
          select: {
            id: true,
            vendorId: true,
            status: true,
            territory: true,
            salesExecutive: true,
            tags: true,
            paymentTerms: true,
          },
        },
        creditAccounts: {
          select: {
            id: true,
            vendorId: true,
            creditLimit: true,
            creditUsed: true,
            status: true,
          },
        },
      },
    });

    // Cursor pagination: if we got limit+1 results, there's a next page
    const hasMore = users.length > limit;
    if (hasMore) users.pop();

    const nextCursor = hasMore ? users[users.length - 1].id : null;

    return NextResponse.json({
      success: true,
      data: {
        users,
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// POST — admin creates a user (customer or vendor) without OTP
export const POST = withRateLimit(adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'users.create');
    const body = await req.json();

    const cp = body.companyProfile;
    const fullName = String(body.fullName ?? '').trim();
    const phone = normalizePhone(body.phone) ?? '';
    const rawEmail = String(body.email ?? '').trim().toLowerCase();
    const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : null;
    const businessName = String(body.businessName ?? (cp?.companyName ?? cp?.legalName ?? '')).trim() || null;
    const gstNumber = String(body.gstNumber ?? (cp?.gstin ?? '')).trim() || null;
    const pincode = String(body.pincode ?? (cp?.billingPincode ?? '')).trim() || null;
    const password = String(body.password ?? '');
    const role: Role = body.role === 'vendor' ? 'vendor' : 'customer';

    if (!fullName) throw Errors.badRequest('Full name is required');
    if (!/^\d{10}$/.test(phone)) throw Errors.badRequest('Enter a valid 10-digit phone number');
    if (rawEmail && !email) throw Errors.badRequest('Enter a valid email address');
    if (password && password.length < 6) throw Errors.badRequest('Password must be at least 6 characters');

    // Uniqueness checks — match all legacy phone representations.
    const phoneTaken = await prisma.user.findFirst({ where: { phone: { in: phoneLookupVariants(phone) } }, select: { id: true } });
    if (phoneTaken) {
      throw Errors.fieldError(
        'phone',
        'This mobile number is already registered. Search for the existing customer instead.',
      );
    }

    if (email) {
      const emailTaken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (emailTaken) {
        throw Errors.fieldError(
          'email',
          'This email is already registered. Search for the existing customer instead.',
        );
      }
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const adminPasswordCipher = password ? encryptAdminPassword(password) : null;
    const hcidDisplay = await uniqueHcid();

    const user = await prisma.user.create({
      data: {
        fullName,
        phone,
        email,
        businessName,
        gstNumber,
        pincode,
        password: passwordHash,
        adminPasswordCipher,
        role,
        isActive: true,
        hcidDisplay,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        businessName: true,
        isActive: true,
        createdAt: true,
      },
    });

    // V2.2: auto-provision a BusinessAccount + primary Outlet + Owner role for the new user.
    const provision = await provisionDefaultAccount({
      userId: user.id,
      kind: role === 'vendor' ? 'vendor' : 'customer',
      businessName,
      fullName,
      gstNumber,
    });

    if (role === 'vendor') {
      await prisma.vendor.create({
        data: {
          userId: user.id,
          businessAccountId: provision.businessAccountId,
          businessName: businessName ?? fullName,
          slug: vendorSlug(businessName ?? fullName),
          isActive: false,
          isVerified: false,
        },
      });
    }

    // Optional full Zoho-style profile sent by the new customer/vendor form.
    // Persist the BusinessAccount fields + contact persons in one go so the
    // create path collects exactly what the edit form shows.
    if (cp && typeof cp === 'object') {
      const data = companyProfileToBusinessAccountUpdate(cp as Record<string, unknown>);
      const contactRows = contactPersonsFromCompanyProfile(cp as Record<string, unknown>, provision.businessAccountId);

      await prisma.$transaction(async (tx) => {
        if (Object.keys(data).length > 0) {
          await tx.businessAccount.update({ where: { id: provision.businessAccountId }, data });
        }
        if (contactRows.length > 0) {
          await tx.contactPerson.createMany({ data: contactRows });
        }
      });
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    return errorResponse(error);
  }
}), 'mutation');
