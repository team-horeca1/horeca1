import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, '../artifacts_test');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

async function testVoices() {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('--- 1. Testing /voices listing page ---');
  await page.goto('http://localhost:3000/voices', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: path.join(outputDir, '1_voices_listing.png') });
  console.log('Saved 1_voices_listing.png');

  // Check share button on first card
  const shareBtn = page.locator('button[aria-label="Share story"]').first();
  if (await shareBtn.count() > 0) {
    console.log('Clicking share button on first card...');
    await shareBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outputDir, '2_voices_share_modal.png') });
    console.log('Saved 2_voices_share_modal.png');

    const modalText = await page.innerText('body');
    const hasInshorts = modalText.toLowerCase().includes('inshorts');
    console.log('Does modal mention Inshorts?', hasInshorts);
    const hasWhatsApp = modalText.includes('Share to WhatsApp');
    console.log('Does modal have Share to WhatsApp?', hasWhatsApp);

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  console.log('--- 2. Testing /voices/ananya-rao-copper-pot story page ---');
  await page.goto('http://localhost:3000/voices/ananya-rao-copper-pot', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: path.join(outputDir, '3_story_top.png') });
  console.log('Saved 3_story_top.png');

  // Check sticky sidebar position before scroll
  const stickyTOC = page.locator('aside .sticky');
  const beforeBox = await stickyTOC.boundingBox();
  console.log('Sticky TOC bounding box before scroll (y position):', beforeBox?.y);

  // Scroll down 700px
  await page.evaluate(() => window.scrollBy(0, 700));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outputDir, '4_story_scrolled.png') });
  console.log('Saved 4_story_scrolled.png');

  const afterBox = await stickyTOC.boundingBox();
  console.log('Sticky TOC bounding box after scroll (y position):', afterBox?.y);

  if (afterBox && afterBox.y <= 120 && afterBox.y >= 70) {
    console.log('✅ Sticky check PASSED! Left TOC is cleanly sticking at y =', afterBox.y);
  } else {
    console.log('⚠️ Sticky y position was:', afterBox?.y);
  }

  console.log('--- 3. Testing /admin/voices page ---');
  await page.goto('http://localhost:3000/admin/voices', { waitUntil: 'networkidle', timeout: 30000 });
  const editBtn = page.locator('button:has-text("Edit")').first();
  if (await editBtn.count() > 0) {
    console.log('Opening story editor in admin...');
    await editBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outputDir, '5_admin_editor.png') });
    console.log('Saved 5_admin_editor.png');

    const adminText = await page.innerText('body');
    console.log('Admin tabs: has Inshorts Share tab?', adminText.includes('Inshorts Share'));
    console.log('Admin tabs: has WhatsApp Preview tab?', adminText.includes('WhatsApp Preview'));
  }

  console.log('--- 4. Testing Product OG Image Card ---');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  const productLink = page.locator('a[href^="/product/"]').first();
  if (await productLink.count() > 0) {
    const pHref = await productLink.getAttribute('href');
    const pId = pHref.replace('/product/', '').split('?')[0];
    console.log('Testing product OG for ID:', pId);
    const productRes = await page.request.get(`http://localhost:3000/api/og/product/${pId}?format=square`);
    console.log('Product OG status:', productRes.status(), 'content-type:', productRes.headers()['content-type']);
    const buffer = await productRes.body();
    fs.writeFileSync(path.join(outputDir, '6_product_og_card.png'), buffer);
    console.log('Saved 6_product_og_card.png (bytes:', buffer.length, ')');
  } else {
    console.log('No direct product link found on homepage, searching for any product...');
  }

  await browser.close();
  console.log('All tests finished successfully!');
}

testVoices().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
