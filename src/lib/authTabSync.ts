/**
 * Cross-tab auth bus — keeps React session state aligned with the shared JWT cookie.
 *
 * Browsers share one Auth.js session cookie per origin. When Tab A switches
 * account / signs out, Tab B's useSession() would otherwise stay stale forever
 * (SessionProvider has refetchOnWindowFocus disabled to avoid modal flashes).
 *
 * BroadcastChannel is primary; localStorage epoch is the Safari / older-browser
 * fallback. Payloads never include tokens or PII beyond opaque IDs.
 */

export type AuthTabEventType =
  | 'session-changed'
  | 'signed-out'
  | 'account-switched'
  | 'impersonation-changed';

export interface AuthTabEvent {
  type: AuthTabEventType;
  userId?: string | null;
  activeBusinessAccountId?: string | null;
  activeOutletId?: string | null;
  epoch: number;
  /** Originating tab id — receivers ignore their own broadcasts. */
  tabId: string;
}

const CHANNEL = 'horeca-auth';
const STORAGE_KEY = 'horeca_auth_epoch';

let tabId: string | null = null;
let channel: BroadcastChannel | null = null;

function getTabId(): string {
  if (typeof window === 'undefined') return 'ssr';
  if (!tabId) {
    try {
      tabId = sessionStorage.getItem('horeca_auth_tab_id');
      if (!tabId) {
        tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
        sessionStorage.setItem('horeca_auth_tab_id', tabId);
      }
    } catch {
      tabId = `t-${Math.random().toString(36).slice(2, 11)}`;
    }
  }
  return tabId;
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      channel = null;
    }
  }
  return channel;
}

export function broadcastAuthEvent(
  type: AuthTabEventType,
  payload: Omit<AuthTabEvent, 'type' | 'epoch' | 'tabId'> = {},
): void {
  if (typeof window === 'undefined') return;
  const event: AuthTabEvent = {
    type,
    ...payload,
    epoch: Date.now(),
    tabId: getTabId(),
  };
  try {
    getChannel()?.postMessage(event);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
  } catch {
    /* ignore */
  }
}

export function subscribeAuthTabEvents(handler: (event: AuthTabEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onMessage = (ev: MessageEvent<AuthTabEvent>) => {
    const data = ev.data;
    if (!data || typeof data !== 'object' || !data.type || !data.epoch) return;
    if (data.tabId === getTabId()) return;
    handler(data);
  };

  const ch = getChannel();
  ch?.addEventListener('message', onMessage);

  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== STORAGE_KEY || !ev.newValue) return;
    try {
      const data = JSON.parse(ev.newValue) as AuthTabEvent;
      if (!data?.type || !data.epoch) return;
      if (data.tabId === getTabId()) return;
      handler(data);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    ch?.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
  };
}

export function thisTabId(): string {
  return getTabId();
}

/** Bootstrap lock so multiple tabs don't race auto-switchAccount(primary). */
const BOOTSTRAP_LOCK_KEY = 'horeca_auth_bootstrap_lock';
const BOOTSTRAP_LOCK_TTL_MS = 8_000;

export function tryAcquireBootstrapLock(): boolean {
  if (typeof sessionStorage === 'undefined') return true;
  try {
    const raw = localStorage.getItem(BOOTSTRAP_LOCK_KEY);
    if (raw) {
      const { tabId: owner, until } = JSON.parse(raw) as { tabId: string; until: number };
      if (until > Date.now() && owner !== getTabId()) return false;
    }
    localStorage.setItem(
      BOOTSTRAP_LOCK_KEY,
      JSON.stringify({ tabId: getTabId(), until: Date.now() + BOOTSTRAP_LOCK_TTL_MS }),
    );
    return true;
  } catch {
    return true;
  }
}

export function releaseBootstrapLock(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(BOOTSTRAP_LOCK_KEY);
    if (!raw) return;
    const { tabId: owner } = JSON.parse(raw) as { tabId: string };
    if (owner === getTabId()) localStorage.removeItem(BOOTSTRAP_LOCK_KEY);
  } catch {
    /* ignore */
  }
}
