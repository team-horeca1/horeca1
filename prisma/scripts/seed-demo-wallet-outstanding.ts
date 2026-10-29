/**
 * DEMO ONLY — seed a synthetic outstanding balance on the demo customer's
 * Demo Fresh Supplies credit wallet so wallet repayment can be tested.
 *
 * Does not touch production. Idempotent: sets a fixed QA outstanding of ₹500
 * when the wallet exists and marks the change in a REVERSAL/REPAYMENT note prefix.
 *
 * Usage (on demo app container or with DEMO DATABASE_URL):
 *   npx tsx prisma/scripts/seed-demo-wallet-outstanding.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';

const OUTSTANDING = 500;
const EMAIL = 'demo.customer@horeca1.com';
const VENDOR_SLUG = 'demo-fresh-supplies';
const NOTE = 'QA_SEED_OUTSTANDING: synthetic ₹500 for Razorpay repayment e2e';

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (!user) throw new Error(`User ${EMAIL} not found`);

    const vendor = await prisma.vendor.findFirst({ where: { slug: VENDOR_SLUG } });
    if (!vendor) throw new Error(`Vendor ${VENDOR_SLUG} not found`);

    const wallet = await prisma.creditWallet.findFirst({
      where: { userId: user.id, vendorId: vendor.id },
    });
    if (!wallet) throw new Error(`No credit wallet for ${EMAIL} @ ${VENDOR_SLUG}`);

    const limit = Number(wallet.creditLimit);
    const used = OUTSTANDING;
    const available = Math.max(0, limit - used);

    const updated = await prisma.$transaction(async (tx) => {
      const w = await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          outstandingAmount: new Prisma.Decimal(OUTSTANDING),
          usedCredit: new Prisma.Decimal(used),
          availableCredit: new Prisma.Decimal(available),
          reservedAmount: new Prisma.Decimal(0),
          status: 'ACTIVE',
          currentDueDate: new Date(Date.now() + 7 * 86400000),
        },
      });
      await tx.creditWalletTxn.create({
        data: {
          walletId: wallet.id,
          type: 'REVERSAL',
          amount: new Prisma.Decimal(OUTSTANDING),
          balanceAfterTxn: new Prisma.Decimal(available),
          note: NOTE,
        },
      });
      return w;
    });

    console.log(JSON.stringify({
      ok: true,
      walletId: updated.id,
      userId: user.id,
      vendorId: vendor.id,
      outstanding: Number(updated.outstandingAmount),
      availableCredit: Number(updated.availableCredit),
      creditLimit: Number(updated.creditLimit),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
