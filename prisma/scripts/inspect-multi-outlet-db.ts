import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const constraints = await prisma.$queryRaw<Array<{ conname: string; def: string }>>`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = '"inventory"'::regclass`;
  console.log('inventory constraints:', constraints);

  const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'inventory'`;
  console.log('inventory indexes:', indexes);

  const nullOrders = await prisma.$queryRaw<[{ c: number }]>`SELECT COUNT(*)::int AS c FROM orders WHERE fulfillment_outlet_id IS NULL`;
  console.log('orders missing fulfillment:', nullOrders[0].c);

  const sampleNull = await prisma.$queryRaw<Array<{ id: string; vendor_id: string }>>`
    SELECT id, vendor_id FROM orders WHERE fulfillment_outlet_id IS NULL LIMIT 5`;
  console.log('sample null fulfillment orders:', sampleNull);
}

main().finally(() => prisma.$disconnect());
