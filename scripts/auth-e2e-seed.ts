/**
 * Seed tagged auth E2E users on the DB pointed at by DATABASE_URL.
 * Tags: emails *@horeca.test, names/slugs E2E-AUTH-*, HCIDs HC-E2E-*.
 *
 * Run: npx tsx scripts/auth-e2e-seed.ts
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const TAG = 'E2E-AUTH';
const EMAIL_DOMAIN = 'horeca.test';

export const E2E_CREDS = {
  vendor: { email: `e2e-auth-vendor@${EMAIL_DOMAIN}`, password: 'e2eVendor123!', phone: '+919990001001' },
  brand: { email: `e2e-auth-brand@${EMAIL_DOMAIN}`, password: 'e2eBrand123!', phone: '+919990001002' },
  customer: { email: `e2e-auth-customer@${EMAIL_DOMAIN}`, password: 'e2eCustomer123!', phone: '+919990001003' },
} as const;

type PermissionsJson = Record<string, Record<string, boolean>>;

const ACCOUNT_MODULES = ['dashboard', 'orders', 'repeatOrders', 'payments', 'creditLine', 'users', 'outlets', 'settings', 'storefront'] as const;
const VENDOR_MODULES = ['dashboard', 'products', 'brandMappings', 'priceLists', 'orders', 'returns', 'claims', 'inventory', 'grn', 'dispatch', 'deliveries', 'wallet', 'ledger', 'creditLine', 'customers', 'users', 'outlets', 'analytics', 'promotions', 'salespersons', 'commissions', 'notifications', 'settings'] as const;
const BRAND_MODULES = ['dashboard', 'products', 'vendors', 'analytics', 'users', 'settings'] as const;
const ADMIN_MODULES = ['dashboard', 'orders', 'customers', 'vendors', 'brands', 'products', 'payments', 'promotions', 'analytics', 'users', 'auditLogs', 'settings'] as const;

const MODULE_ACTIONS: Record<string, readonly string[]> = {
  dashboard: ['view'], products: ['view', 'create', 'edit', 'delete', 'approve'],
  brandMappings: ['view', 'create', 'edit', 'delete'], priceLists: ['view', 'create', 'edit', 'delete'],
  orders: ['view', 'create', 'edit', 'delete', 'approve'], returns: ['view', 'create', 'edit', 'delete', 'approve'],
  claims: ['view', 'create', 'edit', 'approve'], repeatOrders: ['view', 'create', 'edit'],
  inventory: ['view', 'create', 'edit', 'delete'], grn: ['view', 'create', 'edit'],
  dispatch: ['view', 'create', 'edit'], deliveries: ['view', 'edit', 'approve'],
  payments: ['view', 'create', 'approve'], wallet: ['view', 'create', 'approve'], ledger: ['view'],
  creditLine: ['view', 'approve'],
  customers: ['view', 'create', 'edit', 'delete'], vendors: ['view', 'create', 'edit', 'delete', 'approve'],
  brands: ['view', 'create', 'edit', 'delete', 'approve'], users: ['view', 'create', 'edit', 'delete'],
  outlets: ['view', 'create', 'edit', 'delete'], analytics: ['view'],
  promotions: ['view', 'create', 'edit', 'delete'], auditLogs: ['view'], settings: ['view', 'edit'],
  notifications: ['view', 'edit'],
  storefront: ['view', 'order', 'pay'], salespersons: ['view', 'create', 'edit', 'delete'],
  commissions: ['view', 'edit', 'approve'],
};

function allScopePermissions(modules: readonly string[]): PermissionsJson {
  const out: PermissionsJson = {};
  for (const m of modules) {
    const actions = MODULE_ACTIONS[m];
    if (!actions) continue;
    out[m] = {};
    for (const a of actions) out[m][a] = true;
  }
  return out;
}
function viewOnly(modules: readonly string[]): PermissionsJson {
  const out: PermissionsJson = {};
  for (const m of modules) out[m] = { view: true };
  return out;
}
function perms(spec: Record<string, readonly string[]>): PermissionsJson {
  const out: PermissionsJson = {};
  for (const [m, actions] of Object.entries(spec)) {
    out[m] = {};
    for (const a of actions) out[m][a] = true;
  }
  return out;
}

const ROLE_TEMPLATES: Array<{
  name: string;
  scope: 'account' | 'vendor' | 'brand' | 'admin' | 'delivery';
  description: string;
  permissions: PermissionsJson;
}> = [
  { name: 'Owner', scope: 'account', description: 'Account owner — full access', permissions: allScopePermissions(ACCOUNT_MODULES) },
  { name: 'Procurement Manager', scope: 'account', description: 'Manages procurement', permissions: perms({ dashboard: ['view'], orders: ['view', 'create', 'edit', 'approve'], repeatOrders: ['view', 'create', 'edit'], payments: ['view'], outlets: ['view'] }) },
  { name: 'Store Manager', scope: 'account', description: 'Operates a single outlet', permissions: perms({ dashboard: ['view'], orders: ['view', 'create', 'edit'], repeatOrders: ['view', 'create'], outlets: ['view', 'edit'], settings: ['view'] }) },
  { name: 'Chef', scope: 'account', description: 'Creates orders', permissions: perms({ orders: ['view', 'create'], repeatOrders: ['view', 'create'], outlets: ['view'], storefront: ['view', 'order'] }) },
  { name: 'Accountant', scope: 'account', description: 'Finance visibility', permissions: perms({ dashboard: ['view'], orders: ['view'], payments: ['view', 'approve'], creditLine: ['view', 'approve'] }) },
  { name: 'Viewer', scope: 'account', description: 'Read-only', permissions: viewOnly(ACCOUNT_MODULES) },
  { name: 'Vendor Admin', scope: 'vendor', description: 'Full vendor portal', permissions: allScopePermissions(VENDOR_MODULES) },
  { name: 'Sales Rep', scope: 'vendor', description: 'Customer-facing sales', permissions: perms({ dashboard: ['view'], orders: ['view', 'create', 'edit'], customers: ['view', 'create', 'edit'], products: ['view'], inventory: ['view'], promotions: ['view', 'create', 'edit'], salespersons: ['view'], commissions: ['view'] }) },
  { name: 'Order Manager', scope: 'vendor', description: 'Order processing', permissions: perms({ dashboard: ['view'], orders: ['view', 'edit', 'approve'], returns: ['view', 'edit', 'approve'], claims: ['view', 'create', 'edit'], dispatch: ['view', 'create', 'edit'], deliveries: ['view', 'edit'], grn: ['view'], inventory: ['view'] }) },
  { name: 'Warehouse Manager', scope: 'vendor', description: 'Inventory + GRN', permissions: perms({ inventory: ['view', 'create', 'edit', 'delete'], grn: ['view', 'create', 'edit'], dispatch: ['view', 'create'], products: ['view'] }) },
  { name: 'Finance Executive', scope: 'vendor', description: 'Payments', permissions: perms({ dashboard: ['view'], wallet: ['view', 'create', 'approve'], ledger: ['view'], creditLine: ['view', 'approve'], orders: ['view'], analytics: ['view'] }) },
  { name: 'Brand Admin', scope: 'brand', description: 'Full brand portal', permissions: allScopePermissions(BRAND_MODULES) },
  { name: 'Brand Manager', scope: 'brand', description: 'Catalog + distributors', permissions: perms({ dashboard: ['view'], products: ['view', 'create', 'edit'], vendors: ['view', 'edit'], analytics: ['view'] }) },
  { name: 'Marketing Executive', scope: 'brand', description: 'Analytics + catalog view', permissions: perms({ dashboard: ['view'], products: ['view'], analytics: ['view'] }) },
  { name: 'Super Admin', scope: 'admin', description: 'Full platform', permissions: allScopePermissions(ADMIN_MODULES) },
  { name: 'Ops Admin', scope: 'admin', description: 'Operations', permissions: perms({ dashboard: ['view'], orders: ['view', 'edit', 'approve'], vendors: ['view', 'edit', 'approve'], customers: ['view', 'edit'], brands: ['view', 'approve'], products: ['view', 'approve'], settings: ['view'] }) },
  { name: 'Finance Admin', scope: 'admin', description: 'Finance', permissions: perms({ dashboard: ['view'], payments: ['view', 'approve'], analytics: ['view'], auditLogs: ['view'] }) },
  { name: 'Support Agent', scope: 'admin', description: 'Customer support', permissions: perms({ orders: ['view'], customers: ['view'], auditLogs: ['view'] }) },
];

function redactDatabaseUrl(url: string | undefined): { host: string; database: string; user: string } {
  if (!url) return { host: '(unset)', database: '(unset)', user: '(unset)' };
  try {
    const u = new URL(url);
    return {
      host: u.host,
      database: u.pathname.replace(/^\//, '').split('?')[0] || '(none)',
      user: u.username || '(none)',
    };
  } catch {
    return { host: '(parse-error)', database: '(parse-error)', user: '(parse-error)' };
  }
}

async function ensureRoleTemplates() {
  let created = 0;
  for (const tpl of ROLE_TEMPLATES) {
    const existing = await prisma.accountRole.findFirst({
      where: { businessAccountId: null, isTemplate: true, name: tpl.name, scope: tpl.scope },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.accountRole.create({
      data: {
        businessAccountId: null,
        name: tpl.name,
        description: tpl.description,
        permissions: tpl.permissions as object,
        isTemplate: true,
        scope: tpl.scope,
      },
    });
    created += 1;
  }
  console.log(`Role templates: ensured (${created} created)`);
}

async function templateId(scope: string, name: string): Promise<string> {
  const t = await prisma.accountRole.findFirst({
    where: { businessAccountId: null, isTemplate: true, name, scope },
    select: { id: true },
  });
  if (!t) throw new Error(`Missing role template ${scope}/${name}`);
  return t.id;
}

async function upsertUser(opts: {
  email: string;
  password: string;
  phone: string;
  fullName: string;
  role: 'customer' | 'vendor' | 'brand';
  hcidDisplay: string;
  businessName: string;
}) {
  const passwordHash = await hash(opts.password, 12);
  const existing = await prisma.user.findUnique({ where: { email: opts.email }, select: { id: true } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: passwordHash,
        phone: opts.phone,
        fullName: opts.fullName,
        role: opts.role,
        businessName: opts.businessName,
        isActive: true,
        emailVerified: new Date(),
        profileCompletedAt: new Date(),
      },
    });
    return existing.id;
  }
  // Phone may collide with a leftover row — clear conflicting phone first.
  const phoneClash = await prisma.user.findFirst({ where: { phone: opts.phone }, select: { id: true, email: true } });
  if (phoneClash && phoneClash.email !== opts.email) {
    await prisma.user.update({ where: { id: phoneClash.id }, data: { phone: null } });
  }
  const hcidClash = await prisma.user.findUnique({ where: { hcidDisplay: opts.hcidDisplay }, select: { id: true } });
  const hcid = hcidClash ? `${opts.hcidDisplay.slice(0, 14)}${String(Date.now()).slice(-4)}`.slice(0, 20) : opts.hcidDisplay;
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      password: passwordHash,
      phone: opts.phone,
      fullName: opts.fullName,
      role: opts.role,
      businessName: opts.businessName,
      hcidDisplay: hcid,
      isActive: true,
      emailVerified: new Date(),
      profileCompletedAt: new Date(),
      pincode: '400001',
    },
  });
  return user.id;
}

async function ensureMembership(userId: string, businessAccountId: string, isPrimary: boolean) {
  await prisma.businessAccountMember.upsert({
    where: { userId_businessAccountId: { userId, businessAccountId } },
    create: { userId, businessAccountId, isPrimary, acceptedAt: new Date() },
    update: { isPrimary, acceptedAt: new Date() },
  });
}

async function ensureUserRole(userId: string, businessAccountId: string, roleId: string) {
  const has = await prisma.userRole.findFirst({
    where: { userId, businessAccountId, outletId: null, roleId },
    select: { id: true },
  });
  if (!has) {
    await prisma.userRole.create({
      data: { userId, businessAccountId, outletId: null, roleId },
    });
  }
}

async function createBaWithOutlet(opts: {
  legalName: string;
  isCustomer: boolean;
  isVendor: boolean;
  isBrand: boolean;
  businessType: string;
  phone: string;
  outletName: string;
}): Promise<{ baId: string; outletId: string }> {
  const existing = await prisma.businessAccount.findFirst({
    where: { legalName: opts.legalName },
    select: { id: true, primaryOutletId: true },
  });
  if (existing?.primaryOutletId) {
    return { baId: existing.id, outletId: existing.primaryOutletId };
  }
  if (existing) {
    const outlet = await prisma.outlet.create({
      data: {
        businessAccountId: existing.id,
        name: opts.outletName,
        addressLine: `${TAG} Address, Mumbai`,
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        requiresAddressUpdate: false,
      },
    });
    await prisma.businessAccount.update({
      where: { id: existing.id },
      data: { primaryOutletId: outlet.id },
    });
    return { baId: existing.id, outletId: outlet.id };
  }

  const ba = await prisma.businessAccount.create({
    data: {
      legalName: opts.legalName,
      displayName: opts.legalName,
      companyName: opts.legalName,
      isCustomer: opts.isCustomer,
      isVendor: opts.isVendor,
      isBrand: opts.isBrand,
      businessType: opts.businessType,
      status: 'active',
      mobilePhone: opts.phone,
      workPhone: opts.phone,
      billingCity: 'Mumbai',
      billingState: 'Maharashtra',
      billingPincode: '400001',
      billingAddressLine: `${TAG} Billing, Mumbai`,
    },
  });
  const outlet = await prisma.outlet.create({
    data: {
      businessAccountId: ba.id,
      name: opts.outletName,
      addressLine: `${TAG} Address, Mumbai`,
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      requiresAddressUpdate: false,
    },
  });
  await prisma.businessAccount.update({
    where: { id: ba.id },
    data: { primaryOutletId: outlet.id },
  });
  return { baId: ba.id, outletId: outlet.id };
}

async function seedVendor(userId: string) {
  const vendorAdminRole = await templateId('vendor', 'Vendor Admin');
  const { baId, outletId } = await createBaWithOutlet({
    legalName: `${TAG} Vendor Co`,
    isCustomer: true,
    isVendor: true,
    isBrand: false,
    businessType: 'vendor',
    phone: E2E_CREDS.vendor.phone,
    outletName: `${TAG} Vendor Outlet`,
  });
  await ensureMembership(userId, baId, true);
  await ensureUserRole(userId, baId, vendorAdminRole);

  const slug = 'e2e-auth-vendor';
  const existingVendor = await prisma.vendor.findFirst({
    where: { OR: [{ slug }, { businessAccountId: baId }] },
    select: { id: true },
  });
  if (!existingVendor) {
    await prisma.vendor.create({
      data: {
        userId,
        businessAccountId: baId,
        businessName: `${TAG} Vendor Co`,
        slug,
        vendorCode: 'E2EAUTH',
        description: 'Auth E2E tagged vendor — safe to delete',
        isActive: true,
        isVerified: true,
        minOrderValue: 0,
        addressLine: `${TAG} Vendor Address`,
        city: 'Mumbai',
        state: 'Maharashtra',
        addressPincode: '400001',
      },
    });
  } else {
    await prisma.vendor.update({
      where: { id: existingVendor.id },
      data: {
        userId,
        businessAccountId: baId,
        businessName: `${TAG} Vendor Co`,
        isActive: true,
        isVerified: true,
      },
    });
  }
  return { baId, outletId };
}

async function seedBrand(userId: string) {
  const brandAdminRole = await templateId('brand', 'Brand Admin');
  const { baId, outletId } = await createBaWithOutlet({
    legalName: `${TAG} Brand Co`,
    isCustomer: false,
    isVendor: false,
    isBrand: true,
    businessType: 'brand',
    phone: E2E_CREDS.brand.phone,
    outletName: `${TAG} Brand HQ`,
  });
  await ensureMembership(userId, baId, true);
  await ensureUserRole(userId, baId, brandAdminRole);

  const slug = 'e2e-auth-brand';
  const existing = await prisma.brand.findFirst({
    where: { OR: [{ slug }, { businessAccountId: baId }] },
    select: { id: true },
  });
  if (!existing) {
    await prisma.brand.create({
      data: {
        userId,
        businessAccountId: baId,
        name: `${TAG} Brand Co`,
        slug,
        description: 'Auth E2E tagged brand — safe to delete',
        approvalStatus: 'approved',
        isActive: true,
      },
    });
  } else {
    await prisma.brand.update({
      where: { id: existing.id },
      data: {
        userId,
        businessAccountId: baId,
        name: `${TAG} Brand Co`,
        approvalStatus: 'approved',
        isActive: true,
      },
    });
  }
  return { baId, outletId };
}

async function seedCustomer(userId: string) {
  const ownerRole = await templateId('account', 'Owner');
  const primary = await createBaWithOutlet({
    legalName: `${TAG} Customer Primary`,
    isCustomer: true,
    isVendor: false,
    isBrand: false,
    businessType: 'restaurant',
    phone: E2E_CREDS.customer.phone,
    outletName: `${TAG} Outlet A`,
  });
  await ensureMembership(userId, primary.baId, true);
  await ensureUserRole(userId, primary.baId, ownerRole);

  // Second outlet on primary BA (picker / outlet switch)
  const secondOutlet = await prisma.outlet.findFirst({
    where: { businessAccountId: primary.baId, name: `${TAG} Outlet B` },
    select: { id: true },
  });
  if (!secondOutlet) {
    await prisma.outlet.create({
      data: {
        businessAccountId: primary.baId,
        name: `${TAG} Outlet B`,
        addressLine: `${TAG} Address B, Pune`,
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        requiresAddressUpdate: false,
      },
    });
  }

  // Second BA for multi-account switch
  const secondary = await createBaWithOutlet({
    legalName: `${TAG} Customer Secondary`,
    isCustomer: true,
    isVendor: false,
    isBrand: false,
    businessType: 'hotel',
    phone: E2E_CREDS.customer.phone,
    outletName: `${TAG} Outlet C`,
  });
  await ensureMembership(userId, secondary.baId, false);
  await ensureUserRole(userId, secondary.baId, ownerRole);

  return { primaryBaId: primary.baId, secondaryBaId: secondary.baId };
}

async function main() {
  const db = redactDatabaseUrl(process.env.DATABASE_URL);
  console.log('\n=== Auth E2E Seed — Preflight ===');
  console.log(`DATABASE_URL host: ${db.host}`);
  console.log(`database: ${db.database}`);
  console.log(`user: ${db.user}`);
  console.log('Proceeding on this connection (plan option 2).\n');

  await ensureRoleTemplates();

  const vendorUserId = await upsertUser({
    email: E2E_CREDS.vendor.email,
    password: E2E_CREDS.vendor.password,
    phone: E2E_CREDS.vendor.phone,
    fullName: `${TAG} Vendor Owner`,
    role: 'vendor',
    hcidDisplay: 'HC-E2E0-VEND',
    businessName: `${TAG} Vendor Co`,
  });
  const vendor = await seedVendor(vendorUserId);
  console.log(`Vendor: ${E2E_CREDS.vendor.email} ba=${vendor.baId}`);

  const brandUserId = await upsertUser({
    email: E2E_CREDS.brand.email,
    password: E2E_CREDS.brand.password,
    phone: E2E_CREDS.brand.phone,
    fullName: `${TAG} Brand Owner`,
    role: 'brand',
    hcidDisplay: 'HC-E2E0-BRND',
    businessName: `${TAG} Brand Co`,
  });
  const brand = await seedBrand(brandUserId);
  console.log(`Brand: ${E2E_CREDS.brand.email} ba=${brand.baId}`);

  const customerUserId = await upsertUser({
    email: E2E_CREDS.customer.email,
    password: E2E_CREDS.customer.password,
    phone: E2E_CREDS.customer.phone,
    fullName: `${TAG} Customer`,
    role: 'customer',
    hcidDisplay: 'HC-E2E0-CUST',
    businessName: `${TAG} Customer Primary`,
  });
  const customer = await seedCustomer(customerUserId);
  console.log(`Customer: ${E2E_CREDS.customer.email} primary=${customer.primaryBaId} secondary=${customer.secondaryBaId}`);

  // Multi-account: also attach customer as secondary member on vendor BA (picker coverage)
  await ensureMembership(customerUserId, vendor.baId, false);
  const vendorAdminRole = await templateId('vendor', 'Sales Rep');
  await ensureUserRole(customerUserId, vendor.baId, vendorAdminRole);

  const admin = await prisma.user.findUnique({
    where: { email: 'admin@horeca1.com' },
    select: { id: true, email: true },
  });
  if (!admin) {
    console.warn('WARNING: admin@horeca1.com not found — admin tests will fail until admin exists.');
  } else {
    console.log(`Admin (unchanged): ${admin.email}`);
  }

  console.log('\nSeed complete. Creds:');
  for (const [role, c] of Object.entries(E2E_CREDS)) {
    console.log(`  ${role}: ${c.email} / ${c.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
