import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-auth/react', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/authTabSync', () => ({ broadcastAuthEvent: vi.fn() }));

import {
  DISMISS_KEY,
  FORCE_PICKER_COOKIE,
  SETTLED_KEY,
  clearDismissFlag,
  clearForcePickerCookie,
  destinationAfterAccountPick,
  isPickerPending,
  isPickerSettled,
  markLoginHandoff,
  markPickerInFlight,
  markPickerSettled,
  prepareFreshLoginNavigation,
  resolvePostLoginDestination,
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

describe('resolvePostLoginDestination', () => {
  it('sends supplier to businesses so they can enter a store', () => {
    expect(
      resolvePostLoginDestination('/', { isCustomer: false, isVendor: true, isBrand: false }),
    ).toBe('/businesses?type=supplier');
  });

  it('sends brand to the portal when redirect is marketplace home', () => {
    expect(
      resolvePostLoginDestination('/', { isCustomer: false, isVendor: false, isBrand: true }),
    ).toBe('/brand/portal');
  });

  it('keeps restaurant on the marketplace home', () => {
    expect(
      resolvePostLoginDestination('/', { isCustomer: true, isVendor: false, isBrand: false }),
    ).toBe('/');
  });

  it('keeps an explicit deep-link for suppliers', () => {
    expect(
      resolvePostLoginDestination('/cart', { isCustomer: false, isVendor: true, isBrand: false }),
    ).toBe('/cart');
  });
});

describe('destinationAfterAccountPick', () => {
  it('sends brand to the brand portal', () => {
    expect(destinationAfterAccountPick({ id: 'b1', isBrand: true, isVendor: false, isCustomer: false }))
      .toBe('/brand/portal');
  });

  it('sends supplier to that business store list', () => {
    expect(destinationAfterAccountPick({ id: 'v1', isVendor: true, isBrand: false, isCustomer: false }))
      .toBe('/vendor/businesses/v1');
  });

  it('sends restaurant to the marketplace', () => {
    expect(destinationAfterAccountPick({ id: 'c1', isCustomer: true, isVendor: false, isBrand: false }))
      .toBe('/');
  });
});

describe('isPickerPending', () => {
  beforeEach(() => {
    installBrowserStubs('https:');
  });

  it('is owed while pickerArmedAt is fresh even without forceAccountPicker', () => {
    expect(isPickerPending({ pickerArmedAt: Date.now(), totalAccountCount: 3 })).toBe(true);
  });

  it('is not owed after this login was answered', () => {
    const armedAt = Date.now();
    markPickerSettled(armedAt);
    expect(isPickerPending({ pickerArmedAt: armedAt, totalAccountCount: 3 })).toBe(false);
  });

  it('is not owed for a single-account login', () => {
    expect(isPickerPending({ pickerArmedAt: Date.now(), totalAccountCount: 1 })).toBe(false);
  });

  it('is not owed after the user already picked (in-flight)', () => {
    markPickerInFlight();
    expect(isPickerPending({ pickerArmedAt: Date.now(), totalAccountCount: 3 })).toBe(false);
  });
});

describe('prepareFreshLoginNavigation', () => {
  beforeEach(() => {
    installBrowserStubs('https:');
    vi.stubGlobal('window', {
      location: { protocol: 'https:', href: '/login', assign: vi.fn() },
    });
  });

  it('does not overwrite a Brand pick with a late login-page redirect', async () => {
    markLoginHandoff();
    markPickerInFlight();
    markPickerSettled(Date.now());
    await prepareFreshLoginNavigation(null, { picker: false });
    expect(window.location.href).toBe('/login');
  });
});
