/**
 * After `npm run build`, production middleware inlines
 * `secureCookie: true` (from NODE_ENV). On http://localhost that makes
 * getToken miss `authjs.session-token` and 307 portal routes to /login.
 *
 * Source fix is in src/proxy.ts (protocol-based secureCookie). Until the
 * next full rebuild is deployed locally, run this once after build:
 *   node scripts/patch-standalone-e2e-middleware.mjs
 */
import './patch-middleware-secure-cookie.mjs';
import './patch-middleware-businesses.mjs';
