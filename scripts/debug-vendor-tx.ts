import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const email = process.argv[2] || 'testvendor+debug@example.com';

async function main() {
  const otp = await prisma.otpCode.findFirst({
    where: { email, used: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log('verified otp', otp);

  const vendorAdminTemplate = await prisma.accountRole.findFirst({
    where: { businessAccountId: null, isTemplate: true, name: 'Vendor Admin', scope: 'vendor' },
  });
  console.log('vendorAdminTemplate', vendorAdminTemplate?.id);

  const typeSelectionsJson = [{
    type: 'Distributor',
    slug: 'distributor',
    subTypes: ['HoReCa Distributor'],
  }];

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phone: null,
          email,
          password: null,
          fullName: 'Test Vendor Owner',
          businessName: `Test Vendor ${Date.now()}`,
          role: 'vendor',
          hcidDisplay: `HC${Date.now()}`,
        },
        select: { id: true, hcidDisplay: true },
      });

      const account = await tx.businessAccount.create({
        data: {
          legalName: `Test Vendor ${Date.now()}`,
          displayName: `Test Trade ${Date.now()}`,
          businessType: 'Distributor',
          subType: 'HoReCa Distributor',
          vendorTypeSelections: typeSelectionsJson,
          isCustomer: true,
          isVendor: true,
          isBrand: false,
          status: 'active',
        },
      });

      const outlet = await tx.outlet.create({
        data: {
          businessAccountId: account.id,
          name: 'Test Trade',
          addressLine: '123 Test Industrial Estate, Andheri East',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400708',
        },
      });

      await tx.businessAccount.update({
        where: { id: account.id },
        data: { primaryOutletId: outlet.id },
      });

      await tx.businessAccountMember.create({
        data: { userId: user.id, businessAccountId: account.id, isPrimary: true, acceptedAt: new Date() },
      });

      await tx.userRole.create({
        data: { userId: user.id, businessAccountId: account.id, outletId: null, roleId: vendorAdminTemplate!.id },
      });

      const vendor = await tx.vendor.create({
        data: {
          userId: user.id,
          businessAccountId: account.id,
          businessName: `Test Vendor ${Date.now()}`,
          slug: `test-vendor-${user.id.slice(0, 8)}`,
          isActive: false,
          isVerified: false,
          vendorType: 'distributor',
          subType: 'HoReCa Distributor',
          vendorTypeSelections: typeSelectionsJson,
          authorizedPersonName: 'Test Authorized',
          authorizedPersonPhone: null,
          authorizedPersonEmail: email,
          addressLine: '123 Test Industrial Estate, Andheri East',
          city: 'Mumbai',
          state: 'Maharashtra',
          addressPincode: '400708',
          pickupAddressLine: '123 Test Industrial Estate, Andheri East',
          pickupCity: 'Mumbai',
          pickupState: 'Maharashtra',
          pickupPincode: '400708',
          bankAccountName: 'Test Vendor Pvt Ltd',
          bankAccountNumber: '123456789012',
          bankIfsc: 'HDFC0001234',
          bankName: 'HDFC Bank',
          bankAccountType: 'current',
          deliveryCapability: 'both',
        },
      });

      await tx.serviceArea.createMany({
        data: [{ vendorId: vendor.id, pincode: '400708' }],
      });

      return { user, vendor };
    });
    console.log('SUCCESS', result);
  } catch (e) {
    console.error('TX FAILED', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
