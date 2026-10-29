// Repeating reconciliation. One process, one Redis lock, so a second tick
// or a second container cannot capture or refund the same payment twice.
// A failed tick is logged and the next interval still runs.
//
// Run: npx tsx src/workers/reconciliation.scheduler.ts

import { redis } from '@/lib/redis';
import { reconcilePayments } from '@/workers/reconciliation.worker';

export const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;
/** Outlives one interval so an in-flight run makes the next tick skip. A dead process releases the lock when this expires. */
export const RECONCILIATION_LOCK_TTL_SEC = 10 * 60;
export const RECONCILIATION_LOCK_KEY = 'horeca1:reconciliation:lock';

export function reconciliationTickDecision(lockResult: string | null): 'run' | 'skip' {
  return lockResult === 'OK' ? 'run' : 'skip';
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function runReconciliationTick(): Promise<'ran' | 'skipped' | 'failed'> {
  let lock: string | null = null;
  try {
    lock = await redis.set(
      RECONCILIATION_LOCK_KEY,
      String(process.pid),
      'EX',
      RECONCILIATION_LOCK_TTL_SEC,
      'NX',
    );
  } catch (err) {
    console.error('[Reconciliation] lock failed', errorText(err));
    return 'failed';
  }

  if (reconciliationTickDecision(lock) === 'skip') {
    console.log('[Reconciliation] skipped; another run holds the lock');
    return 'skipped';
  }

  try {
    await reconcilePayments();
    console.log('[Reconciliation] tick finished');
    return 'ran';
  } catch (err) {
    console.error('[Reconciliation] tick failed', errorText(err));
    return 'failed';
  } finally {
    try {
      await redis.del(RECONCILIATION_LOCK_KEY);
    } catch (err) {
      console.error('[Reconciliation] lock release failed', errorText(err));
    }
  }
}

async function loop(): Promise<void> {
  console.log(`[Reconciliation] scheduler started interval_ms=${RECONCILIATION_INTERVAL_MS}`);
  const once = async () => {
    try {
      await runReconciliationTick();
    } catch (err) {
      console.error('[Reconciliation] tick crashed', errorText(err));
    }
  };
  await once();
  setInterval(() => {
    void once();
  }, RECONCILIATION_INTERVAL_MS);
}

if (require.main === module || (process.argv[1] && process.argv[1].endsWith('reconciliation.scheduler.ts'))) {
  void loop();
}
