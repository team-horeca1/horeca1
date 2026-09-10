import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-auth/react', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/authTabSync', () => ({ broadcastAuthEvent: vi.fn() }));

import {
  DISMISS_KEY,
  FORCE_PICKER_COOKIE,
  SETTLED_KEY,
  clearDismissFlag,
  clearForcePickerCookie,
  isPickerSettled,
  markPickerSettled,
  setForcePickerCookie,
} from '@/lib/postLoginPicker';

function installBrowserStubs(protocol: 'http:' | 'https:' = 'https:') {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const cookies = new Map<string, string>();

  vi.stubGlobal('localStorage', {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => {
      local.set(k, String(v));
    },
    removeItem: (k: string) => {
      local.delete(k);
    },
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => {
      session.set(k, String(v));
    },
    removeItem: (k: string) => {
      session.delete(k);
    },
  });
  vi.stubGlobal('window', { location: { protocol } });
  vi.stubGlobal('document', {
    get cookie() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(raw: string) {
      const [pair, ...attrParts] = raw.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const attrs = attrParts.join(';').toLowerCase();
      if (attrs.includes('max-age=0') || value === '') {
        cookies.delete(name);
        return;
      }
      cookies.set(name, value);
    },
  });
}

describe('post-login picker settle', () => {
  beforeEach(() => {
    installBrowserStubs('https:');
  });

  it('does not treat a leftover stamp as settled for a new login armedAt', () => {
    markPickerSettled(111);
    clearDismissFlag();
    expect(isPickerSettled(222)).toBe(false);
  });

  it('matches the login stamp after a pick', () => {
    markPickerSettled(111);
    expect(isPickerSettled(111)).toBe(true);
  });

  it('stays settled after JWT clears armedAt (dashboard reload)', () => {
    markPickerSettled(111);
    expect(isPickerSettled(null)).toBe(true);
    expect(isPickerSettled(undefined)).toBe(true);
  });

  it('fresh login without a pick is not settled', () => {
    expect(isPickerSettled(null)).toBe(false);
    expect(isPickerSettled(111)).toBe(false);
  });

  it('clears the force-pick cookie including the secure flag used on https', () => {
    setForcePickerCookie();
    expect(document.cookie).toContain(`${FORCE_PICKER_COOKIE}=1`);
    clearForcePickerCookie();
    expect(document.cookie).not.toContain(`${FORCE_PICKER_COOKIE}=1`);
  });

  it('records dismiss so the modal does not reopen on the next page', () => {
    markPickerSettled(111);
    expect(sessionStorage.getItem(DISMISS_KEY)).toBe('1');
    expect(localStorage.getItem(SETTLED_KEY)).toBe('111');
  });
});
