import { type Page, expect } from '@playwright/test';
import { credentialsLogin } from './auth';
import { fetchProdEmailOtp } from './prodOtp';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://freshville.store';

/** Force Auth.js jwt callback (trigger=update) so role / BA flags refresh. */
export async function refreshAuthSession(
  page: Page,
  data: Record<string, unknown> = { refresh: Date.now() },
) {
  const result = await page.evaluate(async (payload) => {
    const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
    const csrf = await csrfRes.json();
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csrfToken: csrf.csrfToken, data: payload }),
      credentials: 'include',
    });
    const json = await res.json().catch(() => null);
    return {
      status: res.status,
      role: json?.user?.role as string | undefined,
      isVendor: Boolean(json?.user?.activeBusinessAccountType?.isVendor),
      email: json?.user?.email as string | undefined,
    };
  }, data);
  return result;
}

export async function enterOnlineStoreViaApi(
  page: Page,
  vendorId: string,
  businessAccountId?: string,
) {
  const result = await page.evaluate(
    async ({ vid, bid }) => {
      const res = await fetch('/api/v1/auth/switch-online-store', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: vid,
          ...(bid ? { businessAccountId: bid } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { ok: false, error: json.error?.message as string | undefined };
      }
      const csrf = await (await fetch('/api/auth/csrf', { credentials: 'include' })).json();
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          csrfToken: csrf.csrfToken,
          data: {
            activeVendorId: json.data.vendorId,
            activeOutletId: json.data.outletId ?? undefined,
            ...(json.data.businessAccountId
              ? { activeBusinessAccountId: json.data.businessAccountId }
              : {}),
          },
        }),
      });
      try {
        sessionStorage.setItem('horeca_supplier_entered_store', '1');
      } catch { /* ignore */ }
      return { ok: true as const, vendorId: json.data.vendorId as string };
    },
    { vid: vendorId, bid: businessAccountId ?? null },
  );
  if (!result.ok) throw new Error(`enter store failed: ${result.error}`);
  return result.vendorId;
}


export async function adminImpersonateVendor(page: Page, vendorId: string) {
  const ok = await page.evaluate(async (vid) => {
    const res = await fetch('/api/v1/admin/impersonate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: vid }),
    });
    return res.ok;
  }, vendorId);
  if (!ok) throw new Error(`Admin impersonate failed for vendor ${vendorId}`);
  await page.goto(`${BASE}/vendor/overview`, { waitUntil: 'domcontentloaded' });
}

/** Register a new customer via email OTP (reads code from prod DB over SSH). */
export async function registerCustomerWithEmailOtp(
  page: Page,
  opts: {
    email: string;
    password: string;
    fullName: string;
    legalName: string;
    pincode?: string;
  },
) {
  const { email, password, fullName, legalName, pincode = '400001' } = opts;

  const send = await page.request.post(`${BASE}/api/v1/auth/otp/send`, {
    data: { email, mode: 'register', intent: 'customer' },
  });
  const sendJson = await send.json();
  if (!sendJson.success) {
    throw new Error(`OTP send failed: ${JSON.stringify(sendJson)}`);
  }

  await page.waitForTimeout(1200);
  const code = fetchProdEmailOtp(email);

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  // Drive Auth.js otp credentials callback from the browser context
  const status = await page.evaluate(
    async (payload) => {
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      const csrf = await csrfRes.json();
      const body = new URLSearchParams();
      body.set('csrfToken', csrf.csrfToken);
      body.set('callbackUrl', '/');
      body.set('json', 'true');
      body.set('loginEmail', payload.email);
      body.set('code', payload.code);
      body.set('fullName', payload.fullName);
      body.set('businessName', payload.legalName);
      body.set('password', payload.password);
      body.set('isRegister', 'true');
      body.set('role', 'customer');
      body.set('pincode', payload.pincode);
      body.set('city', 'Mumbai');
      body.set('state', 'Maharashtra');
      body.set('addressLine', 'E2E Test Address');
      body.set('businessType', 'restaurant');
      body.set('firstName', payload.fullName.split(' ')[0] || 'E2E');
      body.set('lastName', payload.fullName.split(' ').slice(1).join(' ') || 'Vendor');

      const res = await fetch('/api/auth/callback/otp?', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        credentials: 'include',
        redirect: 'manual',
      });
      return { status: res.status, url: res.url, loc: res.headers.get('location') };
    },
    { email, code, fullName, legalName, password, pincode },
  );

  // Auth.js may 200 JSON or 302; retry on auth rate-limit
  if (status.status === 429) {
    await page.waitForTimeout(60_000);
    const retry = await page.evaluate(
      async (payload) => {
        const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
        const csrf = await csrfRes.json();
        const body = new URLSearchParams();
        body.set('csrfToken', csrf.csrfToken);
        body.set('callbackUrl', '/');
        body.set('json', 'true');
        body.set('loginEmail', payload.email);
        body.set('code', payload.code);
        body.set('fullName', payload.fullName);
        body.set('businessName', payload.legalName);
        body.set('password', payload.password);
        body.set('isRegister', 'true');
        body.set('role', 'customer');
        body.set('pincode', payload.pincode);
        body.set('city', 'Mumbai');
        body.set('state', 'Maharashtra');
        body.set('addressLine', 'E2E Test Address');
        body.set('businessType', 'restaurant');
        body.set('firstName', payload.fullName.split(' ')[0] || 'E2E');
        body.set('lastName', payload.fullName.split(' ').slice(1).join(' ') || 'Buyer');

        const res = await fetch('/api/auth/callback/otp?', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          credentials: 'include',
          redirect: 'manual',
        });
        return { status: res.status, url: res.url, loc: res.headers.get('location') };
      },
      { email, code, fullName, legalName, password, pincode },
    );
    if (retry.status >= 400) {
      throw new Error(`OTP register callback failed after retry: ${JSON.stringify(retry)}`);
    }
  } else if (status.status >= 400) {
    throw new Error(`OTP register callback failed: ${JSON.stringify(status)}`);
  }

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await expect
    .poll(async () => {
      const s = await page.evaluate(async () => {
        const r = await fetch('/api/auth/session', { credentials: 'include' });
        return r.json();
      });
      return Boolean(s?.user?.email);
    }, { timeout: 30_000 })
    .toBe(true);
}

