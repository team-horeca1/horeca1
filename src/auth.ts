import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { loadActiveContext, type ActiveContext } from '@/lib/activeContext';
import { FORCE_PICKER_COOKIE } from '@/lib/postLoginPicker';
import { redis } from '@/lib/redis';
import { clearSessionRevoked, isSessionRevoked } from '@/lib/sessionStale';
import { provisionDefaultAccount } from '@/lib/provisionAccount';
import { ensureAdminInheritsShoppingAccount } from '@/lib/adminShoppingInherit';
import { uniqueHcid } from '@/lib/hcid';
import { phoneLookupVariants } from '@/lib/phone';
import { isRegisterEmailOtpEnabled } from '@/lib/config/registerEmailOtp';
import type { PermissionKey, PermissionsJson } from '@/lib/permissions/registry';
import { ALL_PERMISSION_KEYS } from '@/lib/permissions/registry';
import { flatten } from '@/lib/permissions/engine';
import { isOwnerRoleName } from '@/lib/permissions/portalFeatures';
import type { Role } from '@prisma/client';
import { backfillAdminPasswordCipherIfMissing } from '@/lib/adminPasswordCipher';
import { emitEvent } from '@/events/emitter';
import { REFERRAL_COOKIE } from '@/lib/referralCookie';

function vendorSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return `${base}-${Date.now().toString(36)}`;
}

function brandSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return `${base}-${Date.now().toString(36)}`;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  ...(process.env.NODE_ENV === 'development' && { rateLimit: false }),
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60,
    // Re-run the jwt callback frequently so permission changes apply on refresh
    // without requiring logout (default 24h kept sessions stale too long).
    updateAge: 60,
  },

  providers: [
    // ── OTP (phone or email) — customers, vendors, team members ──────────
    Credentials({
      id: 'otp',
      name: 'OTP',
      credentials: {
        phone: {},
        loginEmail: {},
        code: {},
        fullName: {},
        businessName: {},
        email: {},
        password: {},
        role: {},
        isRegister: {},
        gstNumber: {},
        panNumber: {},
        fssaiNumber: {},
        tradeName: {},
        displayName: {},
        addressLine: {},
        flatInfo: {},
        city: {},
        state: {},
        pincode: {},
        salutation: {},
        firstName: {},
        lastName: {},
        designation: {},
        businessType: {},
        subType: {},
        cuisine: {},
        gstTreatment: {},
        placeOfSupply: {},
        outletName: {},
        latitude: {},
        longitude: {},
        placeId: {},
      },
      async authorize(credentials) {
        const phoneRaw = String(credentials?.phone ?? '').replace(/\D/g, '');
        const phone = phoneRaw.length === 12 ? phoneRaw.replace(/^91/, '') : phoneRaw;
        const loginEmail = String(credentials?.loginEmail ?? '').trim().toLowerCase();
        const code = String(credentials?.code ?? '').trim();
        const isRegister = credentials?.isRegister === 'true' || credentials?.isRegister === true;
        if (!code) return null;

        const usePhone = !!phone;
        const useEmail = !usePhone && !!loginEmail;
        if (useEmail && isRegister && !isRegisterEmailOtpEnabled()) return null;
        if (!usePhone && !useEmail) return null;

        const record = await prisma.otpCode.findFirst({
          where: usePhone
            ? { phone, used: false, expiresAt: { gt: new Date() } }
            : { email: loginEmail, used: false, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        });
        if (!record || record.code !== code) return null;

        await prisma.otpCode.update({ where: { id: record.id }, data: { used: true } });

        let user = usePhone
          ? await prisma.user.findFirst({
              where: { phone: { in: phoneLookupVariants(phone) } },
              select: { id: true, email: true, fullName: true, role: true, image: true, isActive: true },
            })
          : await prisma.user.findUnique({
              where: { email: loginEmail },
              select: { id: true, email: true, fullName: true, role: true, image: true, isActive: true },
            });

        if (useEmail && !user && !isRegister) return null;

        if (!user && (usePhone || (useEmail && isRegister))) {
          const fullName = String(credentials?.fullName ?? '').trim()
            || (usePhone ? phone : loginEmail);
          const businessName = String(credentials?.businessName ?? '').trim() || null;
          const rawEmail = useEmail
            ? loginEmail
            : String(credentials?.email ?? '').trim().toLowerCase();
          const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : null;
          const role = credentials?.role === 'vendor'
            ? 'vendor'
            : credentials?.role === 'brand'
              ? 'brand'
              : 'customer';

          const str = (k: keyof typeof credentials) => {
            const v = credentials?.[k];
            return v != null && String(v).trim() ? String(v).trim() : null;
          };
          const gstNumber = credentials?.gstNumber ? String(credentials.gstNumber).toUpperCase().trim() : null;
          const panNumber = credentials?.panNumber ? String(credentials.panNumber).toUpperCase().trim() : null;
          const fssaiNumber = str('fssaiNumber');
          const tradeName = str('tradeName') ?? str('displayName');
          const addressLine = str('addressLine');
          const flatInfo = str('flatInfo');
          const city = str('city');
          const state = str('state');
          const pincode = str('pincode');
          const salutation = str('salutation');
          const firstName = str('firstName');
          const lastName = str('lastName');
          const designation = str('designation');
          const businessType = str('businessType');
          const subType = str('subType');
          const cuisine = str('cuisine');
          const gstTreatment = str('gstTreatment');
          const placeOfSupply = str('placeOfSupply');
          const outletName = str('outletName');
          const latRaw = str('latitude');
          const lngRaw = str('longitude');
          const latitude = latRaw ? Number(latRaw) : null;
          const longitude = lngRaw ? Number(lngRaw) : null;
          const placeId = str('placeId');

          const rawPassword = String(credentials?.password ?? '');
          if (useEmail && isRegister && rawPassword.length < 6) return null;

          const emailTaken = email
            ? !!(await prisma.user.findUnique({ where: { email }, select: { id: true } }))
            : false;
          const finalEmail = emailTaken ? null : email;

          const passwordHash = rawPassword.length >= 6 ? await bcrypt.hash(rawPassword, 10) : null;

          const hcidDisplay = await uniqueHcid();
          user = await prisma.user.create({
            data: {
              phone: usePhone ? phone : null,
              fullName,
              businessName,
              email: finalEmail,
              password: passwordHash,
              role,
              isActive: true,
              hcidDisplay,
              gstNumber,
              pincode,
            },
            select: { id: true, email: true, fullName: true, role: true, image: true, isActive: true },
          });

          // V2.2: provision the user's BusinessAccount + primary Outlet + Owner UserRole.
          const provision = await provisionDefaultAccount({
            userId: user.id,
            kind: role === 'vendor' ? 'vendor' : role === 'brand' ? 'brand' : 'customer',
            businessName,
            fullName,
            gstNumber,
            gstin: gstNumber ?? undefined,
            displayName: tradeName ?? undefined,
            pan: panNumber ?? undefined,
            fssaiNumber: fssaiNumber ?? undefined,
            addressLine: (flatInfo && addressLine ? `${flatInfo}, ${addressLine}` : addressLine) ?? undefined,
            flatInfo: flatInfo ?? undefined,
            city: city ?? undefined,
            state: state ?? undefined,
            pincode: pincode ?? undefined,
            salutation: salutation ?? undefined,
            firstName: firstName ?? undefined,
            lastName: lastName ?? undefined,
            designation: designation ?? undefined,
            businessType: businessType ?? undefined,
            subType: subType ?? undefined,
            cuisine: cuisine ?? undefined,
            gstTreatment: gstTreatment ?? undefined,
            placeOfSupply: placeOfSupply ?? undefined,
            outletName: outletName ?? undefined,
            latitude: Number.isFinite(latitude) ? latitude : undefined,
            longitude: Number.isFinite(longitude) ? longitude : undefined,
            placeId: placeId ?? undefined,
          });

          if (role === 'vendor') {
            await prisma.vendor.create({
              data: {
                userId: user.id,
                businessAccountId: provision.businessAccountId,
                businessName: businessName ?? fullName,
                slug: vendorSlug(businessName ?? fullName),
                isActive: false,
                isVerified: false,
              },
            });
          }

          if (role === 'brand') {
            await prisma.brand.create({
              data: {
                userId: user.id,
                businessAccountId: provision.businessAccountId,
                name: businessName ?? fullName,
                slug: brandSlug(businessName ?? fullName),
                approvalStatus: 'pending',
                isActive: false,
              },
            });
          }

          let referralToken: string | undefined;
          try {
            const { cookies } = await import('next/headers');
            const raw = (await cookies()).get(REFERRAL_COOKIE)?.value?.trim();
            if (raw && /^[A-Za-z0-9_-]{16,64}$/.test(raw)) referralToken = raw;
          } catch {
            // authorize() can run outside a request cookie store
          }
          emitEvent('UserRegistered', {
            userId: user.id,
            email: user.email ?? '',
            role,
            referralToken,
          });
        }

        if (!user || !user.isActive) return null;

        return { id: user.id, email: user.email ?? undefined, name: user.fullName, role: user.role, image: user.image ?? undefined };
      },
    }),

    // ── Phone-or-email + password ──
    //    V2.2 removed the legacy LinkedAccount switchToken branch; the new
    //    BusinessAccount switcher uses POST /api/v1/auth/switch-business-account
    //    followed by useSession().update(...) to rotate the JWT in place.
    Credentials({
      id: 'credentials',
      name: 'credentials',
      credentials: {
        email: { label: 'Phone or email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const identifier = String(credentials?.email ?? '').trim();
        const password = String(credentials?.password ?? '');
        if (!identifier || !password) return null;

        const looksEmail = identifier.includes('@');
        const phoneRawDigits = identifier.replace(/\D/g, '');
        const phoneDigits = phoneRawDigits.length === 12 ? phoneRawDigits.replace(/^91/, '') : phoneRawDigits;

        const userSelect = {
          id: true,
          email: true,
          password: true,
          adminPasswordCipher: true,
          fullName: true,
          role: true,
          image: true,
          isActive: true,
        } as const;

        const user = looksEmail
          ? await prisma.user.findUnique({
              where: { email: identifier.toLowerCase() },
              select: userSelect,
            })
          : (phoneDigits.length === 10
              ? await prisma.user.findFirst({
                  where: { phone: { in: phoneLookupVariants(phoneDigits) } },
                  select: userSelect,
                })
              : null);

        if (!user || !user.password || !user.isActive) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        // Capture plaintext for admin Login Access when cipher is missing (self-signup, etc.).
        void backfillAdminPasswordCipherIfMissing(user.id, password, user.adminPasswordCipher);

        return { id: user.id, email: user.email ?? undefined, name: user.fullName, role: user.role, image: user.image ?? undefined };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session: updatePayload }) {
      // First sign-in or fresh login
      if (user) {
        token.id = user.id;
        token.role = ((user as { role?: Role }).role) ?? 'customer';
        delete token.invalidated;
        // Clear any leftover revoke flag from a prior delete of a recycled id (defensive).
        if (user.id) void clearSessionRevoked(user.id);
        if (token.role === 'admin') {
          try {
            const adminMembership = await prisma.adminTeamMember.findUnique({
              where: { userId: token.id as string },
              select: { role: true },
            });
            token.adminTeamRole = adminMembership?.role ?? 'owner';
          } catch (err) {
            console.error('[auth.jwt] adminTeamMember lookup failed on sign-in:', err);
            token.adminTeamRole = 'owner';
          }
        }
        // Pick the primary BusinessAccount + primary Outlet (V2.2).
        // loadActiveContext is wrapped so a transient DB error here doesn't
        // poison the rest of the token (role still gets set above).
        try {
          const active = await loadOrProvisionActiveContext(
            token.id as string,
            (token.role as string) ?? 'customer',
            null,
            null,
          );
          applyActiveContext(token, active);
          // Multi-account users must pick an active business on every fresh login.
          const totalAccounts = (token.totalAccountCount as number | undefined) ?? 0;
          if (totalAccounts > 1 && token.role !== 'admin') {
            token.forceAccountPicker = true;
            try {
              const cookieStore = await cookies();
              cookieStore.set(FORCE_PICKER_COOKIE, '1', {
                maxAge: 5 * 60,
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
              });
            } catch (err) {
              console.error('[auth.jwt] failed to set force account picker cookie:', err);
            }
          }
        } catch (err) {
          console.error('[auth.jwt] loadActiveContext failed on sign-in:', err);
          applyActiveContext(token, null);
        }
        // For admin users, merge the admin-template permissions on top of any
        // BusinessAccount permissions already in the token. Admin staff are
        // intentionally outside the BusinessAccount system (see
        // multi-account-rbac-implementation-plan.md §2), so this is the only
        // path that lights up the admin permission set.
        if (token.role === 'admin') {
          await applyAdminPermissions(token);
        }
        await stampUserSyncedAt(token);
      }

      // Force-logout path: deleted, deactivated, or explicitly revoked users.
      // Returning null clears the Auth.js session cookie (see @auth/core session action).
      if (token.id && !user) {
        const dead = await isTokenUserDead(token.id as string);
        if (dead) {
          return null;
        }
      }

      // Reload permissions from DB when markSessionStale() fired or the user row
      // changed (e.g. team removal demoted role) — not on every passive tick.
      if (token.id && !user && trigger !== 'update') {
        try {
          const staleKey = `session:stale:${token.id as string}`;
          const redisStale = await redis.get(staleKey);
          let needsReload = !!redisStale;
          if (!needsReload) {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.id as string },
              select: { updatedAt: true, isActive: true },
            });
            if (!dbUser || !dbUser.isActive) {
              return null;
            }
            const syncedAt = (token.userSyncedAt as number | undefined) ?? 0;
            needsReload = dbUser.updatedAt.getTime() > syncedAt;
          }
          if (needsReload) {
            if (redisStale) await redis.del(staleKey);

            const freshRole = await refreshUserRoleFromDb(token);
            if (freshRole === null) {
              return null;
            }

            const active = await loadOrProvisionActiveContext(
              token.id as string,
              freshRole,
              (token.activeBusinessAccountId as string | null) ?? null,
              (token.activeOutletId as string | null) ?? null,
            );
            applyActiveContext(token, active);
            if (token.role === 'admin') {
              await applyAdminPermissions(token);
            } else {
              clearAdminTokenFields(token);
            }
            await stampUserSyncedAt(token);
          }
        } catch (err) {
          console.error('[auth.jwt] permission refresh failed:', err);
        }
      }

      // Session.update({ activeBusinessAccountId, activeOutletId }) — used by switch endpoints
      // AND by the generic updateSession() refresh path (e.g. after "Become a vendor",
      // after admin approval, etc). The role refresh below MUST run independently of
      // loadActiveContext so a transient failure on one side never returns a stale role.
      if (trigger === 'update' && token.id) {
        const u = (updatePayload ?? {}) as {
          activeBusinessAccountId?: string;
          activeOutletId?: string;
          activeVendorId?: string;
          accountPickerCompleted?: boolean;
        };

        if (u.accountPickerCompleted === true) {
          delete token.forceAccountPicker;
        }

        const targetAccountId = u.activeBusinessAccountId ?? (token.activeBusinessAccountId as string | undefined) ?? null;
        const targetOutletId = u.activeOutletId ?? (token.activeOutletId as string | undefined) ?? null;
        const targetVendorId = u.activeVendorId ?? (token.activeVendorId as string | undefined) ?? null;

        let freshRole: string | null = null;
        try {
          freshRole = await refreshUserRoleFromDb(token);
        } catch (err) {
          console.error('[auth.jwt] user role refresh failed on update:', err);
        }

        try {
          const active = await loadOrProvisionActiveContext(
            token.id as string,
            freshRole ?? (token.role as string) ?? 'customer',
            targetAccountId,
            targetOutletId,
            targetVendorId,
          );
          applyActiveContext(token, active);
        } catch (err) {
          console.error('[auth.jwt] loadActiveContext failed on update:', err);
          // Keep existing context fields rather than wiping them on a transient DB blip.
        }

        try {
          if (freshRole === 'admin') {
            try {
              const adminMembership = await prisma.adminTeamMember.findUnique({
                where: { userId: token.id as string },
                select: { role: true },
              });
              token.adminTeamRole = adminMembership?.role ?? 'owner';
            } catch (err) {
              console.error('[auth.jwt] adminTeamMember lookup failed on update:', err);
              token.adminTeamRole = 'owner';
            }
            await applyAdminPermissions(token);
          } else {
            clearAdminTokenFields(token);
          }
        } catch (err) {
          console.error('[auth.jwt] user role refresh failed on update:', err);
          // Keep the previous role rather than returning an unparseable token.
        }
        await stampUserSyncedAt(token);
      }
      return token;
    },

    async session({ session, token }) {
      // jwt callback returned null / cleared identity → unauthenticated client session
      if (!token?.id || token.invalidated === true) {
        return { ...session, user: undefined as unknown as typeof session.user };
      }
      if (session.user) {
        const u = session.user as unknown as Record<string, unknown>;
        u.id = token.id as string;
        u.role = token.role as string;
        if (token.adminTeamRole) u.adminTeamRole = token.adminTeamRole as string;
        if (token.hcidDisplay) u.hcidDisplay = token.hcidDisplay as string;
        if (token.activeBusinessAccountId) u.activeBusinessAccountId = token.activeBusinessAccountId as string;
        if (token.activeBusinessAccountType) u.activeBusinessAccountType = token.activeBusinessAccountType as Record<string, boolean>;
        if (token.activeOutletId) u.activeOutletId = token.activeOutletId as string;
        if (Array.isArray(token.accessibleOutletIds)) u.accessibleOutletIds = token.accessibleOutletIds as string[];
        if (token.permissions) u.permissions = token.permissions as string[];
        if (typeof token.isPermissionOwner === 'boolean') u.isPermissionOwner = token.isPermissionOwner;
        u.adminPermissions = Array.isArray(token.adminPermissions) ? (token.adminPermissions as string[]) : [];
        u.isAdminPermissionOwner = token.isAdminPermissionOwner === true;
        if (token.availableAccounts) u.availableAccounts = token.availableAccounts as unknown[];
        if (typeof token.availableAccountsTruncated === 'boolean') u.availableAccountsTruncated = token.availableAccountsTruncated;
        if (typeof token.totalAccountCount === 'number') u.totalAccountCount = token.totalAccountCount;
        if (token.forceAccountPicker === true) u.forceAccountPicker = true;
        if (token.activeVendorId) u.activeVendorId = token.activeVendorId as string;
        if (token.activeBrandId) u.activeBrandId = token.activeBrandId as string;
        if (Array.isArray(token.availableStores)) u.availableStores = token.availableStores;
        if (typeof token.isStoreScopedOnly === 'boolean') u.isStoreScopedOnly = token.isStoreScopedOnly;
      }
      return session;
    },
  },

  pages: {
    signIn: '/',
  },
});

