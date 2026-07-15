/**
 * Hard client logout — CSRF POST to Auth.js signout, then hard navigate.
 * Avoids next-auth `signOut({ redirect: false })` + immediate `location.href`
 * races that leave the JWT session cookie intact (P2-12).
 *
 * Falls back to next-auth `signOut({ callbackUrl })` if CSRF/signout POST
 * fails (e.g. transient network). Signout/CSRF are not rate-limited server-side.
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
  let cleared = false;
  try {
    const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
    if (csrfRes.ok) {
      const csrfJson = (await csrfRes.json()) as { csrfToken?: string };
      const signoutRes = await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          csrfToken: csrfJson.csrfToken ?? '',
          callbackUrl,
          json: 'true',
        }),
      });
      cleared = signoutRes.ok;
    }
  } catch {
    /* fall through */
  }

  if (!cleared) {
    try {
      const { signOut } = await import('next-auth/react');
      await signOut({ callbackUrl });
      return; // signOut with callbackUrl navigates
    } catch {
      /* still force navigate below */
    }
  }

  if (typeof window !== 'undefined') {
    window.location.assign(callbackUrl);
  }
}
