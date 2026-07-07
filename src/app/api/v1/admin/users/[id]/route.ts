// GET    /api/v1/admin/users/:id — Get single user details
// PATCH  /api/v1/admin/users/:id — Update user (toggle isActive, change role)
// DELETE /api/v1/admin/users/:id — Permanently delete user (admin only)
// WHY: Admin can view full user details and manage account status/roles
// PROTECTED: Admin only

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { errorResponse, Errors } from '@/middleware/errorHandler';
import { requirePermission } from '@/lib/permissions/engine';
import { creditWalletService } from '@/modules/credit/creditWallet.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Helper: extract the [id] segment from /api/v1/admin/users/{id}
function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  return segments[segments.length - 1];
}

// GET — full user details
export const GET = adminOnly(async (req: NextRequest, _ctx) => {
  try {
    const id = extractId(req);

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        businessName: true,
        gstNumber: true,
        pincode: true,
        image: true,
        isActive: true,
        hcidDisplay: true,
        createdAt: true,
        updatedAt: true,
        vendors: {
          select: {
            id: true,
            businessName: true,
            isVerified: true,
            isActive: true,
            rating: true,
          },
        },
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
                // Zoho-style parity fields
                customerType: true,
                salutation: true,
                firstName: true,
                lastName: true,
                companyName: true,
                customerLanguage: true,
                taxPreference: true,
                gstTreatment: true,
                placeOfSupply: true,
                currency: true,
                creditLimit: true,
                paymentTerms: true,
                enablePortal: true,
                workPhone: true,
                mobilePhone: true,
                remarks: true,
                customFields: true,
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
                contactPersons: {
                  select: {
                    id: true,
                    salutation: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    workPhone: true,
                    mobile: true,
                    designation: true,
                    isPrimary: true,
                  },
                  orderBy: { createdAt: 'asc' },
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
        // Unified credit wallets (CreditWallet) — the system that replaces the
        // legacy CreditAccount. vendorId null = Horeca1 platform wallet.
        creditWallets: {
          select: {
            id: true,
            vendorId: true,
            vendor: { select: { businessName: true } },
            status: true,
            creditLimit: true,
            availableCredit: true,
            outstandingAmount: true,
            currentDueDate: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            orders: true,
            quickOrderLists: true,
          },
        },
      },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    return errorResponse(error);
  }
});

