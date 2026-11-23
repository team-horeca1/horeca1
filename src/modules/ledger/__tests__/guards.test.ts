import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { rewardIssue } from '../rules';
import { postJournal } from '../post';

function localDatabase(): boolean {
  if (!fs.existsSync('.env')) return false;
  const match = fs.readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.*)$/m);
  if (!match) return false;
  const url = new URL(match[1].trim().replace(/^['"]|['"]$/g, ''));
  process.env.DATABASE_URL = url.toString();
  const name = url.pathname.replace(/^\//, '');
  return (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    && url.port !== '5433'
    && (name === 'horeca1' || name === 'horeca1_demo');
}

const enabled = localDatabase();

describe.skipIf(!enabled)('journal guards on local postgres', () => {
  afterAll(async () => {
    if (!enabled) return;
    const { prisma } = await import('@/lib/prisma');
    await prisma.$disconnect();
  });
  it('posts once for the same idempotency key', async () => {
    const { prisma } = await import('@/lib/prisma');
    const key = `test:${randomUUID()}`;
    const first = await prisma.$transaction((tx) => postJournal(tx, {
      eventType: 'reward_issue',
      eventRefType: 'test',
      eventRefId: key,
      idempotencyKey: key,
      lines: rewardIssue(randomUUID(), 100),
    }));
    const second = await prisma.$transaction((tx) => postJournal(tx, {
      eventType: 'reward_issue',
      eventRefType: 'test',
      eventRefId: key,
      idempotencyKey: key,
      lines: rewardIssue(randomUUID(), 100),
    }));
    expect(second.replayed).toBe(true);
    expect(second.id).toBe(first.id);
  });

  it('refuses a self-approved reversal', async () => {
    const { prisma } = await import('@/lib/prisma');
    await expect(prisma.$transaction((tx) => postJournal(tx, {
      eventType: 'reversal',
      eventRefType: 'test',
      eventRefId: randomUUID(),
      idempotencyKey: `test:${randomUUID()}`,
      postedBy: 'same',
      approvedBy: 'same',
      lines: rewardIssue(randomUUID(), 50),
    }))).rejects.toThrow(/different person/);
  });

  it('refuses an edited journal line', async () => {
    const { prisma } = await import('@/lib/prisma');
    const key = `test:${randomUUID()}`;
    await expect(prisma.$transaction(async (tx) => {
      const posted = await postJournal(tx, {
        eventType: 'reward_issue',
        eventRefType: 'test',
        eventRefId: key,
        idempotencyKey: key,
        lines: rewardIssue(randomUUID(), 80),
      });
      await tx.$executeRaw`UPDATE journal_lines SET memo = 'changed' WHERE entry_id = ${posted.id}::uuid`;
    })).rejects.toThrow(/append-only/);
  });

  it('refuses an unbalanced entry', async () => {
    const { prisma } = await import('@/lib/prisma');
    await expect(prisma.$transaction(async (tx) => {
      const entryId = randomUUID();
      const accountId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO ledger_accounts (id, code, name, type)
        VALUES (${accountId}::uuid, ${`TEST:${entryId}`}, 'Test', 'asset')
      `;
      await tx.$executeRaw`
        INSERT INTO journal_entries (id, event_type, event_ref_type, event_ref_id, idempotency_key)
        VALUES (${entryId}::uuid, 'test', 'test', ${entryId}, ${`test:${entryId}`})
      `;
      await tx.$executeRaw`
        INSERT INTO journal_lines (id, entry_id, account_id, debit_paise, credit_paise)
        VALUES (${randomUUID()}::uuid, ${entryId}::uuid, ${accountId}::uuid, 10, 0)
      `;
    })).rejects.toThrow(/unbalanced/);
  });

  it('refuses an overdrawn customer wallet', async () => {
    const { prisma } = await import('@/lib/prisma');
    const userId = randomUUID();
    await expect(prisma.$transaction((tx) => postJournal(tx, {
      eventType: 'wallet_spend',
      eventRefType: 'test',
      eventRefId: userId,
      idempotencyKey: `test:${randomUUID()}`,
      lines: [
        {
          code: `WALLET:${userId}:reward`,
          name: 'Customer Wallet',
          type: 'liability',
          debitPaise: 100,
          creditPaise: 0,
        },
        {
          code: `AR_ORDER:${userId}`,
          name: 'Order Receivable',
          type: 'asset',
          debitPaise: 0,
          creditPaise: 100,
        },
      ],
    }))).rejects.toThrow(/overdrawn/);
  });
});
