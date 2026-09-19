// ─── Horeca1 Vendor Marketplace Data ─────────────────────────────────────────
// Flow: Search >> Vendor >> Vendor Catalog >> Order (Swiggy Model)
// Customers buy FROM vendors, not from a universal product pool.

export interface BulkPriceTier {
  minQty: number;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  image: string;
  price: number;
  originalPrice: number;
  unit: string;
  inStock: boolean;
  discount?: number;
  bulkPrices?: BulkPriceTier[];
  isDeal?: boolean;
  frequentlyOrdered?: boolean;
  creditBadge?: boolean;
}

export interface VendorCategory {
  id: string;
  name: string;
  image: string;
  products: Product[];
}

export interface Vendor {
  id: string;
  name: string;
  slug: string;
  logo: string;
  tagline: string;
  categories: string[]; // short summary tags
  rating: number;
  totalRatings: number;
  deliverySchedule: string;
  deliveryTime: string;
  minOrderValue: number;
  creditEnabled: boolean;
  isOpen: boolean;
  isActive: boolean;
  catalog: VendorCategory[];
}

export interface GlobalCategory {
  id: string;
  name: string;
  image: string;
}

// ─── 19 Global Categories ────────────────────────────────────────────────────

export const globalCategories: GlobalCategory[] = [
  { id: 'fruits-vegetables', name: 'Fruits & Vegetables', image: '/images/placeholders/no-category.svg' },
  { id: 'dairy', name: 'Dairy', image: '/images/category/milk.png' },
  { id: 'canned-imported', name: 'Canned & Imported', image: '/images/category/candy.png' },
  { id: 'flours', name: 'Flours', image: '/images/category/snacks.png' },
  { id: 'sauces-seasoning', name: 'Sauces & Seasoning', image: '/images/category/drink-juice.png' },
  { id: 'masala-salt-sugar', name: 'Masala, Salt & Sugar', image: '/images/masala-salt/masala-salt-logo.png' },
  { id: 'chicken-eggs', name: 'Chicken & Eggs', image: '/images/category/animal food.png' },
  { id: 'edible-oils', name: 'Edible Oils', image: '/images/edible-oil/ediable-oil-logo.png' },
  { id: 'custom-packaging', name: 'Custom Packaging', image: '/images/placeholders/no-category.svg' },
  { id: 'frozen-instant', name: 'Frozen & Instant Food', image: '/images/category/frozen foods.png' },
  { id: 'packaging-material', name: 'Packaging Material', image: '/images/placeholders/no-category.svg' },
  { id: 'bakery-chocolates', name: 'Bakery & Chocolates', image: '/images/category/candy.png' },
  { id: 'beverages-mixers', name: 'Beverages & Mixers', image: '/images/category/drink-juice.png' },
  { id: 'cleaning-consumables', name: 'Cleaning & Consumables', image: '/images/category/snacks.png' },
  { id: 'pulses', name: 'Pulses', image: '/images/category/snacks.png' },
  { id: 'mutton-duck-meat', name: 'Mutton, Duck & Meat', image: '/images/category/fish & meat.png' },
  { id: 'dry-fruits-nuts', name: 'Dry Fruits & Nuts', image: '/images/category/fruits.png' },
  { id: 'rice-products', name: 'Rice & Rice Products', image: '/images/category/snacks.png' },
  { id: 'fish-prawns-seafood', name: 'Fish, Prawns & Seafood', image: '/images/category/fish & meat.png' },
];

// ─── 10 Vendors with Catalog ─────────────────────────────────────────────────

