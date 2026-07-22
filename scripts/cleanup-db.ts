import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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
  for (const [m, actions] of Object.entries(spec)) { out[m] = {}; for (const a of actions) out[m][a] = true; }
  return out;
}

const ROLE_TEMPLATES: Array<{ name: string; scope: 'account' | 'vendor' | 'brand' | 'admin' | 'delivery'; description: string; permissions: PermissionsJson }> = [
  { name: 'Owner', scope: 'account', description: 'Account owner — full access', permissions: allScopePermissions(ACCOUNT_MODULES) },
  { name: 'Procurement Manager', scope: 'account', description: 'Manages procurement, orders, repeat orders', permissions: perms({ dashboard: ['view'], orders: ['view','create','edit','approve'], repeatOrders: ['view','create','edit'], payments: ['view'], outlets: ['view'] }) },
  { name: 'Store Manager', scope: 'account', description: 'Operates a single outlet', permissions: perms({ dashboard: ['view'], orders: ['view','create','edit'], repeatOrders: ['view','create'], outlets: ['view','edit'], settings: ['view'] }) },
  { name: 'Chef', scope: 'account', description: 'Creates orders from approved lists', permissions: perms({ orders: ['view','create'], repeatOrders: ['view','create'], outlets: ['view'], storefront: ['view','order'] }) },
  { name: 'Accountant', scope: 'account', description: 'Finance + payments visibility', permissions: perms({ dashboard: ['view'], orders: ['view'], payments: ['view','approve'], creditLine: ['view','approve'] }) },
  { name: 'Viewer', scope: 'account', description: 'Read-only across account modules', permissions: viewOnly(ACCOUNT_MODULES) },
  { name: 'Vendor Admin', scope: 'vendor', description: 'Full vendor portal access', permissions: allScopePermissions(VENDOR_MODULES) },
  { name: 'Sales Rep', scope: 'vendor', description: 'Customer-facing sales', permissions: perms({ dashboard: ['view'], orders: ['view','create','edit'], customers: ['view','create','edit'], products: ['view'], inventory: ['view'], promotions: ['view','create','edit'], salespersons: ['view'], commissions: ['view'] }) },
  { name: 'Order Manager', scope: 'vendor', description: 'Order processing + dispatch', permissions: perms({ dashboard: ['view'], orders: ['view','edit','approve'], returns: ['view','edit','approve'], claims: ['view','create','edit'], dispatch: ['view','create','edit'], deliveries: ['view','edit'], grn: ['view'], inventory: ['view'] }) },
  { name: 'Warehouse Manager', scope: 'vendor', description: 'Inventory + GRN', permissions: perms({ inventory: ['view','create','edit','delete'], grn: ['view','create','edit'], dispatch: ['view','create'], products: ['view'] }) },
  { name: 'Finance Executive', scope: 'vendor', description: 'Payments + ledgers', permissions: perms({ dashboard: ['view'], wallet: ['view','create','approve'], ledger: ['view'], creditLine: ['view','approve'], orders: ['view'], analytics: ['view'] }) },
  { name: 'Brand Admin', scope: 'brand', description: 'Full brand portal access', permissions: allScopePermissions(BRAND_MODULES) },
  { name: 'Brand Manager', scope: 'brand', description: 'Catalog + distributors', permissions: perms({ dashboard: ['view'], products: ['view','create','edit'], vendors: ['view','edit'], analytics: ['view'] }) },
  { name: 'Marketing Executive', scope: 'brand', description: 'Analytics + catalog view', permissions: perms({ dashboard: ['view'], products: ['view'], analytics: ['view'] }) },
  { name: 'Super Admin', scope: 'admin', description: 'Full platform access', permissions: allScopePermissions(ADMIN_MODULES) },
  { name: 'Ops Admin', scope: 'admin', description: 'Operations: orders, vendors, customers', permissions: perms({ dashboard: ['view'], orders: ['view','edit','approve'], vendors: ['view','edit','approve'], customers: ['view','edit'], brands: ['view','approve'], products: ['view','approve'], settings: ['view'] }) },
  { name: 'Finance Admin', scope: 'admin', description: 'Finance + credit oversight', permissions: perms({ dashboard: ['view'], payments: ['view','approve'], analytics: ['view'], auditLogs: ['view'] }) },
  { name: 'Support Agent', scope: 'admin', description: 'Customer support', permissions: perms({ orders: ['view'], customers: ['view'], auditLogs: ['view'] }) },
];

function generateHcid(): string {
  const seg = () => Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, '0');
  return `HC-${seg()}-${seg()}`;
}

async function uniqueHcid(): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const candidate = generateHcid();
    const existing = await prisma.user.findUnique({ where: { hcidDisplay: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error('Could not generate unique HCID');
}

async function main() {
  console.log('Starting production data cleanup...');

  // 1. Fetch tables dynamically (excluding _prisma_migrations)
  const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name != '_prisma_migrations'`
  );

  const tableNames = tables.map((t) => `"${t.table_name}"`).join(', ');

  if (!tableNames) {
    console.log('No tables found to clean.');
    return;
  }

  // 2. Perform TRUNCATE with CASCADE
  console.log(`Truncating tables: ${tableNames}`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames} CASCADE;`);
  console.log('All tables truncated successfully.');

  // 3. Re-seed Account Roles
  console.log('Re-seeding account roles...');
  for (const tpl of ROLE_TEMPLATES) {
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
  }
  console.log('Account roles re-seeded.');

  // 4. Re-seed default Admin User
  console.log('Re-creating super admin user...');
  const hcid = await uniqueHcid();
  const adminPassword = await hash('admin123', 12);
  const admin = await prisma.user.create({
    data: {
      id: 'b4d67165-07f4-4473-b8ea-102e3887f520',
      email: 'admin@horeca1.com',
      password: adminPassword,
      fullName: 'HoReCa Admin',
      role: 'admin',
      phone: '+919999900000',
      pincode: '400001',
      emailVerified: new Date(),
      hcidDisplay: hcid,
      isActive: true,
    },
  });
  console.log(`Super admin created: ${admin.email} (hcid: ${admin.hcidDisplay})`);

  // 5. Re-seed Platform Settings
  console.log('Re-creating platform settings...');
  await prisma.platformSetting.create({
    data: {
      id: '3bf5f1a6-1fdc-47c0-b3b0-2734a325d915',
      platformName: 'HoReCa1',
      defaultCommissionPct: 10.00,
      minOrderValue: 500.00,
      freeDeliveryThreshold: 2000.00,
      emailNotifications: true,
      smsNotifications: true,
      pushNotifications: false,
    },
  });
  console.log('Platform settings recreated.');

  // 6. Re-seed Global Credit Configs
  console.log('Re-creating global credit configs...');
  await prisma.globalCreditConfig.create({
    data: {
      id: 'e9d7ce82-6d97-4db0-8936-f85a8321d780',
      repaymentMode: 'REPAY_BEFORE_NEXT_USE',
      billingModel: 'WEEKLY',
      creditLimit: 10000.00,
      creditTenureDays: 3,
      gracePeriodDays: 2,
      blacklistDays: 10,
      interestRatePct: 1.000,
      interestFrequencyDays: 1,
      penaltyAmount: 10.00,
      penaltyFrequencyDays: 1,
      eligiblePurchaseCount: 1,
      unlockCreditAmount: 10000.00,
    },
  });
  console.log('Global credit configs recreated.');

  console.log('Production database cleanup and core re-seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
