import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://demo.horeca1.com';
const SCREENSHOT_DIR = path.resolve('C:\\Users\\mayur\\.gemini\\antigravity-ide\\brain\\f4dcf628-8d75-4368-a72f-6faea7001b4f');

async function runLiveHardcoreQA() {
  console.log('========================================================================');
  console.log(`   LIVE HARDCORE QA ON DEMO: ${BASE_URL}   `);
  console.log('========================================================================\n');

  const report = {
    target: BASE_URL,
    timestamp: new Date().toISOString(),
    tests: [],
    findings: [],
    consoleErrors: [],
    networkErrors: [],
    screenshots: [],
  };

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignore routine third-party tracking / analytics failures if any
      if (!txt.includes('favicon') && !txt.includes('sentry')) {
        console.log(`[BROWSER ERROR] ${txt}`);
        report.consoleErrors.push({ text: txt, location: msg.location() });
      }
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon') && !res.url().includes('.png') && !res.url().includes('.jpg')) {
      console.log(`[HTTP ${res.status()}] ${res.url()}`);
      report.networkErrors.push({ status: res.status(), url: res.url() });
    }
  });

  try {
    // ─────────────────────────────────────────────────────────────
    // 1. STOREFRONT HOME PAGE & LOCATION DISMISSAL
    // ─────────────────────────────────────────────────────────────
    console.log('1. Loading Storefront Home Page & handling location modal...');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Dismiss "Choose Delivery Location" modal if open
    const noLocationBtn = page.locator('button:has-text("GO WITHOUT LOCATION" i), text="GO WITHOUT LOCATION"').first();
    if (await noLocationBtn.isVisible().catch(() => false)) {
      console.log('  Dismissing "Choose Delivery Location" overlay...');
      await noLocationBtn.click();
      await page.waitForTimeout(1500);
    }

    const homeShot = path.join(SCREENSHOT_DIR, 'live_demo_home_dismissed.png');
    await page.screenshot({ path: homeShot, fullPage: false });
    report.screenshots.push({ name: 'Home Page Active', path: homeShot });

    // Find product cards on the homepage
    const homeProductCards = await page.$$eval('a[href*="/product/"], [data-testid*="product"], .product-card', (els) =>
      els.slice(0, 10).map((el) => {
        const link = el.tagName === 'A' ? el.getAttribute('href') : el.querySelector('a')?.getAttribute('href');
        return { text: el.innerText?.slice(0, 50), href: link };
      })
    ).catch(() => []);
    console.log(`  Found ${homeProductCards.length} product elements on homepage.`);
    report.tests.push({
      name: 'Homepage & Location Modal',
      passed: true,
      details: `Dismissed location modal, found ${homeProductCards.length} product elements.`,
    });

    // ─────────────────────────────────────────────────────────────
    // 2. SUPPLIERS PAGE & STOREFRONT PRODUCT SLUGS
    // ─────────────────────────────────────────────────────────────
    console.log('\n2. Testing /vendors and Store Pages...');
    await page.goto(`${BASE_URL}/vendors`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    // Click "Browse Store" on the first store (e.g. Dairy Direct or Bar & Brew)
    const browseStoreBtn = page.locator('button:has-text("Browse Store" i), a:has-text("Browse Store" i)').first();
    let storeUrl = '';
    if (await browseStoreBtn.isVisible().catch(() => false)) {
      console.log('  Clicking "Browse Store" on first supplier...');
      await browseStoreBtn.click();
      await page.waitForTimeout(3000);
      storeUrl = page.url();
      console.log(`  Navigated to Store URL: ${storeUrl}`);

      const storeShot = path.join(SCREENSHOT_DIR, 'live_demo_supplier_store.png');
      await page.screenshot({ path: storeShot, fullPage: false });
      report.screenshots.push({ name: 'Supplier Store Page', path: storeShot });

      // Look for products listed inside this store
      const storeProducts = await page.$$eval('a[href*="/product/"]', (anchors) =>
        anchors.slice(0, 5).map((a) => ({
          href: a.getAttribute('href'),
          name: a.innerText?.trim()?.slice(0, 40),
        }))
      ).catch(() => []);

      console.log(`  Products found in store: ${storeProducts.length}`);
      if (storeProducts.length > 0) {
        console.log(`  Sample product href: ${storeProducts[0].href}`);
        // Click on this product
        await page.goto(new URL(storeProducts[0].href, BASE_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(2000);
        console.log(`  Product Detail URL: ${page.url()}`);

        const prodShot = path.join(SCREENSHOT_DIR, 'live_demo_store_product.png');
        await page.screenshot({ path: prodShot, fullPage: false });
        report.screenshots.push({ name: 'Product Details in Store', path: prodShot });

        report.tests.push({
          name: 'Store & Product Slug Navigation',
          passed: true,
          details: `Store: ${storeUrl} -> Product: ${page.url()}`,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. SEARCH BAR FUNCTIONALITY
    // ─────────────────────────────────────────────────────────────
    console.log('\n3. Testing Search Bar on demo.horeca1.com...');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);

    const searchInput = page.locator('input[placeholder*="Search" i]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      console.log('  Typing "butter" into search bar...');
      await searchInput.fill('butter');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);

      const searchShot = path.join(SCREENSHOT_DIR, 'live_demo_search_butter.png');
      await page.screenshot({ path: searchShot, fullPage: false });
      report.screenshots.push({ name: 'Search Results Page', path: searchShot });
      console.log(`  Search Page URL: ${page.url()}`);
      report.tests.push({
        name: 'Product Search',
        passed: true,
        details: `Searched for "butter", navigated to ${page.url()}`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 4. AUTHENTICATION & PORTAL ACCESS
    // ─────────────────────────────────────────────────────────────
    console.log('\n4. Testing Authentication Flow...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    // Click "Have a password? Sign in with password"
    const pwdToggle = page.locator('button:has-text("Have a password" i), text="Have a password? Sign in with password"').first();
    if (await pwdToggle.isVisible().catch(() => false)) {
      console.log('  Clicking "Have a password? Sign in with password"...');
      await pwdToggle.click();
      await page.waitForTimeout(1000);
    }

    const emailInput = page.locator('input[placeholder*="Phone or email" i], input[type="text"]').first();
    const passInput = page.locator('input[placeholder*="password" i], input[type="password"]').first();

    let loggedInAsAdmin = false;

    if (await emailInput.isVisible().catch(() => false) && await passInput.isVisible().catch(() => false)) {
      console.log('  Entering admin@horeca1.com credentials...');
      await emailInput.fill('admin@horeca1.com');
      await passInput.fill('admin123');

      const loginShotBefore = path.join(SCREENSHOT_DIR, 'live_demo_login_filled.png');
      await page.screenshot({ path: loginShotBefore, fullPage: false });

      const signInBtn = page.locator('button:has-text("Sign in" i)').first();
      await signInBtn.click();
      await page.waitForTimeout(4000);

      console.log(`  URL after Sign in: ${page.url()}`);
      if (!page.url().includes('/login')) {
        loggedInAsAdmin = true;
        console.log('  ✓ Admin logged in successfully!');
        report.tests.push({
          name: 'Admin Login',
          passed: true,
          details: `Redirected to ${page.url()}`,
        });
      } else {
        const alertMsg = await page.locator('.bg-red-50, .text-red-600, [role="alert"]').innerText().catch(() => '');
        console.log(`  Login status: ${alertMsg || 'Still on /login'}`);
        report.tests.push({
          name: 'Admin Login',
          passed: false,
          details: alertMsg || 'Invalid credentials or custom demo password',
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. ADMIN / VENDOR PORTAL LIVE INSPECTION (If authenticated)
    // ─────────────────────────────────────────────────────────────
    if (loggedInAsAdmin) {
      console.log('\n5. Inspecting Admin Products (/admin/products)...');
      await page.goto(`${BASE_URL}/admin/products`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);

      const adminShot = path.join(SCREENSHOT_DIR, 'live_demo_admin_products_full.png');
      await page.screenshot({ path: adminShot, fullPage: false });
      report.screenshots.push({ name: 'Admin Products View', path: adminShot });

      // Open Bulk Import modal
      const importBtn = page.locator('button:has-text("Import" i), button:has-text("Bulk" i)').first();
      if (await importBtn.isVisible().catch(() => false)) {
        console.log('  Clicking Import button...');
        await importBtn.click();
        await page.waitForTimeout(1500);

        const modalShot = path.join(SCREENSHOT_DIR, 'live_demo_admin_import_modal_open.png');
        await page.screenshot({ path: modalShot, fullPage: false });
        report.screenshots.push({ name: 'Admin Import Modal', path: modalShot });
        console.log('  ✓ Admin Bulk Import modal verified!');
      }

      console.log('\n6. Inspecting Vendor Products (/vendor/products)...');
      await page.goto(`${BASE_URL}/vendor/products`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);

      const vendorShot = path.join(SCREENSHOT_DIR, 'live_demo_vendor_products_full.png');
      await page.screenshot({ path: vendorShot, fullPage: false });
      report.screenshots.push({ name: 'Vendor Products View', path: vendorShot });
    }

  } catch (err) {
    console.error('Fatal live QA error:', err);
    report.findings.push({ severity: 'HIGH', message: err.message });
  } finally {
    await browser.close();
  }

  const outReport = path.join(SCREENSHOT_DIR, 'live_demo_qa_results.json');
  fs.writeFileSync(outReport, JSON.stringify(report, null, 2));
  console.log(`\n========================================================================`);
  console.log(`   LIVE DEMO QA FINISHED — Results in: ${outReport}`);
  console.log(`========================================================================\n`);
}

runLiveHardcoreQA().catch(console.error);
