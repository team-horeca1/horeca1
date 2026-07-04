import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const email = process.argv[2] || '';
  const phone = process.argv[3] || '';
  const row = await prisma.otpCode.findFirst({
    where: email
      ? { email }
      : phone
        ? { phone }
        : undefined,
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });
  console.log(row?.code ?? '');
  await prisma.$disconnect();
}

main();
