import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'C:\\Users\\mayur\\.gemini\\antigravity-ide\\brain\\f1f80642-a9e9-422a-a6da-09f16beda872';

async function run() {
  console.log('=== STARTING PLAYWRIGHT QA WITH LOCAL GOOGLE CHROME ===\n');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });

  const page = await context.newPage();

  try {
    // 1. LOGIN AS ADMIN
    console.log('1. Navigating to login...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('response', res => {
      if (res.status() >= 400) console.log('HTTP ERROR', res.status(), res.url());
    });

    console.log('Clicking "Have a password? Sign in with password"...');
    const havePasswordBtn = page.locator('button:has-text("Have a password"), button:has-text("Sign in with password")').first();
    await havePasswordBtn.waitFor({ state: 'visible', timeout: 10000 });
    await havePasswordBtn.click();

    console.log('Waiting for password input...');
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });

    console.log('Filling admin identifier and password...');
    const identifierInput = page.locator('input[placeholder*="Phone or email" i], input[type="text"]').first();
    await identifierInput.fill('admin@horeca1.com');
    await passwordInput.fill('admin123');

    console.log('Clicking Sign in button...');
    const submitBtn = page.locator('button:has-text("Sign in")').first();
    await submitBtn.click();

    console.log('Waiting for redirect away from /login...');
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 }).catch(async () => {
      console.log('Timeout waiting for redirect. Current URL:', page.url());
      const errBox = await page.locator('.bg-red-50').textContent().catch(() => null);
      if (errBox) console.log('Login Error Box:', errBox);
    });
    console.log('Current URL after login attempt:', page.url());

    // 2. ADMIN CUSTOMERS
    console.log('2. Navigating to /admin/customers...');
    await page.goto('http://localhost:3000/admin/customers', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const customersShot = path.join(SCREENSHOT_DIR, 'chrome_qa_admin_customers.png');
    await page.screenshot({ path: customersShot, fullPage: false });
    console.log('Saved screenshot:', customersShot);

    // Open "New Customer" Modal
    console.log('Clicking "New Customer" button...');
    const newCustomerBtn = page.locator('button:has-text("New Customer"), button:has-text("Add Customer")').first();
    if (await newCustomerBtn.isVisible()) {
      await newCustomerBtn.click();
      await page.waitForTimeout(1000);

      // Switch to Address tab
      console.log('Clicking Address tab in Customer Modal...');
      const addressTab = page.locator('button:has-text("Address")').first();
      if (await addressTab.isVisible()) {
        await addressTab.click();
        await page.waitForTimeout(800);
      }

      const modalShot = path.join(SCREENSHOT_DIR, 'chrome_qa_customer_address_modal.png');
      await page.screenshot({ path: modalShot, fullPage: false });
      console.log('Saved modal screenshot:', modalShot);

      // Close modal
      const closeBtn = page.locator('button:has-text("Cancel"), button[aria-label="Close"], svg.lucide-x').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // 3. CUSTOMER DETAIL PAGE WITH DELIVERY ADDRESS & OUTLETS
    console.log('3. Navigating to Customer Detail /admin/customers/f1907285-4ace-4c31-8a31-c7ddb1b8e199...');
    await page.goto('http://localhost:3000/admin/customers/f1907285-4ace-4c31-8a31-c7ddb1b8e199', { waitUntil: 'domcontentloaded' });
    await page.locator('text=Loading customer details...').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const businessTab = page.locator('button:has-text("Business Profile")').first();
    if (await businessTab.isVisible()) {
      await businessTab.click();
      await page.waitForTimeout(1500);
    }

    const customerDetailShot = path.join(SCREENSHOT_DIR, 'chrome_qa_customer_detail_delivery_outlets.png');
    await page.screenshot({ path: customerDetailShot, fullPage: false });
    console.log('Saved customer detail screenshot:', customerDetailShot);

    // 4. ADMIN ORDER DETAIL WITH DELIVERY TIMELINE & RETURNS
    console.log('4. Navigating to Admin Order Detail /admin/orders/c2043807-e371-4987-a3d9-48fd113dc4c3...');
    await page.goto('http://localhost:3000/admin/orders/c2043807-e371-4987-a3d9-48fd113dc4c3', { waitUntil: 'domcontentloaded' });
    await page.locator('text=Loading order...').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const orderDetailShot = path.join(SCREENSHOT_DIR, 'chrome_qa_admin_order_delivery_and_returns.png');
    await page.screenshot({ path: orderDetailShot, fullPage: false });
    console.log('Saved admin order screenshot:', orderDetailShot);

    // Check presence of Delivery Progress and Returns & Replacements
    const deliveryProgressVisible = await page.locator('text=Delivery Progress').isVisible();
    const returnsCardVisible = await page.locator('text=Returns & Replacements').isVisible();
    const downloadInvoiceBtn = page.locator('a:has-text("Download Tax Invoice")').first();
    const invoiceBtnVisible = await downloadInvoiceBtn.isVisible();
    const invoiceBtnText = invoiceBtnVisible ? await downloadInvoiceBtn.textContent() : 'N/A';

    console.log('QA Elements on Admin Order Detail:');
    console.log(' - Delivery Progress timeline visible:', deliveryProgressVisible);
    console.log(' - Returns & Replacements card visible:', returnsCardVisible);
    console.log(' - Download Tax Invoice button text:', invoiceBtnText?.trim());

    // 5. STOREFRONT ORDER DETAIL (with Customer Impersonation)
    console.log('5. Triggering customer impersonation via API for Manish Thombare...');
    const impersonateRes = await page.evaluate(async () => {
      const res = await fetch('/api/v1/admin/impersonate/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: '36bdb2d3-889e-484a-9aae-0aa35577e54f' }),
      });
      return { status: res.status, ok: res.ok, body: await res.json() };
    });
    console.log('Impersonate API Result:', JSON.stringify(impersonateRes));

    console.log('Navigating to Storefront Order /orders/c2043807-e371-4987-a3d9-48fd113dc4c3...');
    await page.goto('http://localhost:3000/orders/c2043807-e371-4987-a3d9-48fd113dc4c3', { waitUntil: 'domcontentloaded' });

    console.log('Waiting for "Loading order..." to disappear...');
    await page.locator('text=Loading order...').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const storefrontOrderShot = path.join(SCREENSHOT_DIR, 'chrome_qa_storefront_order.png');
    await page.screenshot({ path: storefrontOrderShot, fullPage: true });
    console.log('Saved storefront order screenshot:', storefrontOrderShot);

    const storefrontDeliveryVisible = await page.locator('text=Order progress, text=Delivery Progress').first().isVisible().catch(() => false);
    const storefrontReturnVisible = await page.locator('text=Horeca1 Return & Quality Guarantee').isVisible().catch(() => false);
    const storefrontInvoiceBtn = page.locator('a:has-text("Download Tax Invoice")').first();
    const storefrontInvoiceVisible = await storefrontInvoiceBtn.isVisible().catch(() => false);
    const storefrontInvoiceText = storefrontInvoiceVisible ? await storefrontInvoiceBtn.textContent() : 'N/A';

    console.log('Storefront Order Elements:');
    console.log(' - Order / Delivery Progress timeline visible:', storefrontDeliveryVisible);
    console.log(' - Return & Quality Guarantee banner visible:', storefrontReturnVisible);
    console.log(' - Download Tax Invoice button text:', storefrontInvoiceText?.trim());

    console.log('\n=== PLAYWRIGHT CHROME QA COMPLETED SUCCESSFULLY! ===');
  } catch (err) {
    console.error('QA Error:', err);
  } finally {
    await browser.close();
  }
}

run();
