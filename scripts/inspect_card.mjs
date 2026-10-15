import { chromium } from '@playwright/test';

async function check() {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('pincode_interacted', 'true');
    localStorage.setItem('user_pincode', '400001');
  });
  const page = await context.newPage();
  await page.goto('https://demo.horeca1.com/vendor/68ed055d-46ac-436c-9927-c95e69bf8cea', { waitUntil: 'networkidle' });

  const info = await page.evaluate(() => {
    const card = document.querySelector('[data-product-id]');
    if (!card) return 'no card with data-product-id';
    const imgs = Array.from(card.querySelectorAll('img')).map(img => ({
      src: img.src,
      currentSrc: img.currentSrc,
      className: img.className,
      clientWidth: img.clientWidth,
      clientHeight: img.clientHeight,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      visible: img.offsetParent !== null,
    }));
    return {
      cardHtml: card.innerHTML.slice(0, 800),
      imgs,
    };
  });

  console.log('Result:', JSON.stringify(info, null, 2));
  await browser.close();
}

check().catch(console.error);
