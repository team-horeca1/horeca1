import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const rows = await prisma.$queryRaw<Array<{ business_name: string; outlet_count: bigint; order_count: bigint }>>`
    SELECT v.business_name, COUNT(DISTINCT ord.id) AS order_count,
      (SELECT COUNT(*) FROM outlets ot WHERE ot.business_account_id = v.business_account_id) AS outlet_count
    FROM orders ord
    JOIN vendors v ON v.id = ord.vendor_id
    WHERE ord.fulfillment_outlet_id IS NULL
    GROUP BY v.id, v.business_name, v.business_account_id`;
  console.log('Vendors with orders missing fulfillment (no vendor outlet to assign):');
  console.table(rows.map((r) => ({
    vendor: r.business_name,
    orders: Number(r.order_count),
    vendorOutlets: Number(r.outlet_count),
  })));
}

main().finally(() => prisma.$disconnect());
