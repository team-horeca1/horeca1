/**
 * Hard client logout — CSRF POST to Auth.js signout, then hard navigate.
 * Avoids next-auth `signOut({ redirect: false })` + immediate `location.href`
 * races that leave the JWT session cookie intact (P2-12).
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
  try {
    const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
    const csrfJson = (await csrfRes.json()) as { csrfToken?: string };
    await fetch('/api/auth/signout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrfToken: csrfJson.csrfToken ?? '',
        callbackUrl,
        json: 'true',
      }),
    });
  } catch {
    /* still navigate so the user leaves the authenticated UI */
  }
  if (typeof window !== 'undefined') {
    window.location.assign(callbackUrl);
  }
}
