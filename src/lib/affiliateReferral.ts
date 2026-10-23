/**
 * Earnchilada affiliate attribution.
 *
 * This is not the promo-engine invite cookie (`h1_referral` / User.referralToken).
 * Earnchilada matches affiliates later. Horeca1 only stores an optional code.
 *
 * Code policy (one rule for short links, ?ref=, manual entry, and the database):
 *   /^(?:H1-)?A-\d{1,6}$/ after trim + uppercase.
 * `A-0001` and the optional `H1-` prefix (`H1-A-0001`) are both kept as written.
 * No other shapes are accepted. Invalid input becomes null and never blocks signup.
 */

export const AFFILIATE_REFERRAL_COOKIE = 'h1_ref';
export const AFFILIATE_REFERRAL_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Optional H1- prefix, then A-, then 1–6 digits. Case-insensitive before normalize. */
export const AFFILIATE_REFERRAL_CODE = /^(?:H1-)?A-\d{1,6}$/;

/** Path form of the same code, optional trailing slash. */
const SHORT_LINK = /^\/((?:H1-)?A-\d{1,6})\/?$/i;

export function cleanReferral(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().toUpperCase();
  if (!normalized) return null;
  if (!AFFILIATE_REFERRAL_CODE.test(normalized)) return null;
  return normalized;
}

export function hasReferralField(body: unknown): boolean {
  return !!body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'referralCode');
}

export function referralFieldValue(body: unknown): unknown {
  if (!hasReferralField(body)) return undefined;
  return (body as { referralCode?: unknown }).referralCode;
}

/**
 * A submitted field wins, including an empty/invalid value (stored as null).
 * The cookie is used only when the client did not send the field.
 */
export function resolveRegistrationReferral(opts: {
  submitted?: unknown;
  submittedPresent: boolean;
  cookie?: unknown;
}): string | null {
  if (opts.submittedPresent) return cleanReferral(opts.submitted);
  return cleanReferral(opts.cookie);
}

export function affiliateCookieOptions(secure: boolean): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: AFFILIATE_REFERRAL_MAX_AGE_SECONDS,
  };
}

export interface AffiliateReferralDecision {
  kind: 'none' | 'continue' | 'redirect-register';
  /** Normalized code to store, or null when the existing valid cookie must be kept. */
  setCookie: string | null;
}

const REGISTRATION_PATH = /^\/(?:register|vendor\/register|brand\/register)(?:\/|$)/;

/**
 * First valid `h1_ref` wins. An invalid existing cookie does not block a later valid code.
 * A short link or `?ref=` opens `/register`, except when the visitor is already on a
 * registration route (those only receive the cookie, so the redirect cannot loop).
 */
export function decideAffiliateReferral(input: {
  pathname: string;
  refQuery: string | null;
  existingCookie: string | undefined;
}): AffiliateReferralDecision {
  const path = input.pathname.length > 1 ? input.pathname.replace(/\/+$/, '') : input.pathname;
  const short = path.match(SHORT_LINK);
  const fromPath = short ? cleanReferral(short[1]) : null;
  const fromQuery = input.refQuery != null && input.refQuery !== ''
    ? cleanReferral(input.refQuery)
    : null;
  const existingValid = cleanReferral(input.existingCookie);
  const incoming = fromPath ?? fromQuery;
  const setCookie = incoming && !existingValid ? incoming : null;
  const onRegistration = REGISTRATION_PATH.test(path);

  if (incoming && !onRegistration) {
    return { kind: 'redirect-register', setCookie };
  }
  if (setCookie) {
    return { kind: 'continue', setCookie };
  }
  return { kind: 'none', setCookie: null };
}