export async function becomeVendorFromProfile(
  page: Page,
  businessName: string,
) {
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });

  // Prefer UI CTA when present
  const apply = page.getByRole('button', { name: /^Apply$/i }).or(
    page.getByText(/Become a vendor/i),
  );
  if (await apply.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await apply.first().click();
    const nameInput = page.locator('[data-field="businessName"]');
    if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nameInput.fill(businessName);
    } else {
      await page.getByPlaceholder(/business name/i).fill(businessName);
    }
    await page.getByRole('button', { name: /Submit application/i }).click();
    await page.waitForTimeout(2000);
  }

  // Ensure via API (idempotent if UI already succeeded)
  const result = await page.evaluate(async (name) => {
    const session = await (await fetch('/api/auth/session', { credentials: 'include' })).json();
    const accountId = session?.user?.activeBusinessAccountId as string | undefined;
    if (!accountId) return { ok: false, error: 'no activeBusinessAccountId' };

    const res = await fetch(`/api/v1/account/${accountId}/become-vendor`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessName: name, description: 'Playwright lifecycle E2E' }),
    });
    const json = await res.json();
    return {
      ok: res.ok && json.success === true,
      status: res.status,
      error: json.error?.message as string | undefined,
      already: /already/i.test(String(json.error?.message ?? '')),
      vendorId: json.data?.id as string | undefined,
    };
  }, businessName);

  if (!result.ok && !result.already) {
    throw new Error(`become-vendor failed: ${result.error ?? result.status}`);
  }

  // Critical: rotate JWT so activeBusinessAccountType.isVendor becomes true
  // (without this, /vendor/* redirects back to the customer homepage).
  await refreshAuthSession(page);
  await page.goto(`${BASE}/vendor/overview`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await refreshAuthSession(page);
  return result;
}

export async function adminApproveVendorByName(page: Page, businessName: string) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch { /* ignore */ }
  }).catch(() => {});
  await credentialsLogin(
    page,
    process.env.E2E_ADMIN_EMAIL ?? 'admin@horeca1.com',
    process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
  );

  const approved = await page.evaluate(async (name) => {
    const listRes = await fetch('/api/v1/admin/vendors?verified=false&limit=100', {
      credentials: 'include',
    });
    const listJson = await listRes.json();
    const vendors = (listJson.data?.vendors ?? listJson.data ?? []) as Array<{
      id: string;
      businessName?: string;
      displayName?: string | null;
    }>;
    const match = vendors.find(
      (v) =>
        (v.businessName ?? '').includes(name)
        || (v.displayName ?? '').includes(name),
    );
    if (!match?.id) {
      // Also try suppliers / search all
      const allRes = await fetch('/api/v1/admin/vendors?limit=100&search=' + encodeURIComponent(name), {
        credentials: 'include',
      });
      const allJson = await allRes.json();
      const all = (allJson.data?.vendors ?? allJson.data ?? []) as typeof vendors;
      const m2 = all.find(
        (v) =>
          (v.businessName ?? '').includes(name)
          || (v.displayName ?? '').includes(name),
      );
      if (!m2?.id) return { ok: false, error: 'vendor not found pending', count: vendors.length };
      const patch = await fetch(`/api/v1/admin/vendors/${m2.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVerified: true }),
      });
      const pj = await patch.json();
      return { ok: patch.ok && pj.success !== false, vendorId: m2.id, error: pj.error?.message };
    }
    const patch = await fetch(`/api/v1/admin/vendors/${match.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isVerified: true }),
    });
    const pj = await patch.json();
    return { ok: patch.ok && pj.success !== false, vendorId: match.id, error: pj.error?.message };
  }, businessName);

  if (!approved.ok) {
    throw new Error(`Admin vendor approve failed: ${approved.error ?? JSON.stringify(approved)}`);
  }
  return approved.vendorId as string;
}

