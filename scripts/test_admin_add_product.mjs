import { chromium } from '@playwright/test';
import fetch from 'node-fetch';
import path from 'path';

const BASE_URL = 'https://demo.horeca1.com';
const SCREENSHOT_DIR = path.resolve('C:\\Users\\mayur\\.gemini\\antigravity-ide\\brain\\f4dcf628-8d75-4368-a72f-6faea7001b4f');

async function testAddProduct() {
  console.log('Testing Admin "+ Add Product" functionality on live demo...');

  // 1. Authenticate admin
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
  const adminCookiesRaw = [...cookies, ...(loginRes.headers.raw()['set-cookie'] || [])];

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

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(playwrightCookies);
  await context.addInitScript(() => {
    localStorage.setItem('pincode_interacted', 'true');
    localStorage.setItem('user_pincode', '400001');
  });

  const page = await context.newPage();
  await page.goto(`${BASE_URL}/admin/products`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Click "+ Add Product" button
  const addProdBtn = page.locator('button:has-text("Add Product"), a:has-text("Add Product")').first();
  if (await addProdBtn.isVisible().catch(() => false)) {
    console.log('Found "+ Add Product" button. Clicking...');
    await addProdBtn.click();
    await page.waitForTimeout(2500);

    console.log('URL after clicking Add Product:', page.url());
    const addShot = path.join(SCREENSHOT_DIR, 'hardcore_admin_add_product_form.png');
    await page.screenshot({ path: addShot, fullPage: false });
    console.log('Screenshot captured:', addShot);

    // Inspect fields on the add product form/modal
    const formFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
        name: el.name || el.id || el.getAttribute('placeholder'),
        type: el.type || el.tagName.toLowerCase(),
        required: el.required,
      }));
      return inputs;
    });
    console.log(`Found ${formFields.length} form controls on Add Product form:`, formFields.slice(0, 10));
  } else {
    console.log('"+ Add Product" button not visible!');
  }

  await browser.close();
}

testAddProduct().catch(console.error);
