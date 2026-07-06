/**
 * Hotfix: drop stale inventory_product_id_key index + backfill null fulfillment_outlet_id.
 * Run once after 20260706120000_vendor_multi_outlet if inspect script shows issues.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  console.log('Dropping stale inventory_product_id_key index...');
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "inventory_product_id_key"`);

  console.log('Backfilling orders.fulfillment_outlet_id (vendor primary/first outlet)...');
  const r1 = await prisma.$executeRaw`
    UPDATE "orders" o
    SET "fulfillment_outlet_id" = sub.primary_outlet_id
    FROM (
      SELECT v.id AS vendor_id, ba.primary_outlet_id
      FROM "vendors" v
      JOIN "business_accounts" ba ON ba.id = v.business_account_id
      WHERE ba.primary_outlet_id IS NOT NULL
    ) sub
    WHERE o.vendor_id = sub.vendor_id
      AND o.fulfillment_outlet_id IS NULL`;

  const r2 = await prisma.$executeRaw`
    UPDATE "orders" o
    SET "fulfillment_outlet_id" = sub.outlet_id
    FROM (
      SELECT DISTINCT ON (v.id) v.id AS vendor_id, ot.id AS outlet_id
      FROM "vendors" v
      JOIN "outlets" ot ON ot.business_account_id = v.business_account_id AND ot.is_active = true
      ORDER BY v.id, ot.created_at ASC
    ) sub
    WHERE o.vendor_id = sub.vendor_id
      AND o.fulfillment_outlet_id IS NULL`;

  console.log('Backfill rows updated:', Number(r1) + Number(r2));

  const remaining = await prisma.$queryRaw<[{ c: number }]>`SELECT COUNT(*)::int AS c FROM orders WHERE fulfillment_outlet_id IS NULL`;
  console.log('Orders still missing fulfillment_outlet_id:', remaining[0].c);

  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE tablename = 'inventory' AND indexname = 'inventory_product_id_key'`;
  console.log('Stale index gone:', indexes.length === 0);
}

main().finally(() => prisma.$disconnect());
