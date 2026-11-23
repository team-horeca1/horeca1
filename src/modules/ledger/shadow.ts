import type { Prisma } from '@prisma/client';
import { ledgerShadowEnabled } from './flags';
import { postJournal, type PostInput } from './post';

/** Shadow posts share the business transaction. A failed post is rolled back to a savepoint. */
export async function shadowPost(tx: Prisma.TransactionClient, input: PostInput): Promise<void> {
  if (!ledgerShadowEnabled()) return;
  let savepoint = false;
  try {
    await tx.$executeRawUnsafe('SAVEPOINT ledger_shadow');
    savepoint = true;
  } catch {
    savepoint = false;
  }
  try {
    await postJournal(tx, input);
    if (savepoint) await tx.$executeRawUnsafe('RELEASE SAVEPOINT ledger_shadow');
  } catch (error) {
    if (savepoint) {
      try {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ledger_shadow');
      } catch {
        // The transaction was already aborted. The caller still sees the business error if any.
      }
    }
    console.error('[ledger-shadow]', input.idempotencyKey, error instanceof Error ? error.message : error);
  }
}
