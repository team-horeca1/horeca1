import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';

// Prisma 7 requires a driver adapter for PostgreSQL
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ═══════════════════════════════════════════════════════════════════════════
// V2.2 HCID + RBAC helpers — templates aligned with portalFeatures.ts scopes.
// ═══════════════════════════════════════════════════════════════════════════
type PermissionsJson = Record<string, Record<string, boolean>>;

const ACCOUNT_MODULES = ['dashboard', 'orders', 'repeatOrders', 'payments', 'creditLine', 'users', 'outlets', 'settings', 'storefront'] as const;
const VENDOR_MODULES = ['dashboard', 'products', 'orders', 'repeatOrders', 'inventory', 'grn', 'dispatch', 'deliveries', 'payments', 'creditLine', 'customers', 'users', 'outlets', 'analytics', 'promotions', 'salespersons', 'commissions', 'settings'] as const;
const BRAND_MODULES = ['dashboard', 'products', 'vendors', 'analytics', 'users', 'settings'] as const;
const ADMIN_MODULES = ['dashboard', 'orders', 'customers', 'vendors', 'brands', 'products', 'payments', 'promotions', 'analytics', 'users', 'auditLogs', 'settings'] as const;

const MODULE_ACTIONS: Record<string, readonly string[]> = {
  dashboard: ['view'], products: ['view', 'create', 'edit', 'delete', 'approve'],
  orders: ['view', 'create', 'edit', 'delete', 'approve'], repeatOrders: ['view', 'create', 'edit'],
  inventory: ['view', 'create', 'edit', 'delete'], grn: ['view', 'create', 'edit'],
  dispatch: ['view', 'create', 'edit'], deliveries: ['view', 'edit', 'approve'],
  payments: ['view', 'create', 'approve'], creditLine: ['view', 'approve'],
  customers: ['view', 'create', 'edit', 'delete'], vendors: ['view', 'create', 'edit', 'delete', 'approve'],
  brands: ['view', 'create', 'edit', 'delete', 'approve'], users: ['view', 'create', 'edit', 'delete'],
  outlets: ['view', 'create', 'edit', 'delete'], analytics: ['view'],
  promotions: ['view', 'create', 'edit', 'delete'], auditLogs: ['view'], settings: ['view', 'edit'],
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
const SEED_TEMPLATES: Array<{ name: string; scope: 'account' | 'vendor' | 'brand' | 'admin' | 'delivery'; description: string; permissions: PermissionsJson }> = [
  { name: 'Owner', scope: 'account', description: 'Account owner — full access', permissions: allScopePermissions(ACCOUNT_MODULES) },
  { name: 'Procurement Manager', scope: 'account', description: 'Manages procurement, orders, repeat orders', permissions: perms({ dashboard: ['view'], orders: ['view','create','edit','approve'], repeatOrders: ['view','create','edit'], payments: ['view'], outlets: ['view'] }) },
  { name: 'Store Manager', scope: 'account', description: 'Operates a single outlet', permissions: perms({ dashboard: ['view'], orders: ['view','create','edit'], repeatOrders: ['view','create'], outlets: ['view','edit'], settings: ['view'] }) },
  { name: 'Chef', scope: 'account', description: 'Creates orders from approved lists', permissions: perms({ orders: ['view','create'], repeatOrders: ['view','create'], outlets: ['view'], storefront: ['view','order'] }) },
  { name: 'Accountant', scope: 'account', description: 'Finance + payments visibility', permissions: perms({ dashboard: ['view'], orders: ['view'], payments: ['view','approve'], creditLine: ['view','approve'] }) },
  { name: 'Viewer', scope: 'account', description: 'Read-only across account modules', permissions: viewOnly(ACCOUNT_MODULES) },
  { name: 'Vendor Admin', scope: 'vendor', description: 'Full vendor portal access', permissions: allScopePermissions(VENDOR_MODULES) },
  { name: 'Sales Rep', scope: 'vendor', description: 'Customer-facing sales', permissions: perms({ dashboard: ['view'], orders: ['view','create','edit'], customers: ['view','create','edit'], products: ['view'], inventory: ['view'], promotions: ['view','create','edit'], salespersons: ['view'], commissions: ['view'] }) },
  { name: 'Order Manager', scope: 'vendor', description: 'Order processing + dispatch', permissions: perms({ dashboard: ['view'], orders: ['view','edit','approve'], dispatch: ['view','create','edit'], deliveries: ['view','edit'], grn: ['view'], inventory: ['view'] }) },
  { name: 'Warehouse Manager', scope: 'vendor', description: 'Inventory + GRN', permissions: perms({ inventory: ['view','create','edit','delete'], grn: ['view','create','edit'], dispatch: ['view','create'], products: ['view'] }) },
  { name: 'Finance Executive', scope: 'vendor', description: 'Payments + ledgers', permissions: perms({ dashboard: ['view'], payments: ['view','create','approve'], creditLine: ['view','approve'], orders: ['view'], analytics: ['view'] }) },
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
async function seedRoleTemplates() {
  let created = 0;
  for (const tpl of SEED_TEMPLATES) {
    const existing = await prisma.accountRole.findFirst({ where: { businessAccountId: null, name: tpl.name, isTemplate: true }, select: { id: true } });
    if (existing) continue;
    await prisma.accountRole.create({ data: { businessAccountId: null, name: tpl.name, description: tpl.description, permissions: tpl.permissions as object, isTemplate: true, scope: tpl.scope } });
    created++;
  }
  console.log(`  Role templates: ${created} created, ${SEED_TEMPLATES.length - created} present`);
}

// Vendor logos — use assets already deployed on prod (the /images/vendors/*.webp
// covers) so the reseed renders correctly without waiting on a new image deploy.
const VENDOR_LOGOS = [
  '/images/vendors/chad-peltola-BTvQ2ET_iKc-unsplash.webp',
  '/images/vendors/eryka-ragna-K5dvZHBJp3k-unsplash.webp',
  '/images/vendors/gioia-m-EGjfIKl_ZvE-unsplash.webp',
  '/images/vendors/kylle-pangan-LjpD-uW4dH0-unsplash.webp',
  '/images/vendors/m-veven-4oHtqbwy7Lo-unsplash.webp',
  '/images/vendors/sleeba-thomas-h-T2VPkw9Kw-unsplash.webp',
  '/images/vendors/young-kane-kSDOJRNol9E-unsplash.webp',
];

// ── Service areas: Mumbai + Navi Mumbai (includes Sanpada 400705, Vashi, Nerul…) ──
const SERVICE_PINCODES = [
  '400001','400002','400003','400004','400005','400006','400007','400008','400009','400010',
  '400701','400703','400705','400706','400708','400709','400710','400614','410206','421204',
];

// ── 2-level catalog: parent Category → Sub-categories (every product maps to a sub) ──
const CATALOG: Array<{ name: string; slug: string; img: string; subs: Array<{ name: string; slug: string; img: string }> }> = [
  { name: 'Fresh Produce', slug: 'fresh-produce', img: '/images/category/vegitable.png', subs: [
    { name: 'Vegetables', slug: 'vegetables', img: '/images/category/vegitable.png' },
    { name: 'Fruits', slug: 'fruits', img: '/images/category/fruits.png' },
    { name: 'Herbs & Seasonings', slug: 'herbs-seasonings', img: '/images/fruits-vegetables/corriander.png' },
  ]},
  { name: 'Dairy, Cheese & Eggs', slug: 'dairy-cheese-eggs', img: '/images/category/milk.png', subs: [
    { name: 'Milk & Butter', slug: 'milk-butter', img: '/images/dairy/amul-butter.png' },
    { name: 'Cheese & Paneer', slug: 'cheese-paneer', img: '/images/dairy/amul-cheese.png' },
    { name: 'Eggs', slug: 'eggs', img: '/images/category/milk.png' },
  ]},
  { name: 'Pantry & Staples', slug: 'pantry-staples', img: '/images/category/snacks.png', subs: [
    { name: 'Spices & Masala', slug: 'spices-masala', img: '/images/masala-salt/everest-masala.png' },
    { name: 'Grains & Rice', slug: 'grains-rice', img: '/images/recom-product/product-img9.png' },
    { name: 'Pulses & Dal', slug: 'pulses-dal', img: '/images/recom-product/product-img8.png' },
    { name: 'Oils & Ghee', slug: 'oils-ghee', img: '/images/edible-oil/saffola-gold-oil.png' },
  ]},
  { name: 'Meat, Poultry & Seafood', slug: 'meat-poultry-seafood', img: '/images/recom-product/product-img12.png', subs: [
    { name: 'Poultry', slug: 'poultry', img: '/images/recom-product/product-img12.png' },
    { name: 'Mutton & Lamb', slug: 'mutton-lamb', img: '/images/recom-product/product-img12.png' },
    { name: 'Seafood', slug: 'seafood', img: '/images/recom-product/product-img12.png' },
  ]},
  { name: 'Beverages & Drinks', slug: 'beverages-drinks', img: '/images/category/drink-juice.png', subs: [
    { name: 'Soft Drinks & Water', slug: 'soft-drinks-water', img: '/images/category/drink-juice.png' },
    { name: 'Tea & Coffee', slug: 'tea-coffee', img: '/images/recom-product/product-img14.png' },
    { name: 'Juices & Energy', slug: 'juices-energy', img: '/images/category/drink-juice.png' },
  ]},
  { name: 'Bakery & Frozen', slug: 'bakery-frozen', img: '/images/category/desset.png', subs: [
    { name: 'Bakery & Bread', slug: 'bakery-bread', img: '/images/category/desset.png' },
    { name: 'Frozen Foods', slug: 'frozen-foods', img: '/images/category/desset.png' },
  ]},
  { name: 'Cleaning & Hygiene', slug: 'cleaning-hygiene', img: '/images/product/product-img5.png', subs: [
    { name: 'Cleaning Supplies', slug: 'cleaning-supplies', img: '/images/product/product-img5.png' },
    { name: 'Disposables & Packaging', slug: 'disposables-packaging', img: '/images/product/product-img6.png' },
  ]},
  { name: 'Snacks & Confectionery', slug: 'snacks-confectionery', img: '/images/category/candy.png', subs: [
    { name: 'Snacks & Namkeen', slug: 'snacks-namkeen', img: '/images/category/snacks.png' },
    { name: 'Sweets & Confectionery', slug: 'sweets-confectionery', img: '/images/category/candy.png' },
  ]},
];

// Per-sub-category LOCAL images for products (all URL-safe). Cycled for variety.
const SUB_IMAGES: Record<string, string[]> = {
  'vegetables': ['/images/fruits-vegetables/onion.png', '/images/product/brokali.png', '/images/category/vegitable.png'],
  'fruits': ['/images/category/fruits.png', '/images/organic/product-img20.png', '/images/organic/product-img21.png'],
  'herbs-seasonings': ['/images/fruits-vegetables/corriander.png', '/images/organic/product-img22.png'],
  'milk-butter': ['/images/dairy/amul-butter.png', '/images/category/milk.png'],
  'cheese-paneer': ['/images/dairy/amul-cheese.png'],
  'eggs': ['/images/category/milk.png', '/images/recom-product/product-img15.png'],
  'spices-masala': ['/images/masala-salt/everest-masala.png', '/images/masala-salt/tata-salt.png', '/images/recom-product/product-img7.png'],
  'grains-rice': ['/images/recom-product/product-img9.png', '/images/recom-product/product-img10.png'],
  'pulses-dal': ['/images/recom-product/product-img8.png', '/images/recom-product/product-img11.png'],
  'oils-ghee': ['/images/edible-oil/saffola-gold-oil.png', '/images/edible-oil/gemini.png', '/images/recom-product/amul-ghee.png'],
  'poultry': ['/images/recom-product/product-img12.png', '/images/recom-product/product-img12.png'],
  'mutton-lamb': ['/images/recom-product/product-img12.png', '/images/recom-product/product-img16.png'],
  'seafood': ['/images/recom-product/product-img12.png', '/images/recom-product/product-img17.png'],
  'soft-drinks-water': ['/images/category/drink-juice.png', '/images/recom-product/product-img18.png'],
  'tea-coffee': ['/images/recom-product/product-img14.png', '/images/recom-product/kissan-ketchup.png'],
  'juices-energy': ['/images/category/drink-juice.png', '/images/recom-product/product-img12.png'],
  'bakery-bread': ['/images/category/desset.png', '/images/daily-best-sell/best-sell1.png'],
  'frozen-foods': ['/images/category/desset.png', '/images/daily-best-sell/best-sell2.png'],
  'cleaning-supplies': ['/images/product/product-img5.png', '/images/product/product-img3.png'],
  'disposables-packaging': ['/images/product/product-img6.png', '/images/product/product-img1.png'],
  'snacks-namkeen': ['/images/category/snacks.png', '/images/daily-best-sell/best-sell3.png', '/images/daily-best-sell/special-snacks-img.png'],
  'sweets-confectionery': ['/images/category/candy.png', '/images/daily-best-sell/best-sell4.png'],
};
const imgCursor: Record<string, number> = {};
function pickImage(slug: string): string {
  const list = SUB_IMAGES[slug] ?? ['/images/category/vegitable.png'];
  const i = imgCursor[slug] ?? 0;
  imgCursor[slug] = i + 1;
  return list[i % list.length];
}

// ── 12 vendors. items: [name, subSlug, price, packSize, unit, stock] ──
type Item = [string, string, number, string, string, number];
const VENDORS: Array<{ email: string; owner: string; phone: string; name: string; slug: string; logo: string; city: string; rating: number; mov: number; credit: boolean; items: Item[] }> = [
  { email: 'fresh@dailyfreshfoods.com', owner: 'Rajesh Kumar', phone: '+919876500001', name: 'Daily Fresh Foods', slug: 'daily-fresh-foods', logo: '/images/seed/vendor-1.png', city: 'Mumbai', rating: 4.5, mov: 500, credit: true, items: [
    ['Fresh Onions', 'vegetables', 35, '1 kg', 'kg', 500], ['Tomatoes (Hybrid)', 'vegetables', 40, '1 kg', 'kg', 400], ['Potatoes', 'vegetables', 30, '1 kg', 'kg', 600], ['Green Capsicum', 'vegetables', 80, '1 kg', 'kg', 200], ['Alphonso Mangoes', 'fruits', 600, '1 dozen', 'dozen', 100], ['Bananas (Robusta)', 'fruits', 45, '1 dozen', 'dozen', 250], ['Fresh Coriander', 'herbs-seasonings', 15, '100 g', 'bundle', 300] ] },
  { email: 'owner@spicetrail.in', owner: 'Priya Sharma', phone: '+919876500002', name: 'Spice Trail India', slug: 'spice-trail-india', logo: '/images/seed/vendor-2.png', city: 'Mumbai', rating: 4.8, mov: 300, credit: true, items: [
    ['Turmeric Powder', 'spices-masala', 180, '500 g', 'pack', 300], ['Red Chilli Powder', 'spices-masala', 220, '500 g', 'pack', 250], ['Garam Masala', 'spices-masala', 350, '500 g', 'pack', 200], ['Cumin Seeds (Jeera)', 'spices-masala', 280, '500 g', 'pack', 180], ['Basmati Rice (5kg)', 'grains-rice', 520, '5 kg', 'bag', 200], ['Toor Dal (1kg)', 'pulses-dal', 160, '1 kg', 'pack', 300] ] },
  { email: 'info@meathouseindia.com', owner: 'Faizan Sheikh', phone: '+919876500003', name: 'MeatHouse India', slug: 'meathouse-india', logo: '/images/seed/vendor-3.png', city: 'Mumbai', rating: 4.3, mov: 1000, credit: false, items: [
    ['Chicken Breast (Boneless)', 'poultry', 280, '1 kg', 'kg', 200], ['Chicken Drumsticks', 'poultry', 220, '1 kg', 'kg', 250], ['Whole Chicken', 'poultry', 380, '~1.2 kg', 'piece', 150], ['Mutton (Bone-In)', 'mutton-lamb', 750, '1 kg', 'kg', 100], ['Lamb Keema', 'mutton-lamb', 680, '1 kg', 'kg', 80] ] },
  { email: 'sales@beverageco.in', owner: 'Amit Patel', phone: '+919876500004', name: 'BeverageCo', slug: 'beverageco', logo: '/images/seed/vendor-4.png', city: 'Navi Mumbai', rating: 4.1, mov: 800, credit: true, items: [
    ['Coca-Cola (300ml x 24)', 'soft-drinks-water', 480, '24 bottles', 'case', 200], ['Bisleri Water (1L x 12)', 'soft-drinks-water', 180, '12 bottles', 'case', 400], ['Tata Tea Gold (1kg)', 'tea-coffee', 520, '1 kg', 'pack', 150], ['Nescafe Classic (200g)', 'tea-coffee', 350, '200 g', 'jar', 200], ['Real Juice Mango (1L x 12)', 'juices-energy', 720, '12 packs', 'case', 100] ] },
  { email: 'orders@packnserve.in', owner: 'Sneha Reddy', phone: '+919876500005', name: 'Pack & Serve Supplies', slug: 'pack-and-serve-supplies', logo: '/images/seed/vendor-5.png', city: 'Navi Mumbai', rating: 4.0, mov: 200, credit: false, items: [
    ['Disposable Plates (100 pcs)', 'disposables-packaging', 180, '100 pcs', 'pack', 500], ['Aluminium Foil Roll (72m)', 'disposables-packaging', 350, '72 m', 'roll', 300], ['Takeaway Containers (500ml x 50)', 'disposables-packaging', 320, '50 pcs', 'pack', 350], ['Dishwash Liquid (5L)', 'cleaning-supplies', 420, '5 L', 'can', 200], ['Kitchen Gloves (100 pcs)', 'cleaning-supplies', 250, '100 pcs', 'box', 200] ] },
  { email: 'hello@premiumdairy.in', owner: 'Meera Iyer', phone: '+919876500006', name: 'Premium Dairy Co', slug: 'premium-dairy-co', logo: '/images/seed/vendor-6.png', city: 'Mumbai', rating: 4.6, mov: 400, credit: true, items: [
    ['Amul Butter (500g)', 'milk-butter', 270, '500 g', 'pack', 150], ['Full Cream Milk (1L x 12)', 'milk-butter', 780, '12 packs', 'case', 200], ['Paneer (1kg block)', 'cheese-paneer', 320, '1 kg', 'block', 120], ['Mozzarella Cheese (1kg)', 'cheese-paneer', 560, '1 kg', 'pack', 90], ['Farm Eggs (30 pcs)', 'eggs', 210, '30 pcs', 'tray', 200] ] },
  { email: 'sales@coastalseafoods.in', owner: 'Anand Pillai', phone: '+919876500007', name: 'Coastal Seafoods', slug: 'coastal-seafoods', logo: '/images/seed/vendor-7.png', city: 'Navi Mumbai', rating: 4.4, mov: 1200, credit: false, items: [
    ['Prawns (Large)', 'seafood', 650, '500 g', 'pack', 60], ['Fish Fillets (Basa)', 'seafood', 350, '1 kg', 'kg', 120], ['Surmai Steaks', 'seafood', 800, '1 kg', 'kg', 50], ['Pomfret (Medium)', 'seafood', 900, '1 kg', 'kg', 40], ['Chicken Sausages (1kg)', 'poultry', 320, '1 kg', 'pack', 100] ] },
  { email: 'trade@goldengrains.in', owner: 'Harish Gupta', phone: '+919876500008', name: 'Golden Grains Wholesale', slug: 'golden-grains-wholesale', logo: '/images/seed/vendor-8.png', city: 'Thane', rating: 4.2, mov: 600, credit: true, items: [
    ['Sona Masoori Rice (25kg)', 'grains-rice', 1450, '25 kg', 'bag', 120], ['Whole Wheat Atta (10kg)', 'grains-rice', 420, '10 kg', 'bag', 180], ['Moong Dal (1kg)', 'pulses-dal', 140, '1 kg', 'pack', 280], ['Chana Dal (1kg)', 'pulses-dal', 130, '1 kg', 'pack', 260], ['Mustard Oil (5L)', 'oils-ghee', 750, '5 L', 'can', 100], ['Pure Desi Ghee (1L)', 'oils-ghee', 580, '1 L', 'jar', 120] ] },
  { email: 'orders@freshbake.in', owner: 'Nikita Joshi', phone: '+919876500009', name: 'FreshBake Distributors', slug: 'freshbake-distributors', logo: '/images/seed/vendor-9.png', city: 'Mumbai', rating: 4.3, mov: 500, credit: true, items: [
    ['Burger Buns (6 pcs x 10)', 'bakery-bread', 360, '60 pcs', 'box', 150], ['Sandwich Bread (Large)', 'bakery-bread', 45, '700 g', 'loaf', 300], ['Pizza Base (7 inch x 10)', 'bakery-bread', 280, '10 pcs', 'pack', 120], ['Frozen French Fries (2.5kg)', 'frozen-foods', 420, '2.5 kg', 'pack', 140], ['Frozen Green Peas (1kg)', 'frozen-foods', 160, '1 kg', 'pack', 200] ] },
  { email: 'sales@snackmart.in', owner: 'Rohan Desai', phone: '+919876500010', name: 'SnackMart Traders', slug: 'snackmart-traders', logo: '/images/seed/vendor-10.png', city: 'Navi Mumbai', rating: 4.0, mov: 300, credit: false, items: [
    ['Potato Chips (Salted, 30 pkts)', 'snacks-namkeen', 450, '30 pkts', 'box', 200], ['Mixed Namkeen (1kg)', 'snacks-namkeen', 240, '1 kg', 'pack', 250], ['Salted Peanuts (1kg)', 'snacks-namkeen', 180, '1 kg', 'pack', 220], ['Soan Papdi (500g)', 'sweets-confectionery', 160, '500 g', 'box', 150], ['Assorted Biscuits (1kg)', 'sweets-confectionery', 220, '1 kg', 'pack', 180] ] },
  { email: 'supply@hotelessentials.in', owner: 'Karan Malhotra', phone: '+919876500011', name: 'Hotel Essentials Hub', slug: 'hotel-essentials-hub', logo: '/images/seed/vendor-11.png', city: 'Mumbai', rating: 4.5, mov: 700, credit: true, items: [
    ['Floor Cleaner (5L)', 'cleaning-supplies', 380, '5 L', 'can', 180], ['Hand Wash Refill (5L)', 'cleaning-supplies', 450, '5 L', 'can', 160], ['Paper Napkins (1000 pcs)', 'disposables-packaging', 220, '1000 pcs', 'pack', 400], ['Cling Wrap (300m)', 'disposables-packaging', 280, '300 m', 'roll', 250], ['Cooking Oil — Sunflower (15L)', 'oils-ghee', 1850, '15 L', 'tin', 90] ] },
  { email: 'hello@greenvalleyorganics.in', owner: 'Divya Nair', phone: '+919876500012', name: 'Green Valley Organics', slug: 'green-valley-organics', logo: '/images/seed/vendor-12.png', city: 'Navi Mumbai', rating: 4.7, mov: 400, credit: true, items: [
    ['Organic Baby Spinach', 'vegetables', 60, '250 g', 'pack', 180], ['Organic Cherry Tomatoes', 'vegetables', 90, '250 g', 'pack', 150], ['Organic Bananas', 'fruits', 70, '1 dozen', 'dozen', 160], ['Cold-Pressed Coconut Oil (1L)', 'oils-ghee', 520, '1 L', 'bottle', 120], ['Organic A2 Cow Milk (1L x 6)', 'milk-butter', 540, '6 packs', 'case', 140] ] },
];

const CUSTOMERS = [
  { email: 'chef@tajpalace.com', fullName: 'Vikram Singh', phone: '+919876600001', businessName: 'Taj Palace Restaurant', pincode: '400705' },
  { email: 'owner@greenleafcafe.com', fullName: 'Ananya Menon', phone: '+919876600002', businessName: 'Green Leaf Cafe', pincode: '400703' },
  { email: 'kitchen@grandhyatt.com', fullName: 'Suresh Nair', phone: '+919876600003', businessName: 'Grand Hyatt Kitchen', pincode: '400706' },
];

const BRANDS = [
  { email: 'brand@kitchensmith.com', fullName: 'Rohit Joshi', phone: '+919876700001', name: 'Kitchen Smith', slug: 'kitchen-smith', tagline: 'Premium Spices & Grains for Professional Kitchens', logo: '/images/brand/03b885b1-5477-4aa9-af03-d948165745e61771835977.png', banner: '/images/brand/a9559b8a-60e4-4f54-aa70-30f0752505301767094501.png', products: [ ['All Purpose Flour 1kg', '1 kg', 'Flour & Grains'], ['Basmati Rice 5kg', '5 kg', 'Rice'], ['Turmeric Powder 500g', '500 g', 'Spices'] ] },
  { email: 'brand@kissan.com', fullName: 'Kavita Shah', phone: '+919876700002', name: 'Kissan', slug: 'kissan', tagline: 'Jams, Ketchups & Condiments', logo: '/images/brand/b82cb9a4-f54b-4cee-b2da-27216caf0f0d1768981196.png', banner: '/images/brand/cd69ab10-d9a6-4756-a99a-d330bad80ad41767094494.png', products: [ ['Tomato Ketchup 1kg', '1 kg', 'Condiments'], ['Mixed Fruit Jam 500g', '500 g', 'Jams'] ] },
  { email: 'brand@everest.com', fullName: 'Sanjay Mehta', phone: '+919876700003', name: 'Everest', slug: 'everest', tagline: "India's Favourite Masala Brand", logo: '/images/brand/dc458c67-3702-4da8-8cb8-8011f0d3e17a1767094486.png', banner: '/images/brand/ef12f3b4-b55f-4042-a2ae-2d1083071fd61767094388.png', products: [ ['Garam Masala 100g', '100 g', 'Masalas'], ['Kitchen King Masala 100g', '100 g', 'Masalas'] ] },
];

async function main() {
  console.log('🌱 Seeding database...');
  await seedRoleTemplates();

  // ═══ ADMIN ═══
  const admin = await prisma.user.upsert({
    where: { email: 'admin@horeca1.com' }, update: {},
    create: { email: 'admin@horeca1.com', password: await hash('admin123', 12), fullName: 'HoReCa Admin', role: 'admin', phone: '+919999900000', pincode: '400001', emailVerified: new Date(), hcidDisplay: await uniqueHcid() },
  });
  console.log(`  Admin: ${admin.email}`);

  // ═══ CATEGORIES (2-level) ═══
  const subCat: Record<string, string> = {};
  let parentCount = 0, subCount = 0;
  for (const p of CATALOG) {
    const parent = await prisma.category.upsert({
      where: { slug: p.slug }, update: { imageUrl: p.img, parentId: null },
      create: { name: p.name, slug: p.slug, imageUrl: p.img, sortOrder: ++parentCount, approvalStatus: 'approved' },
    });
    for (const s of p.subs) {
      const sc = await prisma.category.upsert({
        where: { slug: s.slug }, update: { imageUrl: s.img, parentId: parent.id },
        create: { name: s.name, slug: s.slug, imageUrl: s.img, parentId: parent.id, sortOrder: ++subCount, approvalStatus: 'approved' },
      });
      subCat[s.slug] = sc.id;
    }
  }
  console.log(`  Categories: ${parentCount} parent + ${subCount} sub-categories`);

  // ═══ VENDORS + PRODUCTS ═══
  const vendorPw = await hash('vendor123', 12);
  const vendorIds: string[] = [];
  let totalProducts = 0, skuSeq = 0;
  for (let vi = 0; vi < VENDORS.length; vi++) {
    const v = VENDORS[vi];
    const user = await prisma.user.upsert({
      where: { email: v.email }, update: {},
      create: { email: v.email, password: vendorPw, fullName: v.owner, phone: v.phone, role: 'vendor', pincode: SERVICE_PINCODES[0], businessName: v.name, emailVerified: new Date(), hcidDisplay: await uniqueHcid() },
    });
    let vendor = await prisma.vendor.findFirst({ where: { userId: user.id }, select: { id: true } });
    if (!vendor) {
      const ba = await prisma.businessAccount.create({ data: { legalName: v.name, displayName: v.name, isVendor: true, isCustomer: false, status: 'active' } });
      await prisma.businessAccountMember.create({ data: { userId: user.id, businessAccountId: ba.id, isPrimary: true } });
      vendor = await prisma.vendor.create({
        data: { userId: user.id, businessAccountId: ba.id, businessName: v.name, slug: v.slug, description: `${v.name} — bulk supplies for HoReCa businesses across Mumbai & Navi Mumbai.`, logoUrl: VENDOR_LOGOS[vi % VENDOR_LOGOS.length], rating: v.rating, minOrderValue: v.mov, creditEnabled: v.credit, isVerified: true, isActive: true, pickupCity: v.city, pickupState: 'Maharashtra' },
        select: { id: true },
      });
    } else {
      await prisma.vendor.update({ where: { id: vendor.id }, data: { logoUrl: VENDOR_LOGOS[vi % VENDOR_LOGOS.length], isActive: true } });
    }
    vendorIds.push(vendor.id);

    // Service areas (broad) + delivery slots
    for (const pin of SERVICE_PINCODES) {
      await prisma.serviceArea.upsert({ where: { vendorId_pincode: { vendorId: vendor.id, pincode: pin } }, update: {}, create: { vendorId: vendor.id, pincode: pin } });
    }
    for (let day = 1; day <= 6; day++) {
      await prisma.deliverySlot.upsert({ where: { vendorId_dayOfWeek_slotStart: { vendorId: vendor.id, dayOfWeek: day, slotStart: '06:00' } }, update: {}, create: { vendorId: vendor.id, dayOfWeek: day, slotStart: '06:00', slotEnd: '10:00', cutoffTime: '22:00' } });
      await prisma.deliverySlot.upsert({ where: { vendorId_dayOfWeek_slotStart: { vendorId: vendor.id, dayOfWeek: day, slotStart: '14:00' } }, update: {}, create: { vendorId: vendor.id, dayOfWeek: day, slotStart: '14:00', slotEnd: '18:00', cutoffTime: '10:00' } });
    }

    // Products → each maps to a sub-category + a Horeca1 master SKU + valid local image
    for (const [name, sub, price, packSize, unit, stock] of v.items) {
      const categoryId = subCat[sub];
      if (!categoryId) throw new Error(`Unknown sub-category "${sub}" for product "${name}"`);
      const sku = `H1-SEED-${String(++skuSeq).padStart(4, '0')}`;
      const master = await prisma.masterProduct.upsert({ where: { sku }, update: {}, create: { sku, name, uom: unit, categoryId, isActive: true } });
      const slug = `${v.slug}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`.slice(0, 90);
      const imageUrl = pickImage(sub);
      const product = await prisma.product.upsert({
        where: { vendorId_slug: { vendorId: vendor.id, slug } },
        update: { imageUrl, masterProductId: master.id, categoryId },
        create: { vendorId: vendor.id, masterProductId: master.id, categoryId, name, slug, basePrice: price, packSize, unit, imageUrl, creditEligible: v.credit, approvalStatus: 'approved' },
      });
      await prisma.priceSlab.upsert({ where: { productId_minQty: { productId: product.id, minQty: 1 } }, update: {}, create: { productId: product.id, vendorId: vendor.id, minQty: 1, maxQty: 9, price, sortOrder: 0 } });
      await prisma.priceSlab.upsert({ where: { productId_minQty: { productId: product.id, minQty: 10 } }, update: {}, create: { productId: product.id, vendorId: vendor.id, minQty: 10, maxQty: 49, price: Math.round(price * 0.95), sortOrder: 1 } });
      await prisma.priceSlab.upsert({ where: { productId_minQty: { productId: product.id, minQty: 50 } }, update: {}, create: { productId: product.id, vendorId: vendor.id, minQty: 50, maxQty: null, price: Math.round(price * 0.9), sortOrder: 2 } });
      await prisma.inventory.upsert({ where: { productId: product.id }, update: {}, create: { productId: product.id, vendorId: vendor.id, qtyAvailable: stock, lowStockThreshold: Math.max(10, Math.round(stock * 0.1)) } });
      totalProducts++;
    }
    console.log(`  Vendor: ${v.name} (${v.items.length} products)`);
  }
  console.log(`  Total products: ${totalProducts}`);

  // ═══ CUSTOMERS (BusinessAccount + outlet + membership) ═══
  const customerPw = await hash('customer123', 12);
  const customerIds: string[] = [];
  const customerBAs: string[] = [];
  for (const c of CUSTOMERS) {
    const user = await prisma.user.upsert({
      where: { email: c.email }, update: {},
      create: { email: c.email, password: customerPw, fullName: c.fullName, phone: c.phone, role: 'customer', pincode: c.pincode, businessName: c.businessName, emailVerified: new Date(), hcidDisplay: await uniqueHcid() },
    });
    customerIds.push(user.id);
    const existing = await prisma.businessAccountMember.findFirst({ where: { userId: user.id, isPrimary: true, businessAccount: { isCustomer: true } }, select: { businessAccountId: true } });
    if (existing) { customerBAs.push(existing.businessAccountId); }
    else {
      const ba = await prisma.businessAccount.create({ data: { legalName: c.businessName, displayName: c.businessName, isCustomer: true, status: 'active' } });
      const outlet = await prisma.outlet.create({ data: { businessAccountId: ba.id, name: `${c.businessName} — Main`, addressLine: 'Main Branch', city: 'Navi Mumbai', state: 'Maharashtra', pincode: c.pincode, isActive: true } });
      await prisma.businessAccount.update({ where: { id: ba.id }, data: { primaryOutletId: outlet.id } });
      await prisma.businessAccountMember.create({ data: { userId: user.id, businessAccountId: ba.id, isPrimary: true } });
      customerBAs.push(ba.id);
    }
    console.log(`  Customer: ${c.fullName} (${c.businessName})`);
  }

  // Customer ↔ vendor follows (first customer follows first 6 vendors)
  for (let i = 0; i < Math.min(6, vendorIds.length); i++) {
    await prisma.customerVendor.upsert({ where: { businessAccountId_vendorId: { businessAccountId: customerBAs[0], vendorId: vendorIds[i] } }, update: {}, create: { userId: customerIds[0], businessAccountId: customerBAs[0], vendorId: vendorIds[i], isFavorite: i < 2 } });
  }

  // ═══ COLLECTIONS ═══
  for (const col of [
    { name: 'Weekend Specials', slug: 'weekend-specials', description: 'Top picks for weekend menu prep', sortOrder: 1 },
    { name: 'Kitchen Essentials', slug: 'kitchen-essentials', description: 'Must-have staples for every kitchen', sortOrder: 2 },
    { name: 'New Arrivals', slug: 'new-arrivals', description: 'Fresh additions from our vendors', sortOrder: 3 },
  ]) {
    await prisma.collection.upsert({ where: { slug: col.slug }, update: {}, create: col });
  }

  // ═══ BRANDS ═══
  const brandPw = await hash('brand123', 12);
  for (const b of BRANDS) {
    const user = await prisma.user.upsert({
      where: { email: b.email }, update: {},
      create: { email: b.email, password: brandPw, fullName: b.fullName, phone: b.phone, role: 'brand', emailVerified: new Date(), hcidDisplay: await uniqueHcid() },
    });
    const existing = await prisma.brand.findFirst({ where: { userId: user.id }, select: { id: true } });
    if (existing) { await prisma.brand.update({ where: { id: existing.id }, data: { logoUrl: b.logo, bannerUrl: b.banner } }); console.log(`  Brand: ${b.name} (updated)`); continue; }
    const ba = await prisma.businessAccount.create({ data: { legalName: b.name, displayName: b.name, isBrand: true, isCustomer: false, status: 'active' } });
    await prisma.businessAccountMember.create({ data: { userId: user.id, businessAccountId: ba.id, isPrimary: true } });
    const brand = await prisma.brand.create({ data: { userId: user.id, businessAccountId: ba.id, name: b.name, slug: b.slug, tagline: b.tagline, logoUrl: b.logo, bannerUrl: b.banner, approvalStatus: 'approved', isActive: true } });
    for (const [pname, packSize, category] of b.products) {
      const pslug = pname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await prisma.brandMasterProduct.upsert({ where: { brandId_slug: { brandId: brand.id, slug: pslug } }, update: {}, create: { brandId: brand.id, name: pname, slug: pslug, packSize, category, imageUrl: b.logo } });
    }
    console.log(`  Brand: ${b.name} (${b.email})`);
  }

  // ═══ CREDIT ACCOUNTS + WALLETS ═══
  await prisma.creditAccount.upsert({ where: { userId_vendorId: { userId: customerIds[0], vendorId: vendorIds[0] } }, update: {}, create: { userId: customerIds[0], vendorId: vendorIds[0], creditLimit: 50000, creditUsed: 12500, status: 'active' } });
  await prisma.creditAccount.upsert({ where: { userId_vendorId: { userId: customerIds[0], vendorId: vendorIds[1] } }, update: {}, create: { userId: customerIds[0], vendorId: vendorIds[1], creditLimit: 25000, creditUsed: 0, status: 'active' } });
  for (const cid of customerIds) {
    await prisma.wallet.upsert({ where: { userId: cid }, update: {}, create: { userId: cid, balance: 0 } });
  }

  console.log('\n✅ Seed complete!');
  console.log('Login: admin@horeca1.com/admin123 · fresh@dailyfreshfoods.com/vendor123 · brand@kitchensmith.com/brand123 · chef@tajpalace.com/customer123');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
