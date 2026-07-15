/**
 * Hard client logout via CSRF form POST to Auth.js signout.
 *
 * Why a form (not fetch):
 * - `fetch` + default redirect follows Auth.js 302 and can drop Set-Cookie.
 * - `fetch` + `redirect: 'manual'` yields opaqueredirect; cookie clear is
 *   unreliable across hard navigations in some WebView clients (P2-12).
 * - A real HTML form POST lets the browser apply Set-Cookie on the response
 *   and navigate to callbackUrl in one step.
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

  let csrfToken = '';
  try {
    const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
    if (csrfRes.ok) {
      const csrfJson = (await csrfRes.json()) as { csrfToken?: string };
      csrfToken = csrfJson.csrfToken ?? '';
    }
  } catch {
    /* fall through to next-auth helper */
  }

  if (csrfToken && typeof document !== 'undefined') {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/auth/signout';
    form.style.display = 'none';

    const csrfInput = document.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = 'csrfToken';
    csrfInput.value = csrfToken;
    form.appendChild(csrfInput);

    const cbInput = document.createElement('input');
    cbInput.type = 'hidden';
    cbInput.name = 'callbackUrl';
    cbInput.value = callbackUrl;
    form.appendChild(cbInput);

    document.body.appendChild(form);
    form.submit();
    return;
  }

  try {
    const { signOut } = await import('next-auth/react');
    await signOut({ callbackUrl });
  } catch {
    if (typeof window !== 'undefined') {
      window.location.assign(callbackUrl);
    }
  }
}
