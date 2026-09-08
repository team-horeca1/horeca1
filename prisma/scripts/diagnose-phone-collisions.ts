import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const collisions = await prisma.$queryRaw<Array<{ canonical: string; n: number; ids: string[] }>>`
    SELECT regexp_replace(phone, '^\\+?91', '') AS canonical,
           count(*)::int AS n,
           array_agg(id::text) AS ids
    FROM users
    WHERE phone IS NOT NULL
      AND (phone ~ '^\\+?91[6-9][0-9]{9}$' OR phone ~ '^[6-9][0-9]{9}$')
    GROUP BY 1
    HAVING count(*) > 1
  `;
  const prefixed = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM users WHERE phone ~ '^\\+?91[6-9][0-9]{9}$'
  `;
  console.log('collisions', JSON.stringify(collisions, null, 2));
  console.log('prefixedCount', prefixed[0]?.n ?? 0);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