export const vendors: Vendor[] = [
  // ── 1. Cartomart ───────────────────────────────────────────────────────
  {
    id: 'v6',
    name: 'Cartomart',
    slug: 'cartomart',
    logo: '/images/top vendors/39a5dd37096e44eb8b72e053055e32896d63c44a.png',
    tagline: 'Fresh grocery delivered daily',
    categories: ['Dairy', 'Flours', 'Chicken & Eggs'],
    rating: 4.6,
    totalRatings: 98,
    deliverySchedule: 'Tomorrow 10:00 AM',
    deliveryTime: '24 hrs',
    minOrderValue: 500,
    creditEnabled: true,
    isOpen: true,
    isActive: true,
    catalog: [
      {
        id: 'dairy',
        name: 'Dairy',
        image: '/images/category/milk.png',
        products: [
          { id: 'am-d1', name: 'Amul Gold Full Cream Milk 1L', image: '/images/dairy/amul-butter.png', price: 72, originalPrice: 78, unit: '1 L', inStock: false, discount: 8, bulkPrices: [{ minQty: 12, price: 68 }, { minQty: 24, price: 65 }] },
          { id: 'am-d2', name: 'Mother Dairy Toned Milk 500ml', image: '/images/dairy/amul-cheese.png', price: 30, originalPrice: 32, unit: '500 ml', inStock: true, bulkPrices: [{ minQty: 12, price: 28 }], frequentlyOrdered: true },
        ],
      },
      {
        id: 'flours',
        name: 'Flours',
        image: '/images/category/snacks.png',
        products: [
          { id: 'am-f1', name: 'Aashirvaad Atta 5kg', image: '/images/daily-best-sell/best-sell1.png', price: 245, originalPrice: 280, unit: '5 kg', inStock: true, discount: 12, isDeal: true, bulkPrices: [{ minQty: 5, price: 230 }, { minQty: 10, price: 215 }] },
          { id: 'am-f2', name: 'Maida 1kg', image: '/images/daily-best-sell/best-sell2.png', price: 45, originalPrice: 55, unit: '1 kg', inStock: true, bulkPrices: [{ minQty: 10, price: 40 }] },
        ],
      },
      {
        id: 'chicken-eggs',
        name: 'Chicken & Eggs',
        image: '/images/category/animal food.png',
        products: [
          { id: 'am-ce1', name: 'Farm Fresh Eggs 12pcs', image: '/images/category/animal food.png', price: 84, originalPrice: 100, unit: '12 pcs', inStock: true, discount: 16, isDeal: true, bulkPrices: [{ minQty: 5, price: 78 }, { minQty: 10, price: 72 }], frequentlyOrdered: true },
        ],
      },
    ],
  },

  // ── 2. Mentari Mart ─────────────────────────────────────────────────────
  {
    id: 'v7',
    name: 'Mentari Mart',
    slug: 'mentari-mart',
    logo: '/images/top vendors/658b597eb627e280b99c0cf10e482793 2.png',
    tagline: 'Grocery & Vegetables marketplace',
    categories: ['Pulses', 'Edible Oils'],
    rating: 4.3,
    totalRatings: 110,
    deliverySchedule: 'Tomorrow 9:00 AM',
    deliveryTime: '18 hrs',
    minOrderValue: 1000,
    creditEnabled: true,
    isOpen: true,
    isActive: true,
    catalog: [
      {
        id: 'pulses',
        name: 'Pulses',
        image: '/images/category/snacks.png',
        products: [
          { id: 'mf-1', name: 'Toor Dal 1kg', image: '/images/organic/product-img20.png', price: 155, originalPrice: 180, unit: '1 kg', inStock: true, discount: 14, isDeal: true, bulkPrices: [{ minQty: 5, price: 145 }, { minQty: 10, price: 135 }] },
          { id: 'mf-2', name: 'Moong Dal 1kg', image: '/images/organic/product-img21.png', price: 140, originalPrice: 160, unit: '1 kg', inStock: true, bulkPrices: [{ minQty: 5, price: 130 }] },
        ],
      },
      {
        id: 'edible-oils',
        name: 'Edible Oils',
        image: '/images/edible-oil/ediable-oil-logo.png',
        products: [
          { id: 'mf-o1', name: 'Fortune Sunflower Oil 1L', image: '/images/edible-oil/ediable-oil-logo.png', price: 165, originalPrice: 185, unit: '1 L', inStock: true, bulkPrices: [{ minQty: 6, price: 155 }, { minQty: 12, price: 145 }], frequentlyOrdered: true },
          { id: 'mf-o2', name: 'Saffola Gold 1L', image: '/images/edible-oil/ediable-oil-logo.png', price: 210, originalPrice: 240, unit: '1 L', inStock: false, discount: 12, isDeal: true, bulkPrices: [{ minQty: 6, price: 195 }] },
        ],
      },
    ],
  },

  // ── 3. Borcelle ─────────────────────────────────────────────────────────
  {
    id: 'v5',
    name: 'Borcelle',
    slug: 'borcelle',
    logo: '/images/top vendors/961d17c25868145dd167df9f88ca0d40a7c057d1.png',
    tagline: 'Organic and dry fruits specialists',
    categories: ['Fruits & Vegetables', 'Dry Fruits & Nuts'],
    rating: 4.8,
    totalRatings: 201,
    deliverySchedule: 'Tomorrow 8:00 AM',
    deliveryTime: '6 hrs',
    minOrderValue: 300,
    creditEnabled: false,
    isOpen: true,
    isActive: true,
    catalog: [
      {
        id: 'fruits-vegetables',
        name: 'Fruits & Vegetables',
        image: '/images/placeholders/no-category.svg',
        products: [
          { id: 'fh-1', name: 'Fresh Tomato 1kg', image: '/images/placeholders/no-product.svg', price: 35, originalPrice: 50, unit: '1 kg', inStock: true, discount: 30, isDeal: true, bulkPrices: [{ minQty: 5, price: 30 }, { minQty: 10, price: 27 }] },
          { id: 'fh-2', name: 'Onion 1kg', image: '/images/placeholders/no-category.svg', price: 40, originalPrice: 60, unit: '1 kg', inStock: false, discount: 33, isDeal: true },
        ],
      },
      {
        id: 'dry-fruits-nuts',
        name: 'Dry Fruits & Nuts',
        image: '/images/category/fruits.png',
        products: [
          { id: 'fh-df1', name: 'California Almonds 500g', image: '/images/category/fruits.png', price: 450, originalPrice: 550, unit: '500 g', inStock: true, discount: 18, isDeal: true, bulkPrices: [{ minQty: 3, price: 420 }, { minQty: 5, price: 400 }] },
          { id: 'fh-df2', name: 'W240 Cashews 500g', image: '/images/category/fruits.png', price: 480, originalPrice: 600, unit: '500 g', inStock: true, discount: 20, isDeal: true, bulkPrices: [{ minQty: 3, price: 450 }] },
        ],
      },
    ],
  },

  // 4. Arisha Mart ────────────────────────────────────────────────────────
  {
    id: 'v8',
    name: 'Arisha Mart',
    slug: 'arisha-mart',
    logo: '/images/top vendors/ecommerce-logo-template_658705-117 3.png',
    tagline: 'Grocery, Electronics and more',
    categories: ['Dairy', 'Custom Packaging'],
    rating: 4.5,
    totalRatings: 1200,
    deliverySchedule: 'Today 8:00 PM',
    deliveryTime: '20 hrs',
    minOrderValue: 400,
    creditEnabled: true,
    isOpen: true,
    isActive: true,
    catalog: [
      {
        id: 'dairy',
        name: 'Dairy',
        image: '/images/category/milk.png',
        products: [
          { id: 'gd-6', name: 'Fresh Bread Loaf 400g', image: '/images/daily-best-sell/best-sell1.png', price: 40, originalPrice: 45, unit: '400 g', inStock: true },
          { id: 'gd-7', name: 'Pav 8pcs', image: '/images/daily-best-sell/best-sell2.png', price: 30, originalPrice: 35, unit: '8 pcs', inStock: true },
        ],
      },
      {
        id: 'custom-packaging',
        name: 'Custom Packaging',
        image: '/images/placeholders/no-category.svg',
        products: [
          { id: 'wm-p1', name: 'Branded Paper Cups 500pcs', image: '/images/placeholders/no-category.svg', price: 750, originalPrice: 900, unit: '500 pcs', inStock: true, discount: 16 },
          { id: 'wm-p2', name: 'Custom Carry Bags 200pcs', image: '/images/placeholders/no-category.svg', price: 400, originalPrice: 500, unit: '200 pcs', inStock: true },
        ],
      },
    ],
  },

  // ── 5. Allure Mart ──────────────────────────────────────────────────────
  {
    id: 'v9',
    name: 'Allure Mart',
    slug: 'allure-mart',
    logo: '/images/top vendors/da025fadd66fb2aef4d63f0db58b86b5 2.png',
    tagline: 'Premium grocery and beauty products',
    categories: ['Masala, Salt & Sugar', 'Frozen & Instant Food'],
    rating: 4.4,
    totalRatings: 150,
    deliverySchedule: 'Tomorrow 11:00 AM',
    deliveryTime: '24 hrs',
    minOrderValue: 750,
    creditEnabled: false,
    isOpen: true,
    isActive: true,
    catalog: [
      {
        id: 'masala-salt-sugar',
        name: 'Masala, Salt & Sugar',
        image: '/images/masala-salt/masala-salt-logo.png',
        products: [
          { id: 'sk-1', name: 'Everest Turmeric Powder 200g', image: '/images/masala-salt/everest-masala.png', price: 55, originalPrice: 65, unit: '200 g', inStock: true, discount: 15, isDeal: true, bulkPrices: [{ minQty: 6, price: 50 }, { minQty: 12, price: 45 }] },
          { id: 'sk-2', name: 'Tata Salt 1kg', image: '/images/masala-salt/masala-salt-logo.png', price: 25, originalPrice: 28, unit: '1 kg', inStock: true, bulkPrices: [{ minQty: 10, price: 22 }], frequentlyOrdered: true },
        ],
      },
      {
        id: 'frozen-instant',
        name: 'Frozen & Instant Food',
        image: '/images/category/frozen foods.png',
        products: [
          { id: 'al-f1', name: 'Cup Noodles 70g', image: '/images/category/frozen foods.png', price: 45, originalPrice: 50, unit: '70 g', inStock: true },
          { id: 'al-f2', name: 'Poha Instant Mix 1kg', image: '/images/category/frozen foods.png', price: 120, originalPrice: 150, unit: '1 kg', inStock: true },
        ],
      },
    ],
  },

  // ── 6. Walmart ───────────────────────────────────────────────────────
  {
    id: 'v10',
    name: 'Walmart',
    slug: 'walmart',
    logo: '/images/top vendors/m-mart-grocery-store-brands-logo-238132857 3.png',
    tagline: 'Grocery and dry fruits center',
    categories: ['Bakery & Chocolates', 'Packaging Material'],
    rating: 4.7,
    totalRatings: 85,
    deliverySchedule: 'Tomorrow 7:00 AM',
    deliveryTime: '22 hrs',
    minOrderValue: 600,
    creditEnabled: true,
    isOpen: true,
    isActive: true,
    catalog: [
      {
        id: 'bakery-chocolates',
        name: 'Bakery & Chocolates',
        image: '/images/category/candy.png',
        products: [
          { id: 'bh-1', name: 'Chocolate Compound 500g', image: '/images/daily-best-sell/best-sell3.png', price: 165, originalPrice: 195, unit: '500 g', inStock: true, discount: 15, isDeal: true, bulkPrices: [{ minQty: 4, price: 155 }, { minQty: 8, price: 145 }] },
          { id: 'bh-2', name: 'Baking Powder 100g', image: '/images/category/candy.png', price: 45, originalPrice: 55, unit: '100 g', inStock: true, bulkPrices: [{ minQty: 6, price: 40 }] },
        ],
      },
      {
        id: 'packaging-material',
        name: 'Packaging Material',
        image: '/images/placeholders/no-category.svg',
        products: [
          { id: 'cm-pm1', name: 'Clear Wrap Roll', image: '/images/placeholders/no-category.svg', price: 180, originalPrice: 220, unit: '1 roll', inStock: true },
        ],
      },
    ],
  },

  // ── 7. Emarket ──────────────────────────────────────────────────────
  {
    id: 'v1',
    name: 'Emarket',
    slug: 'emarket',
    logo: '/images/placeholders/no-vendor.svg',
    tagline: 'Your everyday grocery and household needs',
    categories: ['Fruits & Vegetables', 'Cleaning & Consumables', 'Bakery & Chocolates'],
    rating: 4.1,
    totalRatings: 234,
    deliverySchedule: 'Tomorrow 7:00 AM',
    deliveryTime: '12 hrs',
    minOrderValue: 250,
    creditEnabled: false,
    isOpen: true,
    isActive: true,
    catalog: [
      {
        id: 'fruits-vegetables',
        name: 'Fruits & Vegetables',
        image: '/images/placeholders/no-category.svg',
        products: [
          { id: 'em-1', name: 'Mixed Vegetable Pack 1kg', image: '/images/placeholders/no-category.svg', price: 65, originalPrice: 80, unit: '1 kg', inStock: true, discount: 19, isDeal: true, bulkPrices: [{ minQty: 5, price: 58 }, { minQty: 10, price: 52 }], frequentlyOrdered: true },
          { id: 'em-2', name: 'Carrot 500g', image: '/images/organic/product-img20.png', price: 22, originalPrice: 28, unit: '500 g', inStock: true },
        ],
      },
      {
        id: 'cleaning-consumables',
        name: 'Cleaning & Consumables',
        image: '/images/category/snacks.png',
        products: [
          { id: 'em-5', name: 'Vim Dishwash Bar 500g', image: '/images/product/product-img1.png', price: 42, originalPrice: 48, unit: '500 g', inStock: true, bulkPrices: [{ minQty: 6, price: 38 }, { minQty: 12, price: 35 }] },
          { id: 'em-9', name: 'Surf Excel Quick Wash 1kg', image: '/images/product/product-img1.png', price: 110, originalPrice: 130, unit: '1 kg', inStock: true, bulkPrices: [{ minQty: 4, price: 100 }], frequentlyOrdered: true },
        ],
      },
      {
        id: 'bakery-chocolates',
        name: 'Bakery & Chocolates',
        image: '/images/category/candy.png',
        products: [
          { id: 'em-bc1', name: 'Dark Chocolate chips 500g', image: '/images/category/candy.png', price: 210, originalPrice: 250, unit: '500 g', inStock: false },
        ],
      },
    ],
  },

  // ── 8. Whole Foods Market ────────────────────────────────────────────────
  {
    id: 'v2',
    name: 'Whole Food Market',
    slug: 'whole-foods',
    logo: '/images/top vendors/whole-foods-market.png',
    tagline: 'Organic and whole grain superstore',
    categories: ['Fruits & Vegetables', 'Beverages & Mixers', 'Rice & Rice Products'],
    rating: 4.6,
    totalRatings: 312,
    deliverySchedule: 'Today 4:00 PM',
    deliveryTime: '14 hrs',
    minOrderValue: 500,
    creditEnabled: true,
    isOpen: true,
    isActive: true,
    catalog: [
      {
        id: 'fruits-vegetables',
        name: 'Fruits & Vegetables',
        image: '/images/placeholders/no-category.svg',
        products: [
          { id: 'wf-1', name: 'Organic Spinach 200g', image: '/images/fruits-vegetables/corriander.png', price: 35, originalPrice: 45, unit: '200 g', inStock: true, discount: 22, isDeal: true, bulkPrices: [{ minQty: 5, price: 30 }] },
          { id: 'wf-2', name: 'Avocado 2pcs', image: '/images/category/fruits.png', price: 180, originalPrice: 220, unit: '2 pcs', inStock: true, bulkPrices: [{ minQty: 4, price: 165 }, { minQty: 8, price: 155 }] },
        ],
      },
      {
        id: 'beverages-mixers',
        name: 'Beverages & Mixers',
        image: '/images/category/drink-juice.png',
        products: [
          { id: 'wf-b1', name: 'Fresh Orange Juice 1L', image: '/images/category/drink-juice.png', price: 120, originalPrice: 150, unit: '1 L', inStock: true },
        ],
      },
      {
        id: 'rice-products',
        name: 'Rice & Rice Products',
        image: '/images/category/snacks.png',
        products: [
          { id: 'wf-r1', name: 'Basmati Rice 5kg', image: '/images/category/snacks.png', price: 550, originalPrice: 650, unit: '5 kg', inStock: true },
        ],
      },
    ],
  },

  // ── 9. M Mart ────────────────────────────────────────────────────────────
  {
    id: 'v3',
    name: 'M Mart',
    slug: 'm-mart',
    logo: '/images/top vendors/m-mart.png',
    tagline: 'Imported, frozen, and ready-to-eat specialists',
    categories: ['Canned & Imported', 'Mutton, Duck & Meat', 'Fish, Prawns & Seafood', 'Sauces & Seasoning'],
    rating: 4.2,
    totalRatings: 189,
    deliverySchedule: 'Tomorrow 6:00 AM',
    deliveryTime: '16 hrs',
    minOrderValue: 800,
    creditEnabled: false,
    isOpen: true,
    isActive: true,
    catalog: [
      {
        id: 'canned-imported',
        name: 'Canned & Imported',
        image: '/images/category/candy.png',
        products: [
          { id: 'mm-1', name: 'Del Monte Pineapple Slices 450g', image: '/images/daily-best-sell/best-sell1.png', price: 145, originalPrice: 170, unit: '450 g', inStock: true },
        ],
      },
      {
        id: 'mutton-duck-meat',
        name: 'Mutton, Duck & Meat',
        image: '/images/category/fish & meat.png',
        products: [
          { id: 'mm-m1', name: 'Premium Mutton 1kg', image: '/images/category/fish & meat.png', price: 750, originalPrice: 850, unit: '1 kg', inStock: true },
        ],
      },
      {
        id: 'fish-prawns-seafood',
        name: 'Fish, Prawns & Seafood',
        image: '/images/category/fish & meat.png',
        products: [
          { id: 'mm-s1', name: 'Frozen Prawns 500g', image: '/images/category/fish & meat.png', price: 350, originalPrice: 450, unit: '500 g', inStock: true },
        ],
      },
      {
        id: 'sauces-seasoning',
        name: 'Sauces & Seasoning',
        image: '/images/category/drink-juice.png',
        products: [
          { id: 'mm-ss1', name: 'Ketchup 1kg', image: '/images/category/drink-juice.png', price: 120, originalPrice: 150, unit: '1 kg', inStock: true },
        ],
      },
    ],
  },

  // ── 10. Groceri ──────────────────────────────────────────────────────
  {
    id: 'v4',
    name: 'Groceri',
    slug: 'groceri',
    logo: '/images/top vendors/groceri.png',
    tagline: 'Complete grocery and daily essentials',
    categories: ['Pulses', 'Dairy'],
    rating: 4.0,
    totalRatings: 156,
    deliverySchedule: 'Tomorrow 5:30 AM',
    deliveryTime: '10 hrs',
    minOrderValue: 200,
    creditEnabled: true,
    isOpen: true,
    isActive: true,
    catalog: [
      {
        id: 'pulses',
        name: 'Pulses',
        image: '/images/category/snacks.png',
        products: [
          { id: 'gr-p1', name: 'Chana Dal 1kg', image: '/images/category/snacks.png', price: 95, originalPrice: 110, unit: '1 kg', inStock: true },
        ],
      },
      {
        id: 'dairy',
        name: 'Dairy',
        image: '/images/category/milk.png',
        products: [
          { id: 'gr-6', name: 'Nestle Milk 1L', image: '/images/dairy/amul-butter.png', price: 72, originalPrice: 80, unit: '1 L', inStock: true, bulkPrices: [{ minQty: 12, price: 68 }, { minQty: 24, price: 64 }], frequentlyOrdered: true },
        ],
      },
    ],
  },
];

