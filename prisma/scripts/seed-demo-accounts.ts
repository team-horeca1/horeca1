/**
 * Extra QA accounts for the isolated demo DB.
 * Run AFTER prisma/seed.ts against DATABASE_URL pointing at horeca1_demo.
 *
 * Passwords (demo only — never use in production):
 *   demo.admin@horeca1.com     / DemoAdmin123!
 *   demo.vendor@horeca1.com    / DemoVendor123!
 *   demo.brand@horeca1.com     / DemoBrand123!
 *   demo.customer@horeca1.com  / DemoCustomer123!
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function generateHcid(): string {
  const seg = () => Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, '0');
  return `HC-${seg()}-${seg()}`;
}

async function uniqueHcid(): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const candidate = generateHcid();
    const existing = await prisma.user.findUnique({
      where: { hcidDisplay: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error('Could not generate unique HCID');
}

async function main() {
  console.log('🌱 Seeding demo QA accounts...');

  const adminPw = await hash('DemoAdmin123!', 12);
  const vendorPw = await hash('DemoVendor123!', 12);
  const brandPw = await hash('DemoBrand123!', 12);
  const customerPw = await hash('DemoCustomer123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'demo.admin@horeca1.com' },
    update: { password: adminPw, role: 'admin', fullName: 'Demo Admin' },
    create: {
      email: 'demo.admin@horeca1.com',
      password: adminPw,
      fullName: 'Demo Admin',
      role: 'admin',
      phone: '+919999900100',
      pincode: '400001',
      emailVerified: new Date(),
      hcidDisplay: await uniqueHcid(),
    },
  });
  console.log(`  Admin: ${admin.email}`);

  // Prefer attaching demo.vendor to an existing seeded vendor store when present.
  let vendor = await prisma.vendor.findFirst({
    where: { slug: 'daily-fresh-foods' },
    select: { id: true, businessName: true, businessAccountId: true },
  });

  const vendorUser = await prisma.user.upsert({
    where: { email: 'demo.vendor@horeca1.com' },
    update: { password: vendorPw, role: 'vendor', fullName: 'Demo Vendor Owner' },
    create: {
      email: 'demo.vendor@horeca1.com',
      password: vendorPw,
      fullName: 'Demo Vendor Owner',
      role: 'vendor',
      phone: '+919999900101',
      pincode: '400705',
      businessName: 'Demo Fresh Supplies',
      emailVerified: new Date(),
      hcidDisplay: await uniqueHcid(),
    },
  });

  if (!vendor) {
    const ba = await prisma.businessAccount.create({
      data: {
        legalName: 'Demo Fresh Supplies',
        displayName: 'Demo Fresh Supplies',
        isVendor: true,
        isCustomer: false,
        status: 'active',
      },
    });
    await prisma.businessAccountMember.create({
      data: { userId: vendorUser.id, businessAccountId: ba.id, isPrimary: true },
    });
    const outlet = await prisma.outlet.create({
      data: {
        businessAccountId: ba.id,
        name: 'Demo Fresh HQ',
        addressLine: 'Demo Lane 1, Mumbai',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400705',
        isActive: true,
      },
    });
    await prisma.businessAccount.update({
      where: { id: ba.id },
      data: { primaryOutletId: outlet.id },
    });
    vendor = await prisma.vendor.create({
      data: {
        userId: vendorUser.id,
        businessAccountId: ba.id,
        businessName: 'Demo Fresh Supplies',
        displayName: 'Demo Fresh Supplies',
        slug: 'demo-fresh-supplies',
        city: 'Mumbai',
        state: 'Maharashtra',
        addressPincode: '400705',
        addressLine: 'Demo Lane 1, Mumbai',
        rating: 4.5,
        minOrderValue: 300,
        creditEnabled: true,
        isVerified: true,
        isActive: true,
        isPrimaryStore: true,
        logoUrl: '/images/seed/vendor-1.png',
      },
      select: { id: true, businessName: true, businessAccountId: true },
    });
    await prisma.serviceArea.createMany({
      data: ['400701', '400703', '400705', '400706'].map((pincode) => ({
        vendorId: vendor!.id,
        outletId: outlet.id,
        pincode,
      })),
      skipDuplicates: true,
    });
  } else {
    const member = await prisma.businessAccountMember.findFirst({
      where: { userId: vendorUser.id, businessAccountId: vendor.businessAccountId },
    });
    if (!member) {
      await prisma.businessAccountMember.create({
        data: {
          userId: vendorUser.id,
          businessAccountId: vendor.businessAccountId,
          isPrimary: true,
        },
      });
    }
  }
  console.log(`  Vendor: ${vendorUser.email} → ${vendor.businessName}`);

  const brandUser = await prisma.user.upsert({
    where: { email: 'demo.brand@horeca1.com' },
    update: { password: brandPw, role: 'brand', fullName: 'Demo Brand Owner' },
    create: {
      email: 'demo.brand@horeca1.com',
      password: brandPw,
      fullName: 'Demo Brand Owner',
      role: 'brand',
      phone: '+919999900102',
      pincode: '400001',
      businessName: 'Demo Brand Co',
      emailVerified: new Date(),
      hcidDisplay: await uniqueHcid(),
    },
  });

  let brand = await prisma.brand.findFirst({
    where: { OR: [{ slug: 'kitchen-smith' }, { slug: 'demo-brand-co' }] },
  });
  if (!brand) {
    const ba = await prisma.businessAccount.create({
      data: {
        legalName: 'Demo Brand Co',
        displayName: 'Demo Brand Co',
        isBrand: true,
        isCustomer: false,
        status: 'active',
      },
    });
    await prisma.businessAccountMember.create({
      data: { userId: brandUser.id, businessAccountId: ba.id, isPrimary: true },
    });
    brand = await prisma.brand.create({
      data: {
        userId: brandUser.id,
        businessAccountId: ba.id,
        name: 'Demo Brand Co',
        slug: 'demo-brand-co',
        approvalStatus: 'approved',
        isActive: true,
        tagline: 'QA demo brand — not for production',
        logoUrl: '/images/brand/03b885b1-5477-4aa9-af03-d948165745e61771835977.png',
      },
    });
  } else if (brand.businessAccountId) {
    const member = await prisma.businessAccountMember.findFirst({
      where: { userId: brandUser.id, businessAccountId: brand.businessAccountId },
    });
    if (!member) {
      await prisma.businessAccountMember.create({
        data: {
          userId: brandUser.id,
          businessAccountId: brand.businessAccountId,
          isPrimary: true,
        },
      });
    }
    if (!brand.userId) {
      await prisma.brand.update({
        where: { id: brand.id },
        data: { userId: brandUser.id, approvalStatus: 'approved', isActive: true },
      });
    }
  }
  console.log(`  Brand: ${brandUser.email} → ${brand.name}`);

  const customer = await prisma.user.upsert({
    where: { email: 'demo.customer@horeca1.com' },
    update: { password: customerPw, role: 'customer', fullName: 'Demo Customer' },
    create: {
      email: 'demo.customer@horeca1.com',
      password: customerPw,
      fullName: 'Demo Customer',
      role: 'customer',
      phone: '+919999900103',
      pincode: '400705',
      businessName: 'Demo Kitchen QA',
      emailVerified: new Date(),
      hcidDisplay: await uniqueHcid(),
    },
  });

  const existingBa = await prisma.businessAccountMember.findFirst({
    where: { userId: customer.id, businessAccount: { isCustomer: true } },
    select: { businessAccountId: true },
  });
  if (!existingBa) {
    const ba = await prisma.businessAccount.create({
      data: {
        legalName: 'Demo Kitchen QA',
        displayName: 'Demo Kitchen QA',
        isVendor: false,
        isCustomer: true,
        status: 'active',
      },
    });
    await prisma.businessAccountMember.create({
      data: { userId: customer.id, businessAccountId: ba.id, isPrimary: true },
    });
    const outlet = await prisma.outlet.create({
      data: {
        businessAccountId: ba.id,
        name: 'Demo Kitchen Outlet',
        addressLine: 'QA Street 9, Navi Mumbai',
        city: 'Navi Mumbai',
        state: 'Maharashtra',
        pincode: '400705',
        isActive: true,
      },
    });
    await prisma.businessAccount.update({
      where: { id: ba.id },
      data: { primaryOutletId: outlet.id },
    });

    await prisma.creditAccount.upsert({
      where: { userId_vendorId: { userId: customer.id, vendorId: vendor.id } },
      update: { creditLimit: 50000, status: 'active' },
      create: {
        userId: customer.id,
        vendorId: vendor.id,
        creditLimit: 50000,
        creditUsed: 0,
        status: 'active',
      },
    });
  }
  console.log(`  Customer: ${customer.email}`);

  console.log('✅ Demo QA accounts ready');
  console.log('   demo.admin@horeca1.com / DemoAdmin123!');
  console.log('   demo.vendor@horeca1.com / DemoVendor123!');
  console.log('   demo.brand@horeca1.com / DemoBrand123!');
  console.log('   demo.customer@horeca1.com / DemoCustomer123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