// ─── helpers ────────────────────────────────────────────────────────────

/** True when the JWT subject must be signed out (deleted / inactive / revoked). */
async function isTokenUserDead(userId: string): Promise<boolean> {
  try {
    if (await isSessionRevoked(userId)) return true;
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    return !dbUser || !dbUser.isActive;
  } catch (err) {
    console.error('[auth.jwt] isTokenUserDead failed:', err);
    return false;
  }
}

/**
 * Load the AccountRole assigned to an admin user via AdminTeamMember.roleId
 * and merge its flattened permission set into token.permissions. Existing
 * permissions from loadActiveContext (if the admin is also a BusinessAccount
 * member) are preserved via union — additive merge, matches the engine
 * contract in src/lib/permissions/engine.ts mergePermissions().
 *
 * If the admin's AdminTeamMember row has no roleId yet (pre-backfill or
 * legacy member created via the old enum-only path), no permissions are
 * added — every admin route call site has its own legacy fallback while
 * the migration is incomplete.
 */
async function applyAdminPermissions(token: Record<string, unknown>): Promise<void> {
  try {
    const userId = token.id as string;
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (dbUser?.role !== 'admin') {
      clearAdminTokenFields(token);
      return;
    }

    const member = await prisma.adminTeamMember.findUnique({
      where: { userId },
      select: { roleRef: { select: { name: true, permissions: true } } },
    });

    const roleName = member?.roleRef?.name;
    const isAdminOwner = !member || (roleName && isOwnerRoleName(roleName));

    if (isAdminOwner) {
      const existing = new Set<PermissionKey>(
        Array.isArray(token.permissions) ? (token.permissions as PermissionKey[]) : [],
      );
      for (const k of ALL_PERMISSION_KEYS) existing.add(k);
      token.permissions = Array.from(existing);
      token.isPermissionOwner = true;
      token.adminPermissions = [...ALL_PERMISSION_KEYS];
      token.isAdminPermissionOwner = true;
      return;
    }

    let adminPerms = flatten(member?.roleRef?.permissions as PermissionsJson | null | undefined);

    if (adminPerms.size === 0 && member && !member.roleRef) {
      const superAdmin = await prisma.accountRole.findFirst({
        where: { name: 'Super Admin', scope: 'admin', isTemplate: true, businessAccountId: null },
        select: { permissions: true },
      });
      adminPerms = flatten(superAdmin?.permissions as PermissionsJson | null | undefined);
    }
    if (adminPerms.size === 0) {
      token.adminPermissions = [];
      token.isAdminPermissionOwner = false;
      return;
    }

    token.adminPermissions = Array.from(adminPerms);
    token.isAdminPermissionOwner = false;
  } catch (err) {
    console.error('[auth.jwt] applyAdminPermissions failed:', err);
  }
}

