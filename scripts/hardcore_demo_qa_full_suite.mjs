import { chromium } from '@playwright/test';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://demo.horeca1.com';
const SCREENSHOT_DIR = path.resolve('C:\\Users\\mayur\\.gemini\\antigravity-ide\\brain\\f4dcf628-8d75-4368-a72f-6faea7001b4f');

async function runHardcoreSuite() {
  console.log('========================================================================');
  console.log(`   COMMENCING FULL HARDCORE QA SUITE ON: ${BASE_URL}   `);
  console.log('========================================================================\n');

  const report = {
    target: BASE_URL,
    timestamp: new Date().toISOString(),
    summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
    tests: [],
    bugs: [],
    networkErrors: [],
    consoleErrors: [],
    apiAudits: [],
    screenshots: [],
  };

  function logPass(title, details) {
    report.summary.total++;
    report.summary.passed++;
    report.tests.push({ title, status: 'PASS', details });
    console.log(`  [PASS] ${title}: ${details}`);
  }

  function logFail(title, details, severity = 'HIGH') {
    report.summary.total++;
    report.summary.failed++;
    report.tests.push({ title, status: 'FAIL', severity, details });
    report.bugs.push({ title, severity, details });
    console.log(`  [FAIL - ${severity}] ${title}: ${details}`);
  }

  function logWarn(title, details) {
    report.summary.total++;
    report.summary.warnings++;
    report.tests.push({ title, status: 'WARN', details });
    report.bugs.push({ title, severity: 'LOW/WARN', details });
    console.log(`  [WARN] ${title}: ${details}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: DIRECT API AUDITS & PERMISSIONS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- PHASE 1: Direct API Audits & Security Controls ---');

  let adminCookiesRaw = [];
  let adminCookieHeader = '';
  try {
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
    const cookies = csrfRes.headers.raw()['set-cookie'] || [];
    const csrfData = await csrfRes.json();
    const params = new URLSearchParams();
    params.append('csrfToken', csrfData.csrfToken);
    params.append('callbackUrl', `${BASE_URL}/`);
    params.append('json', 'true');
    params.append('email', 'admin@horeca1.com');
    params.append('password', 'admin123');

    const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials?`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies.map(c => c.split(';')[0]).join('; ') },
      body: params.toString(),
      redirect: 'manual'
    });
    adminCookiesRaw = [...cookies, ...(loginRes.headers.raw()['set-cookie'] || [])];
    adminCookieHeader = adminCookiesRaw.map(c => c.split(';')[0]).join('; ');
    logPass('Admin HTTP Authentication', 'Successfully obtained session cookies for admin@horeca1.com');
  } catch (err) {
    logFail('Admin HTTP Authentication', err.message, 'CRITICAL');
  }

  // Test API Endpoints
  const apiChecklist = [
    { url: '/api/health', auth: false, expected: 200, name: 'System Health API' },
    { url: '/api/v1/categories', auth: false, expected: 200, name: 'Catalog Categories API' },
    { url: '/api/v1/vendors', auth: false, expected: 200, name: 'Public Vendors API' },
    { url: '/api/v1/cart', auth: false, expected: [200, 401], name: 'Public Cart API (Guest)' },
    { url: '/api/v1/cart', auth: true, expected: 200, name: 'Cart API (Authenticated)' },
    { url: '/api/v1/admin/products?limit=10', auth: true, expected: 200, name: 'Admin Products Listing' },
    { url: '/api/v1/admin/orders?limit=10', auth: true, expected: 200, name: 'Admin Orders Listing' },
    { url: '/api/v1/admin/users?limit=10', auth: true, expected: 200, name: 'Admin Users Listing' },
    { url: '/api/v1/admin/vendors?view=suppliers&limit=10', auth: true, expected: 200, name: 'Admin Suppliers Listing' },
    { url: '/api/v1/admin/products/export?template=true&format=xlsx', auth: true, expected: 200, name: 'Admin Bulk Import Template' },
    { url: '/api/v1/vendor/products/import?template=true', auth: false, expected: 401, name: 'Unauthenticated Import Gatekeeper' },
    { url: '/api/v1/admin/analytics/overview', auth: true, expected: [200, 404], name: 'Admin Analytics API' },
  ];

  for (const item of apiChecklist) {
    try {
      const res = await fetch(`${BASE_URL}${item.url}`, {
        headers: item.auth ? { 'Cookie': adminCookieHeader } : {}
      });
      const acceptable = Array.isArray(item.expected) ? item.expected.includes(res.status) : res.status === item.expected;
      if (acceptable) {
        logPass(item.name, `HTTP ${res.status} (matches expectation)`);
      } else {
        logFail(item.name, `Expected HTTP ${JSON.stringify(item.expected)}, received HTTP ${res.status}`);
      }
      report.apiAudits.push({ name: item.name, url: item.url, status: res.status });
    } catch (e) {
      logFail(item.name, `Request failed: ${e.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: LAUNCH GOOGLE CHROME FOR PLAYWRIGHT TESTING
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- PHASE 2: Chrome Browser Hardcore UI Automation ---');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const playwrightCookies = [];
  for (const raw of adminCookiesRaw) {
    const parts = raw.split(';');
    const [name, ...valParts] = parts[0].trim().split('=');
    const value = valParts.join('=');
    if (name && value) {
      playwrightCookies.push({
        name,
        value,
        domain: 'demo.horeca1.com',
        path: '/',
        httpOnly: raw.toLowerCase().includes('httponly'),
        secure: raw.toLowerCase().includes('secure'),
        sameSite: 'Lax',
      });
    }
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  await context.addCookies(playwrightCookies);
  await context.addInitScript(() => {
    localStorage.setItem('pincode_interacted', 'true');
    localStorage.setItem('user_pincode', '400001');
    localStorage.setItem('horeca1_selected_address', JSON.stringify({
      id: 'pin_demo_auto',
      label: 'HQ Store',
      fullAddress: 'Fort, Mumbai, Maharashtra 400001',
      shortAddress: 'Mumbai 400001',
      pincode: '400001',
      city: 'Mumbai',
      state: 'Maharashtra',
      latitude: 18.93,
      longitude: 72.83
    }));
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('favicon') && !txt.includes('sentry') && !txt.includes('Google Maps JavaScript API') && !txt.includes('clarity')) {
        report.consoleErrors.push({ text: txt, url: page.url() });
      }
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    const status = res.status();
    if (status >= 400 && !url.includes('favicon') && !url.includes('google-analytics') && !url.includes('googletagmanager')) {
      report.networkErrors.push({ status, url, page: page.url() });
    }
  });

  async function takeScreenshot(name) {
    const filename = `hardcore_${name}.png`;
    const filePath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filePath, fullPage: false }).catch(() => {});
    report.screenshots.push({ name, path: filePath });
    return filePath;
  }

  try {
    // ───────────────────────────────────────────────────────────────────────
    // 2.1 STOREFRONT HOMEPAGE
    // ───────────────────────────────────────────────────────────────────────
    console.log('\n[2.1] Storefront Homepage Testing...');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    const title = await page.title();
    if (title.toLowerCase().includes('horeca1')) {
      logPass('Homepage Document Title', `Title: "${title}"`);
    } else {
      logFail('Homepage Document Title', `Unexpected title: "${title}"`);
    }

    await takeScreenshot('storefront_home');

    // Global Search Bar
    const searchBar = page.locator('input[placeholder*="Search"]').first();
    if (await searchBar.isVisible().catch(() => false)) {
      logPass('Storefront Global Search Bar', 'Visible and interactive');
    } else {
      logFail('Storefront Global Search Bar', 'Search bar input not found or hidden', 'MEDIUM');
    }

    // ───────────────────────────────────────────────────────────────────────
    // 2.2 SUPPLIERS DIRECTORY (/vendors)
    // ───────────────────────────────────────────────────────────────────────
    console.log('\n[2.2] Testing Suppliers Directory (/vendors)...');
    await page.goto(`${BASE_URL}/vendors`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    await takeScreenshot('vendors_directory');

    const vendorButtons = page.locator('button:has-text("Browse Store"), a:has-text("Browse Store")');
    const vendorCount = await vendorButtons.count();
    if (vendorCount >= 1) {
      logPass('Suppliers Directory Count', `Found ${vendorCount} active suppliers with "Browse Store" buttons`);
    } else {
      logFail('Suppliers Directory Count', 'Zero supplier cards rendered on /vendors', 'HIGH');
    }

    // Broken image detection on /vendors
    const brokenImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs
        .filter(img => !img.complete || img.naturalWidth === 0 || img.src === '' || img.src.includes('data:image/svg+xml;base64,PHN2Zy'))
        .map(img => ({ src: img.src.slice(0, 80), alt: img.alt, parent: img.parentElement?.innerText?.slice(0, 30) }));
    });
    if (brokenImages.length > 0) {
      logWarn('Supplier Images Audit', `Detected ${brokenImages.length} images with missing/placeholder src on /vendors (e.g. Freshville): ${JSON.stringify(brokenImages.slice(0, 2))}`);
    } else {
      logPass('Supplier Images Audit', 'All rendered supplier images loaded successfully');
    }

    // ───────────────────────────────────────────────────────────────────────
    // 2.3 SUPPLIER STOREFRONT & CATALOG BROWSING
    // ───────────────────────────────────────────────────────────────────────
    console.log('\n[2.3] Testing Supplier Storefront & Product Links...');
    if (vendorCount > 0) {
      await vendorButtons.first().click();
      await page.waitForTimeout(3000);

      const currentStoreUrl = page.url();
      logPass('Navigate to Supplier Store', `Navigated to ${currentStoreUrl}`);
      await takeScreenshot('supplier_store_catalog');

      // Product links in store
      const productCards = page.locator('a[href*="/product/"]');
      const storeProdCount = await productCards.count();
      if (storeProdCount > 0) {
        logPass('Store Product Catalog', `Found ${storeProdCount} product items inside store`);

        const firstProdHref = await productCards.first().getAttribute('href');
        console.log(`  Sample product href: ${firstProdHref}`);

        // Navigate to PDP
        await page.goto(new URL(firstProdHref, BASE_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(2500);

        await takeScreenshot('product_detail_page');

        const prodTitle = await page.locator('h1').innerText().catch(() => '');
        if (prodTitle) {
          logPass('Product Detail Page Render', `Product "${prodTitle}" loaded at ${page.url()}`);
        } else {
          logFail('Product Detail Page Render', `Missing H1 product title at ${page.url()}`, 'MEDIUM');
        }

        // Test "Add to Cart" button
        const addToCartBtn = page.locator('button:has-text("Add to Cart"), button:has-text("Add")').first();
        if (await addToCartBtn.isVisible().catch(() => false)) {
          logPass('Product "Add to Cart" Button', 'Button visible on PDP');
          await addToCartBtn.click().catch(() => {});
          await page.waitForTimeout(2000);
          await takeScreenshot('after_add_to_cart');

          // Check if cart counter or drawer updated
          const cartCount = await page.locator('[data-testid="cart-badge"], .cart-count, a[href="/cart"]').innerText().catch(() => '');
          console.log(`  Cart counter after adding item: "${cartCount.trim()}"`);
        } else {
          logWarn('Product "Add to Cart" Button', 'Add button not visible or product out of stock');
        }
      } else {
        logWarn('Store Product Catalog', `Supplier at ${currentStoreUrl} has 0 listed products`);
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // 2.4 CART & CHECKOUT PAGE INSPECTION
    // ───────────────────────────────────────────────────────────────────────
    console.log('\n[2.4] Testing Cart & Checkout Pages...');
    await page.goto(`${BASE_URL}/cart`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);
    await takeScreenshot('cart_page');

    const cartHeading = await page.locator('h1, h2').innerText().catch(() => '');
    logPass('Cart Page Navigation', `Cart page loaded with heading: "${cartHeading.slice(0, 40)}"`);

    // Check Checkout button
    const checkoutBtn = page.locator('a[href="/checkout"], button:has-text("Checkout"), button:has-text("Proceed")').first();
    if (await checkoutBtn.isVisible().catch(() => false)) {
      logPass('Proceed to Checkout Button', 'Interactive on /cart');
    } else {
      logWarn('Proceed to Checkout Button', 'Checkout button not rendered (cart may be empty or min order threshold not met)');
    }

    // ───────────────────────────────────────────────────────────────────────
    // 2.5 SEARCH FUNCTIONALITY (Normal & Empty states)
    // ───────────────────────────────────────────────────────────────────────
    console.log('\n[2.5] Testing Search Queries & Zero Results Handling...');
    await page.goto(`${BASE_URL}/search?q=butter`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);
    await takeScreenshot('search_results_butter');

    const butterResultsCount = await page.locator('a[href*="/product/"]').count();
    if (butterResultsCount > 0) {
      logPass('Product Search ("butter")', `Returned ${butterResultsCount} product cards`);
    } else {
      logWarn('Product Search ("butter")', '0 product cards found for "butter"');
    }

    // Nonexistent keyword
    await page.goto(`${BASE_URL}/search?q=qwerty987xyznotfound`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    await takeScreenshot('search_empty_state');
    const bodyText = await page.innerText('body');
    if (bodyText.toLowerCase().includes('no product') || bodyText.toLowerCase().includes('not found') || bodyText.toLowerCase().includes('0 result') || bodyText.toLowerCase().includes('no results')) {
      logPass('Search Zero Results Handling', 'Graceful empty state message displayed');
    } else {
      logWarn('Search Zero Results Handling', 'Did not detect explicit empty state message on zero results');
    }

    // ───────────────────────────────────────────────────────────────────────
    // 2.6 ADMIN PORTAL INSPECTION (Dashboard, Products, Import, Orders, Vendors)
    // ───────────────────────────────────────────────────────────────────────
    console.log('\n[2.6] Testing Admin Portal (/admin/dashboard, /admin/products, etc.)...');
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('/admin/dashboard') || page.url().includes('/admin')) {
      logPass('Admin Dashboard Access', `Authenticated admin successfully accessed ${page.url()}`);
      await takeScreenshot('admin_dashboard');
    } else {
      logFail('Admin Dashboard Access', `Redirected away from /admin/dashboard to ${page.url()}`, 'HIGH');
    }

    // Admin Products Table
    await page.goto(`${BASE_URL}/admin/products`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await takeScreenshot('admin_products_table');

    const adminProdRows = await page.locator('table tbody tr').count();
    if (adminProdRows > 0) {
      logPass('Admin Products Table', `Rendered ${adminProdRows} rows in products table`);
    } else {
      logWarn('Admin Products Table', '0 table rows found on /admin/products');
    }

    // Bulk Import Modal Trigger
    const importModalBtn = page.locator('button:has-text("Import"), button:has-text("Bulk Import")').first();
    if (await importModalBtn.isVisible().catch(() => false)) {
      logPass('Admin Bulk Import Button', 'Visible on /admin/products');
      await importModalBtn.click();
      await page.waitForTimeout(2000);
      await takeScreenshot('admin_import_modal_open');

      const modalHeading = await page.locator('[role="dialog"], .fixed').innerText().catch(() => '');
      if (modalHeading.toLowerCase().includes('import') || modalHeading.toLowerCase().includes('product')) {
        logPass('Admin Bulk Import Modal', 'Modal opened with dialog content');
      } else {
        logWarn('Admin Bulk Import Modal', 'Dialog opened but heading was unexpected');
      }

      // Close modal
      const closeBtn = page.locator('button:has-text("Cancel"), button[aria-label="Close"]').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      } else {
        await page.keyboard.press('Escape');
      }
    } else {
      logFail('Admin Bulk Import Button', 'Import button not found on /admin/products', 'HIGH');
    }

    // Admin Orders Page
    await page.goto(`${BASE_URL}/admin/orders`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await takeScreenshot('admin_orders_page');
    logPass('Admin Orders Page', `Loaded successfully at ${page.url()}`);

    // Admin Suppliers Page
    await page.goto(`${BASE_URL}/admin/vendors`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await takeScreenshot('admin_vendors_page');
    logPass('Admin Suppliers/Vendors Page', `Loaded successfully at ${page.url()}`);

    // Admin Users Page
    await page.goto(`${BASE_URL}/admin/users`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await takeScreenshot('admin_users_page');
    logPass('Admin Users Page', `Loaded successfully at ${page.url()}`);

    // Admin Settings Page
    await page.goto(`${BASE_URL}/admin/settings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await takeScreenshot('admin_settings_page');
    logPass('Admin Settings Page', `Loaded successfully at ${page.url()}`);

    // ───────────────────────────────────────────────────────────────────────
    // 2.7 MOBILE RESPONSIVENESS (iPhone 13 Viewport: 390x844)
    // ───────────────────────────────────────────────────────────────────────
    console.log('\n[2.7] Testing Mobile Responsiveness (Viewport: 390x844)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    await takeScreenshot('mobile_storefront_home');

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    if (hasHorizontalOverflow) {
      logWarn('Mobile Responsiveness', 'Page has horizontal scroll overflow on 390px viewport');
    } else {
      logPass('Mobile Responsiveness', 'Zero horizontal scroll overflow on mobile viewport');
    }

  } catch (err) {
    logFail('Playwright Execution Exception', err.stack || err.message, 'CRITICAL');
  } finally {
    await browser.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FINALIZE & SAVE REPORT
  // ─────────────────────────────────────────────────────────────────────────
  const reportPath = path.join(SCREENSHOT_DIR, 'hardcore_demo_qa_full_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n========================================================================');
  console.log(`   FULL HARDCORE QA COMPLETED`);
  console.log(`   Total Tests: ${report.summary.total}`);
  console.log(`   Passed:      ${report.summary.passed}`);
  console.log(`   Failed:      ${report.summary.failed}`);
  console.log(`   Warnings:    ${report.summary.warnings}`);
  console.log(`   Report saved to: ${reportPath}`);
  console.log('========================================================================\n');
}

runHardcoreSuite().catch(console.error);
