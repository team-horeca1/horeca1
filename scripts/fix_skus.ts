/**
 * Backfill vendor SKU prefixes + enforce global SKU uniqueness.
 *  - Rewrites every vendor product's `sku` to `{VendorCode}-{posSku}` (the format the
 *    app already composes for new products) so identical raw POS codes across vendors
 *    stop colliding.
 *  - Disambiguates any residual collisions with a numeric suffix.
 *  - Adds a partial UNIQUE index on lower(sku) (excludes tombstoned rows) so the DB —
 *    not just app code — guarantees uniqueness going forward.
 *
 * Idempotent: re-running leaves already-prefixed SKUs untouched.
 */
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolveVendorCode, formatVendorSku, parseVendorSku } from '../src/lib/sku';
dotenv.config();

interface Row {
  id: string;
  sku: string | null;
  vendor_sku: string | null;
  slug: string;
  vendor_code: string | null;
  vendor_slug: string | null;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  try {
    const rows = (await pool.query(`
      SELECT pr.id, pr.sku, pr.vendor_sku, pr.slug, v.vendor_code, v.slug AS vendor_slug
      FROM products pr LEFT JOIN vendors v ON v.id = pr.vendor_id
      ORDER BY pr.created_at ASC, pr.id ASC
    `)).rows as Row[];

    const used = new Set<string>(); // lower(composed sku) already taken
    let updated = 0, skippedNoCode = 0, skippedNoSku = 0, alreadyOk = 0, deduped = 0;

    for (const r of rows) {
      const posSkuRaw = (r.vendor_sku || r.sku || '').trim();
      if (!posSkuRaw) { skippedNoSku++; continue; }
      if (!r.vendor_slug && !r.vendor_code) { skippedNoCode++; continue; } // master/global product, no vendor

      const vendorCode = resolveVendorCode({ vendorCode: r.vendor_code, slug: r.vendor_slug || '' });

      // Already prefixed with this vendor's code? Keep it; just register + ensure vendorSku.
      let composed: string;
      let posSku: string;
      if ((r.sku || '').toUpperCase().startsWith(`${vendorCode.toUpperCase()}-`)) {
        composed = (r.sku as string).trim();
        posSku = parseVendorSku(composed, vendorCode).posSku;
      } else {
        posSku = posSkuRaw;
        composed = formatVendorSku(vendorCode, posSku);
      }

      // Disambiguate residual collisions (same vendor + same POS code in legacy data).
      const base = composed;
      let n = 1;
      while (used.has(composed.toLowerCase())) { n++; composed = `${base}-${n}`; deduped++; }
      used.add(composed.toLowerCase());

      const isAlready = composed === r.sku && posSku === r.vendor_sku;
      if (isAlready) { alreadyOk++; continue; }

      await pool.query('UPDATE products SET sku=$1, vendor_sku=$2 WHERE id=$3', [composed, posSku, r.id]);
      updated++;
    }

    console.log(`updated=${updated} alreadyOk=${alreadyOk} deduped=${deduped} skippedNoSku=${skippedNoSku} skippedNoVendor=${skippedNoCode}`);

    // Verify no duplicates remain (case-insensitive, excluding tombstones)
    const dup = await pool.query(`
      SELECT lower(sku) s, COUNT(*) n FROM products
      WHERE sku IS NOT NULL AND sku <> '' AND slug NOT LIKE '_deleted_%'
      GROUP BY lower(sku) HAVING COUNT(*) > 1
    `);
    console.log(`remaining duplicate SKUs (must be 0): ${dup.rows.length}`);
    if (dup.rows.length > 0) {
      for (const d of dup.rows) console.log(`  ${d.s} x${d.n}`);
      throw new Error('Refusing to add unique index while duplicates remain.');
    }

    // Drop legacy global index if present
    await pool.query('DROP INDEX IF EXISTS products_sku_unique_ci');

    // DB-level guarantee: partial unique index on (vendor_id, lower(sku)), excluding tombstoned rows.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS products_vendor_id_sku_unique_ci
      ON products (vendor_id, lower(sku))
      WHERE sku IS NOT NULL AND sku <> '' AND slug NOT LIKE '_deleted_%'
    `);
    console.log('Unique index products_vendor_id_sku_unique_ci ensured.');
  } catch (err) {
    console.error('ERROR:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
main();