export async function adminApproveAllPendingStoresForSupplier(
  page: Page,
  nameHint: string,
  extraVendorIds: string[] = [],
) {
  await page.evaluate(
    async ({ hint, extraIds }) => {
      const listRes = await fetch(
        '/api/v1/admin/vendors?limit=100&search=' + encodeURIComponent(hint),
        { credentials: 'include' },
      );
      const listJson = await listRes.json();
      const vendors = (listJson.data?.vendors ?? listJson.data ?? []) as Array<{
        id: string;
        businessName?: string;
        isVerified?: boolean;
      }>;
      const ids = new Set<string>([
        ...extraIds,
        ...vendors
          .filter((v) => (v.businessName ?? '').includes(hint) && v.isVerified === false)
          .map((v) => v.id),
      ]);
      for (const id of ids) {
        await fetch(`/api/v1/admin/vendors/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isVerified: true }),
        });
      }
    },
    { hint: nameHint, extraIds: extraVendorIds },
  );
}

export async function pickLeafCategoryId(page: Page): Promise<string> {
  const id = await page.evaluate(async () => {
    const res = await fetch('/api/v1/categories', { credentials: 'include' });
    const json = await res.json();
    const cats = (json.data ?? json) as Array<{
      id: string;
      children?: Array<{ id: string }>;
      level?: number;
    }>;
    for (const c of cats) {
      if (c.children?.length) return c.children[0].id;
    }
    // flat list — prefer non-root
    const leaf = cats.find((c) => (c.level ?? 0) >= 1) ?? cats[0];
    return leaf?.id ?? '';
  });
  if (!id) throw new Error('No category available for product create');
  return id;
}

export async function createSubmittedProduct(
  page: Page,
  opts: { name: string; slug: string; categoryId: string; price?: number; stock?: number },
) {
  const created = await page.evaluate(async (o) => {
    const res = await fetch('/api/v1/vendor/products', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: o.name,
        slug: o.slug,
        basePrice: o.price ?? 120,
        unit: 'kg',
        packSize: '1 kg',
        listingStatus: 'submitted',
        categoryIds: [o.categoryId],
        description: 'Lifecycle E2E product',
      }),
    });
    const json = await res.json();
    return {
      ok: res.ok && json.success === true,
      id: json.data?.id as string | undefined,
      error: json.error?.message as string | undefined,
      approvalStatus: json.data?.approvalStatus as string | undefined,
    };
  }, opts);

  if (created.ok && created.id && (opts.stock ?? 100) > 0) {
    const stocked = await page.evaluate(
      async ({ productId, qty }) => {
        // Seed inventory rows for the active outlet (PATCH requires an existing row)
        await fetch('/api/v1/vendor/inventory', { credentials: 'include' });
        const res = await fetch('/api/v1/vendor/inventory', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, qtyAvailable: qty }),
        });
        const json = await res.json().catch(() => null);
        return {
          ok: res.ok && json?.success !== false,
          status: res.status,
          error: json?.error?.message as string | undefined,
        };
      },
      { productId: created.id, qty: opts.stock ?? 100 },
    );
    if (!stocked.ok) {
      return {
        ...created,
        error: created.error ?? `stock update failed: ${stocked.error ?? stocked.status}`,
        ok: false,
      };
    }
  }

  return created;
}

export async function adminApproveProduct(page: Page, productId: string, catalogSku: string) {
  return page.evaluate(async ({ productId: id, catalogSku: sku }) => {
    const res = await fetch(`/api/v1/admin/products/${id}/approval`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', catalogSku: sku }),
    });
    const json = await res.json();
    return {
      ok: res.ok && json.success !== false,
      status: res.status,
      error: json.error?.message as string | undefined,
    };
  }, { productId, catalogSku });
}
