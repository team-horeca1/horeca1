import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || 'postgresql://horeca1:horeca1_dev@127.0.0.1:5432/horeca1',
});
const prisma = new PrismaClient({ adapter });
const hash = await bcrypt.hash('admin123', 12);
await prisma.user.update({ where: { email: 'admin@horeca1.com' }, data: { password: hash } });
console.log('admin password reset to admin123');
await prisma.$disconnect();
