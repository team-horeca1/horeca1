import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const indexes = await prisma.$queryRawUnsafe(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'products';
  `);
  console.log('INDEXES ON products:');
  console.log(JSON.stringify(indexes, null, 2));

  const constraints = await prisma.$queryRawUnsafe(`
    SELECT conname, contype, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conrelid = 'products'::regclass;
  `);
  console.log('CONSTRAINTS ON products:');
  console.log(JSON.stringify(constraints, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