/** Load session context; auto-provision a default BusinessAccount for legacy customers. */
async function loadOrProvisionActiveContext(
  userId: string,
  role: string,
  targetAccountId: string | null,
  targetOutletId: string | null,
  targetVendorId: string | null = null,
): Promise<ActiveContext | null> {
  // Admin team members inherit the inviter/platform owner's shopping BA so
  // storefront "Deliver to" shows the owner's outlet, not an empty placeholder.
  if (role === 'admin') {
    try {
      await ensureAdminInheritsShoppingAccount({ memberUserId: userId });
    } catch (err) {
      console.error('[auth] admin shopping inherit failed:', err);
    }
  }

  let active = await loadActiveContext(userId, targetAccountId, targetOutletId, targetVendorId);
  // Admin portal staff should not get an empty personal shopping BA on login.
  // Storefront checkout can still provision later via resolveStorefrontContext.
  if (!active && role === 'customer') {
    try {
      const legacyUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true, businessName: true, pincode: true, gstNumber: true },
      });
      if (legacyUser) {
        await provisionDefaultAccount({
          userId,
          kind: 'customer',
          fullName: legacyUser.fullName,
          businessName: legacyUser.businessName,
          pincode: legacyUser.pincode ?? undefined,
          gstin: legacyUser.gstNumber ?? undefined,
        });
        active = await loadActiveContext(userId, targetAccountId, targetOutletId, targetVendorId);
      }
    } catch (provisionErr) {
      console.error('[auth] legacy customer provision failed:', provisionErr);
    }
  }
  return active;
}