// ─── Helper Functions ────────────────────────────────────────────────────────

/** Get all vendors that sell products in a given category */
export function getVendorsByCategory(categoryId: string): Vendor[] {
  return vendors.filter(v =>
    v.catalog.some(c => c.id === categoryId)
  );
}

/** Get a specific vendor by ID */
export function getVendorById(vendorId: string): Vendor | undefined {
  return vendors.find(v => v.id === vendorId);
}

/** Get a vendor's catalog for a specific category */
export function getVendorCategoryProducts(vendorId: string, categoryId: string): Product[] {
  const vendor = getVendorById(vendorId);
  if (!vendor) return [];
  const cat = vendor.catalog.find(c => c.id === categoryId);
  return cat?.products || [];
}

/** Get all products across all vendors for a category (with vendor info) */
export function getAllProductsInCategory(categoryId: string): { product: Product; vendor: Vendor }[] {
  const results: { product: Product; vendor: Vendor }[] = [];
  vendors.forEach(v => {
    const cat = v.catalog.find(c => c.id === categoryId);
    if (cat) {
      cat.products.forEach(p => {
        results.push({ product: p, vendor: v });
      });
    }
  });
  return results;
}

/** Search vendors by name or category tags */
export function searchVendors(query: string): Vendor[] {
  const q = query.toLowerCase();
  return vendors.filter(v =>
    v.name.toLowerCase().includes(q) ||
    v.categories.some(c => c.toLowerCase().includes(q)) ||
    v.tagline.toLowerCase().includes(q)
  );
}

