import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, '../artifacts_test');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function testProductOG() {
  try {
    // Find Chana Dal or any product with an image
    const res = await pool.query(`
      SELECT id, name, image_url, images 
      FROM products 
      WHERE is_active = true AND (name ILIKE '%chana%' OR name ILIKE '%dal%')
      LIMIT 5
    `);
    
    const targetProduct = res.rows.find(p => p.name === 'Chana Dal (1kg)') || res.rows[0];
    console.log('Testing with product:', targetProduct);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(`Fetching OG image for product: ${targetProduct.name} (${targetProduct.id})...`);
    const ogRes = await page.request.get(`http://localhost:3000/api/og/product/${targetProduct.id}?format=square`);
    console.log('Product OG status:', ogRes.status(), 'content-type:', ogRes.headers()['content-type']);
    
    if (ogRes.status() === 200) {
      const buffer = await ogRes.body();
      const outPath = path.join(outputDir, '6_product_og_square.png');
      fs.writeFileSync(outPath, buffer);
      console.log('SUCCESS! Saved:', outPath, 'size:', buffer.length, 'bytes');
    } else {
      const text = await ogRes.text();
      console.error('Failed to get OG image:', text);
    }

    await browser.close();
  } catch (err) {
    console.error('Product OG test error:', err);
  } finally {
    await pool.end();
  }
}

testProductOG();

