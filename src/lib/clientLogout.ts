/**
 * Hard client logout (P2-12).
 * Clears Auth.js cookies via /api/v1/auth/logout FIRST (authoritative),
 * then best-effort Auth.js signout, then hard navigate.
 */
const SIGNING_OUT_FLAG = 'horeca_signing_out';

export function markSigningOut(): void {
  try {
    sessionStorage.setItem(SIGNING_OUT_FLAG, '1');
  } catch {
    /* ignore */
  }
}

/** True if this tab initiated logout (consumes the flag). */
export function consumeSigningOutFlag(): boolean {
  try {
    if (sessionStorage.getItem(SIGNING_OUT_FLAG)) {
      sessionStorage.removeItem(SIGNING_OUT_FLAG);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function clientLogout(callbackUrl = '/'): Promise<void> {
  markSigningOut();

  // Authoritative cookie wipe — must run even if Auth.js signout hangs/429s.
  try {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    /* continue */
  }

  try {
    const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
    if (csrfRes.ok) {
      const csrfJson = (await csrfRes.json()) as { csrfToken?: string };
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          csrfToken: csrfJson.csrfToken ?? '',
          callbackUrl,
          json: 'true',
        }),
      });
    }
  } catch {
    /* cookies already cleared above */
  }

  if (typeof window !== 'undefined') {
    window.location.assign(callbackUrl);
  }
}