/** Search products across all vendors */
export function searchProducts(query: string): { product: Product; vendor: Vendor; categoryName: string }[] {
  const q = query.toLowerCase();
  const results: { product: Product; vendor: Vendor; categoryName: string }[] = [];
  vendors.forEach(v => {
    v.catalog.forEach(cat => {
      cat.products.forEach(p => {
        if (p.name.toLowerCase().includes(q)) {
          results.push({ product: p, vendor: v, categoryName: cat.name });
        }
      });
    });
  });
  return results;
}

/** Get a flat list of all unique category IDs served by all vendors */
export function getActiveCategories(): GlobalCategory[] {
  const activeIds = new Set<string>();
  vendors.forEach(v => {
    v.catalog.forEach(c => activeIds.add(c.id));
  });
  return globalCategories.filter(gc => activeIds.has(gc.id));
}

/** Get "featured" or "top-rated" vendors */
export function getTopVendors(count = 4): Vendor[] {
  return [...vendors].sort((a, b) => b.rating - a.rating).slice(0, count);
}

/** Get best deals across all vendors */
export function getBestDeals(count = 8): { product: Product; vendor: Vendor }[] {
  const all: { product: Product; vendor: Vendor; discount: number }[] = [];
  vendors.forEach(v => {
    v.catalog.forEach(cat => {
      cat.products.forEach(p => {
        if (p.discount && p.inStock) {
          all.push({ product: p, vendor: v, discount: p.discount });
        }
      });
    });
  });
  return all.sort((a, b) => b.discount - a.discount).slice(0, count);
}
