/**
 * Demo only. Copies Razorpay's returned fee and tax onto payment rows that
 * already have a Razorpay payment id. A missing fee stays null. Never writes 2%.
 *
 * Refuses every database except horeca1_demo.
 */
import { prisma } from '../src/lib/prisma';
import { getRazorpay } from '../src/lib/razorpay';

type GatewayPayment = { fee?: number; tax?: number };

function optionalPaise(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

async function main() {
  const rows = await prisma.$queryRaw<Array<{ current_database: string; current_user: string }>>`
    SELECT current_database(), current_user
  `;
  const database = rows[0]?.current_database;
  const user = rows[0]?.current_user;
  if (database !== 'horeca1_demo' || user !== 'horeca1_demo') {
    throw new Error(`Refusing Razorpay fee backfill on ${database ?? 'unknown'} as ${user ?? 'unknown'}`);
  }

  const payments = await prisma.payment.findMany({
    where: { razorpayPaymentId: { not: null }, razorpayFeePaise: null },
    select: { id: true, razorpayPaymentId: true },
  });

  const razorpay = getRazorpay();
  let stored = 0;
  let missing = 0;
  for (const payment of payments) {
    const id = payment.razorpayPaymentId;
    if (!id) continue;
    const fetched = await razorpay.payments.fetch(id) as GatewayPayment;
    const fee = optionalPaise(fetched.fee);
    const tax = optionalPaise(fetched.tax);
    if (fee == null) {
      missing += 1;
      continue;
    }
    await prisma.payment.update({
      where: { id: payment.id },
      data: { razorpayFeePaise: fee, razorpayTaxPaise: tax },
    });
    stored += 1;
  }
  console.log(JSON.stringify({ checked: payments.length, stored, missing }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