// PATCH — update user fields (isActive, role)
export const PATCH = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'users.edit');
    const id = extractId(req);
    const body = await req.json();

    // Verify user exists
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw Errors.notFound('User');
    }

    // Only allow updating specific admin-controlled fields
    const allowedFields: Record<string, unknown> = {};
    if (typeof body.isActive === 'boolean') {
      allowedFields.isActive = body.isActive;
    }
    if (body.role && ['customer', 'vendor', 'admin'].includes(body.role)) {
      // Admin role transitions must go through /admin/team to ensure the
      // AdminTeamMember row + AccountRole assignment stay consistent. This
      // endpoint must not be a back-door for self-promotion.
      if (body.role === 'admin' || existing.role === 'admin') {
        throw Errors.forbidden('Admin role transitions are managed via the admin team page');
      }
      allowedFields.role = body.role;
    }
    if (typeof body.fullName === 'string' && body.fullName.trim()) {
      allowedFields.fullName = body.fullName.trim();
    }
    if (typeof body.businessName === 'string') {
      allowedFields.businessName = body.businessName.trim() || null;
    }
    if (typeof body.gstNumber === 'string') {
      allowedFields.gstNumber = body.gstNumber.trim() || null;
    }
    if (typeof body.pincode === 'string') {
      allowedFields.pincode = body.pincode.trim() || null;
    }
    if (typeof body.email === 'string') {
      const e = body.email.trim().toLowerCase();
      if (e && !EMAIL_RE.test(e)) throw Errors.badRequest('Enter a valid email address');
      if (e) {
        const taken = await prisma.user.findFirst({ where: { email: e, NOT: { id } }, select: { id: true } });
        if (taken) {
          throw Errors.fieldError('email', 'Another user already uses this email');
        }
      }
      allowedFields.email = e || null;
    }
    if (typeof body.phone === 'string') {
      const pDigits = body.phone.replace(/\D/g, '');
      const p = pDigits.length === 12 ? pDigits.replace(/^91/, '') : pDigits;
      if (p && !/^\d{10}$/.test(p)) throw Errors.badRequest('Enter a valid 10-digit phone number');
      if (p) {
        const taken = await prisma.user.findFirst({ where: { phone: p, NOT: { id } }, select: { id: true } });
        if (taken) {
          throw Errors.fieldError('phone', 'Another user already uses this phone number');
        }
      }
      allowedFields.phone = p || null;
    }
    if (typeof body.password === 'string' && body.password.length > 0) {
      throw Errors.badRequest('Use PATCH /api/v1/admin/users/:id/password to reset a user password');
    }

    const cp = body.companyProfile;
    if (cp) {
      if (cp.gstin !== undefined && allowedFields.gstNumber === undefined) {
        allowedFields.gstNumber = cp.gstin?.trim() || null;
      }
      if (cp.billingPincode !== undefined && allowedFields.pincode === undefined) {
        allowedFields.pincode = cp.billingPincode?.trim() || null;
      }
      if (cp.legalName !== undefined && allowedFields.businessName === undefined) {
        allowedFields.businessName = cp.legalName?.trim() || null;
      }
    }

    const hasBizAccountUpdates = !!(body.companyProfile || body.outlets || body.vendorMapping);
    if (Object.keys(allowedFields).length === 0 && !hasBizAccountUpdates) {
      throw Errors.badRequest('No valid fields to update');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update user if user fields are specified
      let user = existing;
      if (Object.keys(allowedFields).length > 0) {
        user = await tx.user.update({
          where: { id },
          data: allowedFields,
        });

        // Sync businessName/gstNumber to primary BusinessAccount if modified
        if (allowedFields.businessName !== undefined || allowedFields.gstNumber !== undefined) {
          const membership = await tx.businessAccountMember.findFirst({
            where: { userId: id, isPrimary: true },
            select: { businessAccountId: true },
          });
          if (membership) {
            await tx.businessAccount.update({
              where: { id: membership.businessAccountId },
              data: {
                ...(allowedFields.businessName !== undefined && {
                  legalName: ((allowedFields.businessName as string | null) || user.fullName || 'My Business') as string,
                }),
                ...(allowedFields.gstNumber !== undefined && {
                  gstin: (allowedFields.gstNumber as string | null) || null,
                }),
              },
            });
          }
        }
      }

      // 2. Update BusinessAccount if companyProfile is specified
      if (body.companyProfile) {
        const membership = await tx.businessAccountMember.findFirst({
          where: { userId: id, isPrimary: true },
          select: { businessAccountId: true },
        });

        if (membership) {
          const cp = body.companyProfile;
          await tx.businessAccount.update({
            where: { id: membership.businessAccountId },
            data: {
              legalName: cp.legalName !== undefined ? cp.legalName : undefined,
              displayName: cp.displayName !== undefined ? cp.displayName : undefined,
              gstin: cp.gstin !== undefined ? cp.gstin : undefined,
              pan: cp.pan !== undefined ? cp.pan : undefined,
              fssaiNumber: cp.fssaiNumber !== undefined ? cp.fssaiNumber : undefined,
              billingAddressLine: cp.billingAddressLine !== undefined ? cp.billingAddressLine : undefined,
              billingCity: cp.billingCity !== undefined ? cp.billingCity : undefined,
              billingState: cp.billingState !== undefined ? cp.billingState : undefined,
              billingPincode: cp.billingPincode !== undefined ? cp.billingPincode : undefined,
              // P0-4: customer master-datasheet attributes.
              businessType: cp.businessType !== undefined ? cp.businessType : undefined,
              subType: cp.subType !== undefined ? cp.subType : undefined,
              cuisine: cp.cuisine !== undefined ? cp.cuisine : undefined,
              businessSize: cp.businessSize !== undefined ? cp.businessSize : undefined,
              businessStructure: cp.businessStructure !== undefined ? cp.businessStructure : undefined,
              serviceModel: cp.serviceModel !== undefined ? cp.serviceModel : undefined,
              monthlyPurchaseBand: cp.monthlyPurchaseBand !== undefined ? cp.monthlyPurchaseBand : undefined,
              procurementFrequency: cp.procurementFrequency !== undefined ? cp.procurementFrequency : undefined,
              designation: cp.designation !== undefined ? cp.designation : undefined,
              leadStatus: cp.leadStatus !== undefined ? cp.leadStatus : undefined,
              creditType: cp.creditType !== undefined ? cp.creditType : undefined,
              manualTags: Array.isArray(cp.manualTags) ? cp.manualTags : undefined,
              aiTags: Array.isArray(cp.aiTags) ? cp.aiTags : undefined,
              behaviourTags: Array.isArray(cp.behaviourTags) ? cp.behaviourTags : undefined,
              // Zoho-style parity fields
              customerType: cp.customerType !== undefined ? cp.customerType : undefined,
              salutation: cp.salutation !== undefined ? cp.salutation : undefined,
              firstName: cp.firstName !== undefined ? cp.firstName : undefined,
              lastName: cp.lastName !== undefined ? cp.lastName : undefined,
              companyName: cp.companyName !== undefined ? cp.companyName : undefined,
              customerLanguage: cp.customerLanguage !== undefined ? cp.customerLanguage : undefined,
              taxPreference: cp.taxPreference !== undefined ? cp.taxPreference : undefined,
              gstTreatment: cp.gstTreatment !== undefined ? cp.gstTreatment : undefined,
              placeOfSupply: cp.placeOfSupply !== undefined ? cp.placeOfSupply : undefined,
              currency: cp.currency !== undefined ? cp.currency : undefined,
              creditLimit: cp.creditLimit !== undefined ? (cp.creditLimit === null || cp.creditLimit === '' ? null : Number(cp.creditLimit)) : undefined,
              paymentTerms: cp.paymentTerms !== undefined ? cp.paymentTerms : undefined,
              enablePortal: typeof cp.enablePortal === 'boolean' ? cp.enablePortal : undefined,
              workPhone: cp.workPhone !== undefined ? cp.workPhone : undefined,
              mobilePhone: cp.mobilePhone !== undefined ? cp.mobilePhone : undefined,
              remarks: cp.remarks !== undefined ? cp.remarks : undefined,
              customFields: cp.customFields !== undefined && typeof cp.customFields === 'object' ? cp.customFields : undefined,
            },
          });

          // Contact Persons — full replace from the supplied array (Zoho-style
          // editable list). Sent under companyProfile.contactPersons.
          if (Array.isArray(cp.contactPersons)) {
            await tx.contactPerson.deleteMany({ where: { businessAccountId: membership.businessAccountId } });
            const rows = cp.contactPersons
              .filter((c: Record<string, unknown>) => c && (c.firstName || c.lastName || c.email || c.workPhone || c.mobile))
              .map((c: Record<string, unknown>) => ({
                businessAccountId: membership.businessAccountId,
                salutation: (c.salutation as string) || null,
                firstName: (c.firstName as string) || null,
                lastName: (c.lastName as string) || null,
                email: (c.email as string) || null,
                workPhone: (c.workPhone as string) || null,
                mobile: (c.mobile as string) || null,
                designation: (c.designation as string) || null,
                isPrimary: !!c.isPrimary,
              }));
            if (rows.length > 0) await tx.contactPerson.createMany({ data: rows });
          }
        }
      }

      // 3. Update/Create Outlets if outlets array is specified
      if (Array.isArray(body.outlets)) {
        const membership = await tx.businessAccountMember.findFirst({
          where: { userId: id, isPrimary: true },
          select: { businessAccountId: true },
        });

        if (membership) {
          const bizAccountId = membership.businessAccountId;
          for (const o of body.outlets) {
            if (o.id) {
              await tx.outlet.update({
                where: { id: o.id, businessAccountId: bizAccountId },
                data: {
                  name: o.name !== undefined ? o.name : undefined,
                  code: o.code !== undefined ? o.code : undefined,
                  addressLine: o.addressLine !== undefined ? o.addressLine : undefined,
                  city: o.city !== undefined ? o.city : undefined,
                  state: o.state !== undefined ? o.state : undefined,
                  pincode: o.pincode !== undefined ? o.pincode : undefined,
                  isActive: typeof o.isActive === 'boolean' ? o.isActive : undefined,
                },
              });
            } else {
              await tx.outlet.create({
                data: {
                  businessAccountId: bizAccountId,
                  name: o.name,
                  code: o.code || null,
                  addressLine: o.addressLine,
                  city: o.city || null,
                  state: o.state || null,
                  pincode: o.pincode || null,
                  isActive: typeof o.isActive === 'boolean' ? o.isActive : true,
                },
              });
            }
          }
        }
      }

      // 4. Update vendor customer mapping if specified
      if (body.vendorMapping && body.vendorMapping.vendorId) {
        const vm = body.vendorMapping;
        const vcData: Record<string, unknown> = {};
        if (vm.salesExecutive !== undefined) {
          vcData.salesExecutive = vm.salesExecutive || null;
        }
        if (vm.territory !== undefined) {
          vcData.territory = vm.territory || null;
        }
        if (Array.isArray(vm.tags)) {
          vcData.tags = vm.tags;
        }
        if (vm.status) {
          vcData.status = vm.status;
        }

        await tx.vendorCustomer.upsert({
          where: {
            vendorId_userId: { vendorId: vm.vendorId, userId: id },
          },
          create: {
            vendorId: vm.vendorId,
            userId: id,
            status: vm.status || 'active',
            salesExecutive: vm.salesExecutive || null,
            territory: vm.territory || null,
            tags: vm.tags || [],
          },
          update: vcData,
        });

        // Sync credit wallet if credit settings are passed
        if (vm.creditLimit !== undefined) {
          await creditWalletService.assignCredit(
            id,
            vm.vendorId,
            vm.creditLimit,
            {},
            ctx.userId,
            'Credit synced from admin user update',
          );
        }
      }

      return user;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

// DELETE /api/v1/admin/users/[id]?force=<bool>
//   default (no force): soft-delete (isActive=false). Preserves all linked
//   data — orders, audit trail, vendor row, business memberships.
//   ?force=true: HARD delete — irreversibly wipes the user AND everything they
//   own, including financial records. As a customer: their orders, payments,
//   reviews, returns, credit/wallet ledgers, cashback, carts and lists. As a
//   vendor: the vendor row plus its products, inventory, price slabs, orders
//   received, payments, settlements, commissions, coupons, promotions and
//   customer mappings. Many of these FKs are NOT ON DELETE CASCADE in the
//   schema, so the transaction below walks every dependent in dependency order
//   (children → parents) so a final user.delete() can't throw P2003.
//   The only refusal is self-deletion (guard above).
//
//   This is destructive and unrecoverable by design — the admin UI double-
//   confirms ("Delete permanently … cannot be undone") before calling it.
//
// Admin role transitions still go through /admin/team — see PATCH above.
export const DELETE = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'users.delete');
    const id = extractId(req);
    const force = req.nextUrl.searchParams.get('force') === 'true';

    if (id === ctx.userId) {
      throw Errors.badRequest('You cannot delete your own account');
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        isActive: true,
        vendors: { select: { id: true } },
      },
    });
    if (!existing) throw Errors.notFound('User');

    // ── Soft delete path ─────────────────────────────────────────────────
    if (!force) {
      if (!existing.isActive) {
        return NextResponse.json({ success: true, data: { id, alreadyDeactivated: true } });
      }
      await prisma.user.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({ success: true, data: { id, deactivated: true } });
    }

    // ── Hard delete path ────────────────────────────────────────────────
    // No business-data guards: an explicit admin "delete permanently" wipes
    // everything. Most child FKs are NOT ON DELETE CASCADE in schema.prisma,
    // so we delete in dependency order (children → parents). An empty
    // `{ in: [] }` matches nothing, so the vendor clauses are safe to include
    // even for pure customers. catch(()=>{}) only on rows whose table may not
    // exist on every environment (legacy) — never to mask a real FK failure
    // on the critical path.
    const vendorIds = existing.vendors.map(v => v.id);

    await prisma.$transaction(async (tx) => {
      // Orders the user placed (as buyer) OR their vendor(s) received.
      const orderRows = await tx.order.findMany({
        where: { OR: [{ userId: id }, { vendorId: { in: vendorIds } }] },
        select: { id: true },
      });
      const orderIds = orderRows.map(o => o.id);

      // ── 1. Rows whose FK → Order has no cascade (would block order delete) ─
      await tx.commissionAccrual.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { vendorId: { in: vendorIds } }] } });
      await tx.payment.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { vendorId: { in: vendorIds } }] } });
      await tx.returnRequest.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { customerId: id }] } });
      await tx.creditTransaction.deleteMany({ where: { OR: [
        { orderId: { in: orderIds } },
        { vendorId: { in: vendorIds } },
        { creditAccount: { userId: id } },
        { creditAccount: { vendorId: { in: vendorIds } } },
      ] } });

      // ── 2. Orders — cascades order_items, reviews, coupon_redemptions;
      //       nulls cashback_entries.order_id. ──────────────────────────────
      await tx.order.deleteMany({ where: { OR: [{ userId: id }, { vendorId: { in: vendorIds } }] } });

      // ── 3. Rows whose FK → Product has no cascade (would block product
      //       delete). Order items already went with the orders above. ──────
      await tx.cartItem.deleteMany({ where: { OR: [{ vendorId: { in: vendorIds } }, { cart: { userId: id } }] } });
      await tx.quickOrderListItem.deleteMany({ where: { OR: [{ vendorId: { in: vendorIds } }, { list: { userId: id } }] } });
      await tx.quickOrderList.deleteMany({ where: { OR: [{ vendorId: { in: vendorIds } }, { userId: id }] } });

      // ── 4. Vendor's products — cascades price slabs, inventory, product-
      //       categories, collection links, brand mappings, price-list items
      //       and customer prices; nulls promotion buy/get refs. ────────────
      if (vendorIds.length > 0) {
        await tx.product.deleteMany({ where: { vendorId: { in: vendorIds } } });
      }

      // ── 5. User-owned rows user.delete() can't cascade ─────────────────
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.cart.deleteMany({ where: { userId: id } });
      await tx.walletTransaction.deleteMany({ where: { wallet: { userId: id } } }).catch(() => {});
      await tx.wallet.deleteMany({ where: { userId: id } }).catch(() => {});
      await tx.cashbackEntry.deleteMany({ where: { userId: id } });
      // CreditWallet cascades its txns/repayments/penalties/audit logs.
      await tx.creditWallet.deleteMany({ where: { OR: [{ userId: id }, { vendorId: { in: vendorIds } }] } });
      await tx.creditAccount.deleteMany({ where: { OR: [{ userId: id }, { vendorId: { in: vendorIds } }] } });
      await tx.customerVendor.deleteMany({ where: { OR: [{ userId: id }, { vendorId: { in: vendorIds } }] } }).catch(() => {});
      await tx.vendorCustomer.deleteMany({ where: { OR: [{ userId: id }, { vendorId: { in: vendorIds } }] } }).catch(() => {});

      // ── 6. Team / RBAC rows ────────────────────────────────────────────
      await tx.adminTeamMember.deleteMany({ where: { userId: id } });
      await tx.vendorTeamMember.deleteMany({ where: { userId: id } }).catch(() => {});
      await tx.brandTeamMember.deleteMany({ where: { userId: id } }).catch(() => {});
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.businessAccountMember.deleteMany({ where: { userId: id } });

      // ── 7. Null inviter back-references on rows we keep (point at a row
      //       that's about to disappear). ───────────────────────────────────
      await tx.vendorTeamMember.updateMany({ where: { invitedBy: id }, data: { invitedBy: null } }).catch(() => {});
      await tx.brandTeamMember.updateMany({ where: { invitedBy: id }, data: { invitedBy: null } }).catch(() => {});
      await tx.adminTeamMember.updateMany({ where: { invitedBy: id }, data: { invitedBy: null } }).catch(() => {});
      await tx.businessAccountMember.updateMany({ where: { invitedBy: id }, data: { invitedBy: null } }).catch(() => {});

      // ── 8. Auth-adapter + misc personal data ───────────────────────────
      await tx.linkedAccount.deleteMany({ where: { OR: [{ userId: id }, { linkedUserId: id }] } });
      await tx.savedAddress.deleteMany({ where: { userId: id } });
      await tx.pushSubscription.deleteMany({ where: { userId: id } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.account.deleteMany({ where: { userId: id } });

      // ── 9. Vendor-owned rows whose FK → Vendor has no cascade. The vendor
      //       delete then cascades the rest (service areas, delivery slots,
      //       team members, price lists, promotions, coupons, cashback
      //       campaigns, salespersons, commission rules, customer tasks). ────
      if (vendorIds.length > 0) {
        await tx.vendorDocument.deleteMany({ where: { vendorId: { in: vendorIds } } }).catch(() => {});
        await tx.vendorSettlement.deleteMany({ where: { vendorId: { in: vendorIds } } }).catch(() => {}); // cascades settlement orders
        await tx.vendorWalletTxn.deleteMany({ where: { wallet: { vendorId: { in: vendorIds } } } }).catch(() => {});
        await tx.vendorWallet.deleteMany({ where: { vendorId: { in: vendorIds } } }).catch(() => {});
        await tx.inventoryLog.deleteMany({ where: { vendorId: { in: vendorIds } } }).catch(() => {});
        await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      }

      // ── 10. Brand rows (cascades brand products, mappings, invites, team) ─
      await tx.brand.deleteMany({ where: { userId: id } }).catch(() => {});

      // ── 11. Finally the user ───────────────────────────────────────────
      await tx.user.delete({ where: { id } });
    });

    return NextResponse.json({ success: true, data: { id, hardDeleted: true } });
  } catch (error) {
    return errorResponse(error);
  }
});