function applyActiveContext(token: Record<string, unknown>, active: ActiveContext | null) {
  if (!active) {
    delete token.activeBusinessAccountId;
    delete token.activeBusinessAccountType;
    delete token.activeOutletId;
    delete token.accessibleOutletIds;
    delete token.permissions;
    delete token.isPermissionOwner;
    delete token.availableAccounts;
    delete token.availableAccountsTruncated;
    delete token.totalAccountCount;
    delete token.activeVendorId;
    delete token.activeBrandId;
    delete token.activeVendorTeamRole;
    delete token.activeBrandTeamRole;
    delete token.availableStores;
    delete token.isStoreScopedOnly;
    return;
  }
  token.hcidDisplay = active.hcidDisplay;
  token.activeBusinessAccountId = active.activeBusinessAccountId;
  token.activeBusinessAccountType = active.activeBusinessAccountType;
  token.activeOutletId = active.activeOutletId;
  token.accessibleOutletIds = active.accessibleOutletIds;
  token.permissions = active.permissions;
  token.isPermissionOwner = active.isPermissionOwner;
  token.availableAccounts = active.availableAccounts;
  token.availableAccountsTruncated = active.availableAccountsTruncated;
  token.totalAccountCount = active.totalAccountCount;
  token.activeVendorId = active.activeVendorId;
  token.activeBrandId = active.activeBrandId;
  token.activeVendorTeamRole = active.activeVendorTeamRole;
  token.activeBrandTeamRole = active.activeBrandTeamRole;
  token.availableStores = active.availableStores;
  token.isStoreScopedOnly = active.isStoreScopedOnly;
}

function clearAdminTokenFields(token: Record<string, unknown>): void {
  delete token.adminTeamRole;
  token.adminPermissions = [];
  token.isAdminPermissionOwner = false;
}

/** Sync JWT role from DB — returns the fresh role or null if lookup failed. */
async function refreshUserRoleFromDb(token: Record<string, unknown>): Promise<string | null> {
  const freshUser = await prisma.user.findUnique({
    where: { id: token.id as string },
    select: { role: true },
  });
  if (!freshUser) return null;
  token.role = freshUser.role;
  return freshUser.role;
}

async function stampUserSyncedAt(token: Record<string, unknown>): Promise<void> {
  if (!token.id) return;
  const dbUser = await prisma.user.findUnique({
    where: { id: token.id as string },
    select: { updatedAt: true },
  });
  if (dbUser) token.userSyncedAt = dbUser.updatedAt.getTime();
}
