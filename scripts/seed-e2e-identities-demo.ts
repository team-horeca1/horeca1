/**
 * TEMP demo-QA script (not for prod): create the repo e2e seed identities
 * fresh@dailyfreshfoods.com / vendor123 and chef@tajpalace.com / customer123
 * in the DEMO DB, attached to the existing Foodline store (real demo catalog).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const FOODLINE_VENDOR_ID = '0935f83d-c8ed-4cf8-93b0-6f6a642ce686';
const FOODLINE_BA_ID = 'e9eb4886-e9b9-4163-a638-6727a95ce28e';

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
  const vendorPw = await hash('vendor123', 12);
  const customerPw = await hash('customer123', 12);

  const fresh = await prisma.user.upsert({
    where: { email: 'fresh@dailyfreshfoods.com' },
    update: { password: vendorPw, role: 'vendor', fullName: 'Daily Fresh Owner' },
    create: {
      email: 'fresh@dailyfreshfoods.com',
      password: vendorPw,
      fullName: 'Daily Fresh Owner',
      role: 'vendor',
      phone: '+919999900201',
      pincode: '400705',
      businessName: 'Daily Fresh Foods',
      emailVerified: new Date(),
      hcidDisplay: await uniqueHcid(),
    },
  });

  const member = await prisma.businessAccountMember.findFirst({
    where: { userId: fresh.id, businessAccountId: FOODLINE_BA_ID },
  });
  if (!member) {
    await prisma.businessAccountMember.create({
      data: { userId: fresh.id, businessAccountId: FOODLINE_BA_ID, isPrimary: false },
    });
  }

  const team = await prisma.vendorTeamMember.findFirst({
    where: { vendorId: FOODLINE_VENDOR_ID, userId: fresh.id },
  });
  if (!team) {
    await prisma.vendorTeamMember.create({
      data: { vendorId: FOODLINE_VENDOR_ID, userId: fresh.id, role: 'owner' },
    });
  }
  console.log(`vendor identity ready: ${fresh.email} -> Foodline ${FOODLINE_VENDOR_ID}`);

  const chef = await prisma.user.upsert({
    where: { email: 'chef@tajpalace.com' },
    update: { password: customerPw, role: 'customer', fullName: 'Vikram Singh' },
    create: {
      email: 'chef@tajpalace.com',
      password: customerPw,
      fullName: 'Vikram Singh',
      role: 'customer',
      phone: '+919999900202',
      pincode: '400705',
      businessName: 'Taj Palace',
      emailVerified: new Date(),
      hcidDisplay: await uniqueHcid(),
    },
  });

  const existingBa = await prisma.businessAccountMember.findFirst({
    where: { userId: chef.id, businessAccount: { isCustomer: true } },
    select: { businessAccountId: true },
  });
  if (!existingBa) {
    const ba = await prisma.businessAccount.create({
      data: {
        legalName: 'Taj Palace',
        displayName: 'Taj Palace',
        isVendor: false,
        isCustomer: true,
        status: 'active',
      },
    });
    await prisma.businessAccountMember.create({
      data: { userId: chef.id, businessAccountId: ba.id, isPrimary: true },
    });
    const outlet = await prisma.outlet.create({
      data: {
        businessAccountId: ba.id,
        name: 'Taj Palace Kitchen',
        addressLine: 'QA Street 1, Navi Mumbai',
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
  }
  console.log(`customer identity ready: ${chef.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
