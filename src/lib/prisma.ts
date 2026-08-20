import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// WHY: Prisma 7 uses a JS-native engine (not a binary like Prisma 5/6).
// It needs a "driver adapter" to talk to PostgreSQL.
// PrismaPg accepts a pg.Pool instance.

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Connection pool limits to prevent exhaustion under high load
    max: Number(process.env.PG_POOL_MAX ?? 20) || 20,
    idleTimeoutMillis: 30_000,
    // Windows Docker/WSL Postgres can stall briefly under Serializable promos;
    // 5s was too aggressive and surfaced as Auth.js CredentialsSignin.
    connectionTimeoutMillis: Number(process.env.PG_POOL_CONNECT_TIMEOUT_MS ?? 20_000) || 20_000,
  });

  const adapter = new PrismaPg(pool as any);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
