import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  AFFILIATE_REFERRAL_COOKIE,
  AFFILIATE_REFERRAL_MAX_AGE_SECONDS,
  affiliateCookieOptions,
  cleanReferral,
  decideAffiliateReferral,
  resolveRegistrationReferral,
} from '@/lib/affiliateReferral';

describe('cleanReferral', () => {
  it('accepts the documented A-0001 code', () => {
    expect(cleanReferral('A-0001')).toBe('A-0001');
  });

  it('uppercases lowercase input', () => {
    expect(cleanReferral('a-0001')).toBe('A-0001');
  });

  it('trims whitespace', () => {
    expect(cleanReferral('  a-0001  ')).toBe('A-0001');
  });

  it('keeps the optional H1- prefix', () => {
    expect(cleanReferral('h1-a-12')).toBe('H1-A-12');
    expect(cleanReferral('H1-A-000001')).toBe('H1-A-000001');
  });

  it('rejects invalid characters', () => {
    expect(cleanReferral('junk!!')).toBeNull();
    expect(cleanReferral('A-00O1')).toBeNull();
  });

  it('rejects empty values', () => {
    expect(cleanReferral('')).toBeNull();
    expect(cleanReferral('   ')).toBeNull();
    expect(cleanReferral(null)).toBeNull();
    expect(cleanReferral(undefined)).toBeNull();
  });

  it('rejects excessive length and unsupported formats', () => {
    expect(cleanReferral('A-0000001')).toBeNull();
    expect(cleanReferral('A-1234567')).toBeNull();
    expect(cleanReferral('B-0001')).toBeNull();
    expect(cleanReferral('H1-B-0001')).toBeNull();
    expect(cleanReferral('REF-A-0001')).toBeNull();
    expect(cleanReferral('A-0001-EXTRA')).toBeNull();
  });
});

describe('resolveRegistrationReferral', () => {
  it('uses a manual code when the field was submitted', () => {
    expect(resolveRegistrationReferral({
      submitted: 'a-9',
      submittedPresent: true,
      cookie: 'A-0001',
    })).toBe('A-9');
  });

  it('stores null when the submitted code is empty or invalid', () => {
    expect(resolveRegistrationReferral({
      submitted: '',
      submittedPresent: true,
      cookie: 'A-0001',
    })).toBeNull();
    expect(resolveRegistrationReferral({
      submitted: 'junk!!',
      submittedPresent: true,
      cookie: 'A-0001',
    })).toBeNull();
  });

  it('falls back to the cookie only when the field was omitted', () => {
    expect(resolveRegistrationReferral({
      submittedPresent: false,
      cookie: 'a-0002',
    })).toBe('A-0002');
    expect(resolveRegistrationReferral({
      submittedPresent: false,
      cookie: 'nope',
    })).toBeNull();
  });
});

describe('affiliate cookie', () => {
  it('is host-only, httpOnly, lax, and 30 days', () => {
    const secure = affiliateCookieOptions(true);
    const local = affiliateCookieOptions(false);
    expect(secure).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: AFFILIATE_REFERRAL_MAX_AGE_SECONDS,
    });
    expect(local.secure).toBe(false);
    expect(secure).not.toHaveProperty('domain');
    expect(local).not.toHaveProperty('domain');
    expect(AFFILIATE_REFERRAL_COOKIE).toBe('h1_ref');
    expect(AFFILIATE_REFERRAL_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30);
  });

  it('does not share a parent domain between demo and production', () => {
    for (const host of ['https://demo.horeca1.com', 'https://horeca1.com', 'https://www.horeca1.com']) {
      const req = new NextRequest(`${host}/A-0001`);
      const decision = decideAffiliateReferral({
        pathname: req.nextUrl.pathname,
        refQuery: req.nextUrl.searchParams.get('ref'),
        existingCookie: undefined,
      });
      const options = affiliateCookieOptions(req.nextUrl.protocol === 'https:');
      expect(decision.setCookie).toBe('A-0001');
      expect(options).not.toHaveProperty('domain');
      expect(req.nextUrl.hostname.endsWith('horeca1.com')).toBe(true);
    }
  });
});

describe('decideAffiliateReferral', () => {
  it('sets the cookie for a valid short link and redirects home', () => {
    expect(decideAffiliateReferral({
      pathname: '/A-0001',
      refQuery: null,
      existingCookie: undefined,
    })).toEqual({ kind: 'redirect-home', setCookie: 'A-0001' });
  });

  it('sets the cookie for a valid query referral without redirecting', () => {
    expect(decideAffiliateReferral({
      pathname: '/',
      refQuery: 'a-0001',
      existingCookie: undefined,
    })).toEqual({ kind: 'continue', setCookie: 'A-0001' });
  });

  it('keeps the first valid code', () => {
    expect(decideAffiliateReferral({
      pathname: '/A-0002',
      refQuery: null,
      existingCookie: 'A-0001',
    })).toEqual({ kind: 'redirect-home', setCookie: null });
    expect(decideAffiliateReferral({
      pathname: '/',
      refQuery: 'A-0002',
      existingCookie: 'A-0001',
    })).toEqual({ kind: 'none', setCookie: null });
  });

  it('ignores invalid codes and replaces an invalid existing cookie', () => {
    expect(decideAffiliateReferral({
      pathname: '/',
      refQuery: 'junk!!',
      existingCookie: undefined,
    })).toEqual({ kind: 'none', setCookie: null });
    expect(decideAffiliateReferral({
      pathname: '/A-0002',
      refQuery: null,
      existingCookie: 'junk!!',
    })).toEqual({ kind: 'redirect-home', setCookie: 'A-0002' });
  });

  it('leaves ordinary routes unchanged and does not loop on the homepage', () => {
    expect(decideAffiliateReferral({
      pathname: '/login',
      refQuery: null,
      existingCookie: undefined,
    })).toEqual({ kind: 'none', setCookie: null });
    expect(decideAffiliateReferral({
      pathname: '/admin',
      refQuery: null,
      existingCookie: 'A-0001',
    })).toEqual({ kind: 'none', setCookie: null });
    expect(decideAffiliateReferral({
      pathname: '/',
      refQuery: null,
      existingCookie: 'A-0001',
    }).kind).not.toBe('redirect-home');
  });

  it('accepts the optional prefix on a short link', () => {
    expect(decideAffiliateReferral({
      pathname: '/h1-a-7',
      refQuery: null,
      existingCookie: undefined,
    })).toEqual({ kind: 'redirect-home', setCookie: 'H1-A-7' });
  });
});
