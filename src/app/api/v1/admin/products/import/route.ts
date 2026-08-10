import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminOnly } from '@/middleware/rbac';
import { Errors, errorResponse, friendlyErrorMessage } from '@/middleware/errorHandler';
import { parseProductImport, type ParsedProductRow } from '@/modules/import-export/excel.service';
import { requirePermission } from '@/lib/permissions/engine';
import {
  assertLeafCategory,
  findOrCreateMaster,
  resolveImportCategoryIds,
  syncImportProductCategories,
  composeVendorListingSku,
} from '@/modules/catalog/catalog.service';
import { syncProductToBrand, findOrCreateBrandByName } from '@/modules/brand/brand.service';
import {
  partitionImportRows,
  buildImportErrorReportCsv,
  type ImportErrorRowData,
} from '@/modules/import-export/import-commit';
import {
  enrichImportMetadata,
  mergeMetadata,
  normalizedVegForDb,
  resolveRowImageUrl,
  validateImportCategoryColumns,
} from '@/modules/import-export/import-helpers';
import { Prisma } from '@prisma/client';
import { getPrimaryOutletIdForVendor, ensureInventoryForAllOutlets } from '@/lib/inventoryOutlet';
import { totalStockQty } from '@/lib/inventoryHelpers';

// ── Preview mode: parse file, match SKUs, return diff without committing ──
// ── Commit mode: actually create/update products with backup ──

interface PreviewItem {
  row: number;
  action: 'create' | 'update' | 'skip';
  name: string;
  sku?: string;
  hsn?: string;
  brand?: string;
  unit?: string;
  category?: string;
  basePrice: number;
  grossRate: number;
  taxPercent: number;
  promoPrice?: number | null;
  stock?: number;
  imageUrl?: string | null;
  imageName?: string | null;
  bulkSlabCount: number;
  bulkSlabs: Array<{
    minQty: number;
    price: number;
    grossRate: number;
    promoPrice?: number | null;
    promoGrossRate?: number | null;
  }>;
  hasPromo: boolean;
  existing?: {
    id: string;
    name: string;
    basePrice: number;
    taxPercent: number;
    stock: number;
    brand?: string;
    sku?: string;
  };
  skipReason?: string;
  parentCategory?: string;
  subCategory?: string;
  additionalSubCategories?: string[];
  vegNonVeg?: string;
  storageType?: string;
  moq?: number;
  aliasName?: string;
  upc?: string;
  metadata?: any;
}

interface PreviewResponse {
  totalRows: number;
  creates: number;
  updates: number;
  skips: number;
  errors: { row: number; field?: string; message: string }[];
  items: PreviewItem[];
}

interface CommitResponse {
  blocked: boolean;
  totalRows: number;
  validRows: number;
  created: number;
  updated: number;
  imported: number;
  errors: { row: number; field?: string; message: string }[];
  errorReport?: string;
  backupId: string;
}

export const POST = adminOnly(async (req: NextRequest, ctx) => {
  try {
    requirePermission(ctx, 'products.create');
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) throw Errors.notFound('File');

    const vendorId = formData.get('vendorId') as string | null || null;
    const mode = (formData.get('mode') as string) || 'preview'; // 'preview' | 'commit'

    // Verify vendor exists (if provided)
    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
      if (!vendor) throw Errors.notFound('Vendor');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors: parseErrors } = parseProductImport(buffer);

    if (rows.length === 0 && parseErrors.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalRows: 0, creates: 0, updates: 0, skips: 0,
          errors: [{ row: 0, message: 'No valid rows found in file' }],
          items: [],
        } satisfies PreviewResponse,
      });
    }

    // Resolve category names → IDs
    const allCategories = await prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
    });
    const catMap = new Map<string, string>();
    for (const c of allCategories) {
      catMap.set(c.name.toLowerCase(), c.id);
      catMap.set(c.slug.toLowerCase(), c.id);
    }

    // Fetch existing products for duplicate detection (by SKU or name)
    // When vendor selected: match within that vendor
    // When no vendor (catalog): match across ALL products to detect duplicates
    const vendorFilter: Record<string, unknown> = vendorId ? { vendorId } : {};

    // 1. Match by SKU
    const skus = rows.filter(r => r.sku).map(r => r.sku!);
    const existingProducts = skus.length > 0
      ? await prisma.product.findMany({
          where: {
            OR: [
              { sku: { in: skus } },
              ...(vendorId ? [{ vendorSku: { in: skus } }] : []),
            ],
            ...vendorFilter,
          },
          include: {
            inventories: { select: { qtyAvailable: true } },
            priceSlabs: { orderBy: { sortOrder: 'asc' } },
          },
        })
      : [];
    const existingBySku = new Map<string, typeof existingProducts[0]>();
    for (const p of existingProducts) {
      if (p.sku) existingBySku.set(p.sku.toLowerCase(), p);
      if (p.vendorSku) existingBySku.set(p.vendorSku.toLowerCase(), p);
    }

    // 2. Match by name (fallback for rows without SKU or no SKU match)
    const names = rows.map(r => r.name);
    const existingByName = new Map<string, typeof existingProducts[0]>();
    const nameProducts = await prisma.product.findMany({
      where: { name: { in: names, mode: 'insensitive' }, ...vendorFilter },
      include: {
        inventories: { select: { qtyAvailable: true } },
        priceSlabs: { orderBy: { sortOrder: 'asc' } },
      },
    });
    for (const p of nameProducts) {
      existingByName.set(p.name.toLowerCase(), p);
    }

    // Helper: find existing product by SKU first, then by name
    function findExisting(row: { sku?: string; name: string }) {
      if (row.sku) {
        const match = existingBySku.get(row.sku.toLowerCase());
        if (match) return match;
      }
      return existingByName.get(row.name.toLowerCase());
    }

    // Products created earlier in THIS commit run, so a file that lists the same
    // item twice updates the freshly-created product instead of inserting a
    // duplicate (the snapshot maps above predate any writes in this run).
    const createdThisRun = new Map<string, { id: string; sku: string | null; vendorSku?: string | null; categoryId: string | null; slug: string }>();
    function findCreated(row: { sku?: string; name: string }) {
      if (row.sku) {
        const bySku = createdThisRun.get('sku:' + row.sku.toLowerCase());
        if (bySku) return bySku;
      }
      return createdThisRun.get('name:' + row.name.toLowerCase());
    }
    function registerCreated(p: { id: string; sku: string | null; vendorSku?: string | null; name: string; categoryId: string | null; slug: string }) {
      const ref = { id: p.id, sku: p.sku, vendorSku: p.vendorSku, categoryId: p.categoryId, slug: p.slug };
      if (p.sku) createdThisRun.set('sku:' + p.sku.toLowerCase(), ref);
      if (p.vendorSku) createdThisRun.set('sku:' + p.vendorSku.toLowerCase(), ref);
      createdThisRun.set('name:' + p.name.toLowerCase(), ref);
    }

    // ── PREVIEW MODE ──
    if (mode === 'preview') {
      const items: PreviewItem[] = [];
      let creates = 0, updates = 0;
      const skips = 0;

      rows.forEach((r, idx) => {
        const rowNum = idx + 2;
        const existing = findExisting(r);

        // Surface the actual slab tier prices so the UI can show them
        // inline. The taxable + gross rates are kept distinct so the UI
        // doesn't have to recompute.
        const slabPreview = r.bulkSlabs.map((s) => ({
          minQty: s.minQty,
          price: s.taxableRate,
          grossRate: s.grossRate,
          promoPrice: s.promoTaxableRate ?? null,
          promoGrossRate: s.promoGrossRate ?? null,
        }));

        if (existing) {
          updates++;
          items.push({
            row: rowNum,
            action: 'update',
            name: r.name,
            sku: r.sku,
            hsn: r.hsn,
            brand: r.brand,
            unit: r.unit,
            category: r.category,
            basePrice: r.basePrice,
            grossRate: r.grossRate,
            taxPercent: r.taxPercent,
            promoPrice: r.promoPrice ?? null,
            stock: r.stock,
            imageUrl: r.imageUrl ?? null,
            imageName: r.imageName ?? null,
            bulkSlabCount: r.bulkSlabs.length,
            bulkSlabs: slabPreview,
            hasPromo: !!r.promoPrice,
            existing: {
              id: existing.id,
              name: existing.name,
              basePrice: Number(existing.basePrice),
              taxPercent: Number(existing.taxPercent),
              stock: totalStockQty(existing.inventories),
              brand: existing.brand || undefined,
              sku: existing.sku || undefined,
            },
            parentCategory: r.parentCategory,
            subCategory: r.subCategory,
            additionalSubCategories: r.additionalSubCategories,
            vegNonVeg: r.vegNonVeg,
            storageType: r.storageType,
            moq: r.moq,
            aliasName: r.aliasName,
            upc: r.upc,
            metadata: r.metadata,
          });
        } else {
          creates++;
          items.push({
            row: rowNum,
            action: 'create',
            name: r.name,
            sku: r.sku,
            hsn: r.hsn,
            brand: r.brand,
            unit: r.unit,
            category: r.category,
            basePrice: r.basePrice,
            grossRate: r.grossRate,
            taxPercent: r.taxPercent,
            promoPrice: r.promoPrice ?? null,
            stock: r.stock,
            imageUrl: r.imageUrl ?? null,
            imageName: r.imageName ?? null,
            bulkSlabCount: r.bulkSlabs.length,
            bulkSlabs: slabPreview,
            hasPromo: !!r.promoPrice,
            parentCategory: r.parentCategory,
            subCategory: r.subCategory,
            additionalSubCategories: r.additionalSubCategories,
            vegNonVeg: r.vegNonVeg,
            storageType: r.storageType,
            moq: r.moq,
            aliasName: r.aliasName,
            upc: r.upc,
            metadata: r.metadata,
          });
        }
      });

      return NextResponse.json({
        success: true,
        data: {
          totalRows: rows.length,
          creates,
          updates,
          skips,
          errors: parseErrors,
          items,
        } satisfies PreviewResponse,
      });
    }

    // ── COMMIT MODE ──
    let vendorCode: string | null = null;
    if (vendorId) {
      const vendorRecord = await prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { vendorCode: true },
      });
      vendorCode = vendorRecord?.vendorCode ?? null;
    }

    // Step 1: Create backup of existing products that will be updated
    const backupId = `import_${Date.now()}_${(vendorId || 'catalog').slice(0, 8)}`;
    const backupSource = Array.from(
      new Map([...existingProducts, ...nameProducts].map((p) => [p.id, p])).values()
    );
    const productsToBackup = backupSource.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      hsn: p.hsn,
      brand: p.brand,
      unit: p.unit,
      basePrice: Number(p.basePrice),
      taxPercent: Number(p.taxPercent),
      promoPrice: p.promoPrice ? Number(p.promoPrice) : null,
      stock: totalStockQty(p.inventories),
      priceSlabs: p.priceSlabs.map(s => ({
        minQty: s.minQty,
        price: Number(s.price),
        promoPrice: s.promoPrice ? Number(s.promoPrice) : null,
      })),
    }));

    const force = (formData.get('force') as string | null) === 'true';

    // Store backup as JSON in metadata (could use Redis/DB for production scale)
    // For now, we return it to the client for undo capability
    let created = 0, updated = 0;
    const commitErrors: { row: number; field?: string; message: string }[] = [...parseErrors];

    // Optional: get skip list from client (rows to skip)
    const skipRowsStr = formData.get('skipRows') as string | null;
    const skipRows = new Set(skipRowsStr ? JSON.parse(skipRowsStr) as number[] : []);

    // Optional: get per-row inline edits from client (admin tweaked values
    // in the review table before clicking Confirm). Shape:
    //   { [rowNum]: { name?, sku?, category?, basePrice?, taxPercent?, stock? } }
    // Whitelisted at apply-time so a forged extra key can't reach Prisma.
    const editsStr = formData.get('edits') as string | null;
    type EditSlab = { minQty: number; grossRate: number; promoGrossRate?: number | null };
    type EditRow = Partial<{
      name: string; sku: string; hsn: string; brand: string; unit: string; category: string;
      basePrice: number; taxPercent: number; promoPrice: number; stock: number; imageUrl: string; imageName: string;
      slabs: EditSlab[];
      parentCategory: string; subCategory: string; additionalSubCategories: string[];
      vegNonVeg: string; storageType: string; moq: number; aliasName: string; upc: string;
      account: string; accountCode: string; taxable: boolean; exemptionReason: string; taxabilityType: string;
      productType: string; platformCommission: number;
      inventoryAccount: string; inventoryAccountCode: string; valuationMethod: string; trackInventory: boolean;
      reorderPoint: number; openingStock: number; packageWeight: number; packageLength: number;
      packageWidth: number; packageHeight: number; dimensionUnit: string; weightUnit: string;
      ean: string; isbn: string; itemType: string; source: string; referenceId: string;
      lastSync: string; sellable: boolean; purchasable: boolean; variantMapping: string;
      itemStatus: string; activeOnlineStore: boolean;
    }>;
    let editsMap: Record<number, EditRow> = {};
    if (editsStr) {
      try {
        const parsed = JSON.parse(editsStr) as Record<string, EditRow>;
        // Normalize keys to numbers + whitelist fields.
        for (const [k, v] of Object.entries(parsed)) {
          const n = Number(k);
          if (!Number.isInteger(n)) continue;
          const safe: EditRow = {};
          if (typeof v.name === 'string')      safe.name = v.name.trim();
          if (typeof v.sku === 'string')       safe.sku = v.sku.trim();
          if (typeof v.hsn === 'string')       safe.hsn = v.hsn.trim();
          if (typeof v.brand === 'string')     safe.brand = v.brand.trim();
          if (typeof v.unit === 'string')      safe.unit = v.unit.trim();
          if (typeof v.category === 'string')  safe.category = v.category.trim();
          if (typeof v.basePrice === 'number'  && v.basePrice > 0) safe.basePrice = v.basePrice;
          if (typeof v.taxPercent === 'number' && v.taxPercent >= 0 && v.taxPercent <= 100) safe.taxPercent = v.taxPercent;
          if (typeof v.promoPrice === 'number' && v.promoPrice > 0) safe.promoPrice = v.promoPrice;
          if (typeof v.stock === 'number'      && v.stock >= 0 && Number.isInteger(v.stock)) safe.stock = v.stock;
          if (typeof v.imageUrl === 'string')  safe.imageUrl = v.imageUrl.trim();
          if (typeof v.imageName === 'string') safe.imageName = v.imageName.trim();
          if (Array.isArray(v.slabs)) {
            safe.slabs = v.slabs
              .filter((s) => s && typeof s.minQty === 'number' && s.minQty > 0 && typeof s.grossRate === 'number' && s.grossRate > 0)
              .slice(0, 3)
              .map((s) => ({
                minQty: Math.floor(s.minQty),
                grossRate: s.grossRate,
                promoGrossRate: typeof s.promoGrossRate === 'number' && s.promoGrossRate > 0 ? s.promoGrossRate : null,
              }));
          }
          if (typeof v.parentCategory === 'string') safe.parentCategory = v.parentCategory.trim();
          if (typeof v.subCategory === 'string') safe.subCategory = v.subCategory.trim();
          if (Array.isArray(v.additionalSubCategories)) {
            safe.additionalSubCategories = v.additionalSubCategories.map(s => String(s).trim()).filter(Boolean);
          }
          if (typeof v.vegNonVeg === 'string') safe.vegNonVeg = v.vegNonVeg.trim();
          if (typeof v.storageType === 'string') safe.storageType = v.storageType.trim();
          if (typeof v.moq === 'number' && v.moq > 0) safe.moq = v.moq;
          if (typeof v.aliasName === 'string') safe.aliasName = v.aliasName.trim();
          if (typeof v.upc === 'string') safe.upc = v.upc.trim();

          if (typeof v.account === 'string') safe.account = v.account.trim();
          if (typeof v.accountCode === 'string') safe.accountCode = v.accountCode.trim();
          if (v.taxable !== undefined) safe.taxable = Boolean(v.taxable);
          if (typeof v.exemptionReason === 'string') safe.exemptionReason = v.exemptionReason.trim();
          if (typeof v.taxabilityType === 'string') safe.taxabilityType = v.taxabilityType.trim();
          if (typeof v.productType === 'string') safe.productType = v.productType.trim();
          if (typeof v.platformCommission === 'number') safe.platformCommission = v.platformCommission;

          if (typeof v.inventoryAccount === 'string') safe.inventoryAccount = v.inventoryAccount.trim();
          if (typeof v.inventoryAccountCode === 'string') safe.inventoryAccountCode = v.inventoryAccountCode.trim();
          if (typeof v.valuationMethod === 'string') safe.valuationMethod = v.valuationMethod.trim();
          if (v.trackInventory !== undefined) safe.trackInventory = Boolean(v.trackInventory);
          if (typeof v.reorderPoint === 'number') safe.reorderPoint = v.reorderPoint;
          if (typeof v.openingStock === 'number') safe.openingStock = v.openingStock;

          if (typeof v.packageWeight === 'number') safe.packageWeight = v.packageWeight;
          if (typeof v.packageLength === 'number') safe.packageLength = v.packageLength;
          if (typeof v.packageWidth === 'number') safe.packageWidth = v.packageWidth;
          if (typeof v.packageHeight === 'number') safe.packageHeight = v.packageHeight;
          if (typeof v.dimensionUnit === 'string') safe.dimensionUnit = v.dimensionUnit.trim();
          if (typeof v.weightUnit === 'string') safe.weightUnit = v.weightUnit.trim();

          if (typeof v.ean === 'string') safe.ean = v.ean.trim();
          if (typeof v.isbn === 'string') safe.isbn = v.isbn.trim();

          if (typeof v.itemType === 'string') safe.itemType = v.itemType.trim();
          if (typeof v.source === 'string') safe.source = v.source.trim();
          if (typeof v.referenceId === 'string') safe.referenceId = v.referenceId.trim();
          if (typeof v.lastSync === 'string') safe.lastSync = v.lastSync.trim();
          if (v.sellable !== undefined) safe.sellable = Boolean(v.sellable);
          if (v.purchasable !== undefined) safe.purchasable = Boolean(v.purchasable);
          if (typeof v.variantMapping === 'string') safe.variantMapping = v.variantMapping.trim();
          if (typeof v.itemStatus === 'string') safe.itemStatus = v.itemStatus.trim();
          if (v.activeOnlineStore !== undefined) safe.activeOnlineStore = Boolean(v.activeOnlineStore);

          editsMap[n] = safe;
        }
      } catch { editsMap = {}; }
    }

    // Fetch all slugs for duplicate detection and unique slug generation
    const usedSlugs = new Set(
      (await prisma.product.findMany({
        where: vendorId ? { vendorId } : { vendorId: null },
        select: { slug: true }
      })).map(p => p.slug)
    );
    function toSlug(name: string): string {
      return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    function uniqueSlug(name: string): string {
      const base = toSlug(name) || 'product';
      let candidate = base;
      let n = 2;
      while (usedSlugs.has(candidate)) {
        candidate = `${base}-${n++}`;
      }
      usedSlugs.add(candidate);
      return candidate;
    }

    const rowData = new Map<number, ImportErrorRowData>(
      rows.map((r, idx) => [idx + 2, { name: r.name, sku: r.sku, hsn: r.hsn, brand: r.brand, netRate: r.basePrice }])
    );

    if (parseErrors.length > 0 && !force) {
      const blockedErrorReport = buildImportErrorReportCsv(rowData, commitErrors);
      return NextResponse.json({
        success: true,
        data: {
          blocked: true,
          totalRows: rows.length,
          validRows: 0,
          created: 0,
          updated: 0,
          imported: 0,
          errors: commitErrors,
          errorReport: blockedErrorReport,
          backupId,
          backup: productsToBackup,
        } satisfies CommitResponse & { backup: typeof productsToBackup },
      });
    }

    try {
      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < rows.length; i++) {
          const parsedRow = rows[i];
          const rowNum = i + 2;

          if (skipRows.has(rowNum)) continue;

      // Merge inline edits OVER the parsed row. The admin's keystrokes
      // win for any field they touched in the review table.
      const e = editsMap[rowNum] ?? {};
      const r: ParsedProductRow = {
        ...parsedRow,
        ...(e.name      !== undefined ? { name: e.name } : {}),
        ...(e.sku       !== undefined ? { sku: e.sku } : {}),
        ...(e.hsn       !== undefined ? { hsn: e.hsn } : {}),
        ...(e.brand     !== undefined ? { brand: e.brand } : {}),
        ...(e.unit      !== undefined ? { unit: e.unit } : {}),
        ...(e.category  !== undefined ? { category: e.category } : {}),
        ...(e.basePrice !== undefined ? { basePrice: e.basePrice } : {}),
        ...(e.taxPercent !== undefined ? { taxPercent: e.taxPercent } : {}),
        ...(e.promoPrice !== undefined ? { promoPrice: e.promoPrice } : {}),
        ...(e.stock     !== undefined ? { stock: e.stock } : {}),
        ...(e.imageUrl  !== undefined ? { imageUrl: e.imageUrl } : {}),
        ...(e.imageName !== undefined ? { imageName: e.imageName } : {}),
        ...(e.parentCategory !== undefined ? { parentCategory: e.parentCategory } : {}),
        ...(e.subCategory !== undefined ? { subCategory: e.subCategory } : {}),
        ...(e.additionalSubCategories !== undefined ? { additionalSubCategories: e.additionalSubCategories } : {}),
        ...(e.vegNonVeg !== undefined ? { vegNonVeg: e.vegNonVeg } : {}),
        ...(e.storageType !== undefined ? { storageType: e.storageType } : {}),
        ...(e.moq !== undefined ? { moq: e.moq } : {}),
        ...(e.aliasName !== undefined ? { aliasName: e.aliasName } : {}),
        ...(e.upc !== undefined ? { upc: e.upc } : {}),
      };

      // Restructure metadata edits into r.metadata
      const meta = { ...(r.metadata || {}) };
      meta.accounting = {
        ...(meta.accounting || {}),
        ...(e.account !== undefined ? { account: e.account } : {}),
        ...(e.accountCode !== undefined ? { accountCode: e.accountCode } : {}),
        ...(e.taxable !== undefined ? { taxable: e.taxable } : {}),
        ...(e.exemptionReason !== undefined ? { exemptionReason: e.exemptionReason } : {}),
        ...(e.taxabilityType !== undefined ? { taxabilityType: e.taxabilityType } : {}),
        ...(e.platformCommission !== undefined ? { platformCommission: e.platformCommission } : {}),
      };
      meta.inventory = {
        ...(meta.inventory || {}),
        ...(e.inventoryAccount !== undefined ? { inventoryAccount: e.inventoryAccount } : {}),
        ...(e.inventoryAccountCode !== undefined ? { inventoryAccountCode: e.inventoryAccountCode } : {}),
        ...(e.valuationMethod !== undefined ? { valuationMethod: e.valuationMethod } : {}),
        ...(e.trackInventory !== undefined ? { trackInventory: e.trackInventory } : {}),
        ...(e.reorderPoint !== undefined ? { reorderPoint: e.reorderPoint } : {}),
        ...(e.openingStock !== undefined ? { openingStock: e.openingStock } : {}),
      };
      meta.packaging = {
        ...(meta.packaging || {}),
        ...(e.packageWeight !== undefined ? { packageWeight: e.packageWeight } : {}),
        ...(e.packageLength !== undefined ? { packageLength: e.packageLength } : {}),
        ...(e.packageWidth !== undefined ? { packageWidth: e.packageWidth } : {}),
        ...(e.packageHeight !== undefined ? { packageHeight: e.packageHeight } : {}),
        ...(e.dimensionUnit !== undefined ? { dimensionUnit: e.dimensionUnit } : {}),
        ...(e.weightUnit !== undefined ? { weightUnit: e.weightUnit } : {}),
      };
      meta.identifiers = {
        ...(meta.identifiers || {}),
        ...(e.ean !== undefined ? { ean: e.ean } : {}),
        ...(e.isbn !== undefined ? { isbn: e.isbn } : {}),
      };
      meta.attributes = {
        ...(meta.attributes || {}),
        ...(e.productType !== undefined ? { productType: e.productType } : {}),
        ...(e.itemType !== undefined ? { itemType: e.itemType } : {}),
        ...(e.source !== undefined ? { source: e.source } : {}),
        ...(e.referenceId !== undefined ? { referenceId: e.referenceId } : {}),
        ...(e.lastSync !== undefined ? { lastSync: e.lastSync } : {}),
        ...(e.sellable !== undefined ? { sellable: e.sellable } : {}),
        ...(e.purchasable !== undefined ? { purchasable: e.purchasable } : {}),
        ...(e.variantMapping !== undefined ? { variantMapping: e.variantMapping } : {}),
        ...(e.itemStatus !== undefined ? { itemStatus: e.itemStatus } : {}),
        ...(e.activeOnlineStore !== undefined ? { activeOnlineStore: e.activeOnlineStore } : {}),
      };
      r.metadata = meta;

      // Edited slab tiers override the file's. Sheet uses GROSS rate/unit;
      // convert to the taxable rate updatePriceSlabs persists, using the row's tax%.
      if (e.slabs !== undefined) {
        r.bulkSlabs = e.slabs.map((s) => ({
          minQty: s.minQty,
          grossRate: s.grossRate,
          taxableRate: r.taxPercent > 0 ? Math.round((s.grossRate / (1 + r.taxPercent / 100)) * 100) / 100 : s.grossRate,
          ...(s.promoGrossRate ? {
            promoGrossRate: s.promoGrossRate,
            promoTaxableRate: r.taxPercent > 0 ? Math.round((s.promoGrossRate / (1 + r.taxPercent / 100)) * 100) / 100 : s.promoGrossRate,
          } : {}),
        }));
      }

          try {
            validateImportCategoryColumns(r);
            const resolvedImageUrl = resolveRowImageUrl(r);
            if (resolvedImageUrl) r.imageUrl = resolvedImageUrl;

            const hasCategoryData = !!(
              r.parentCategory ||
              r.subCategory ||
              r.legacyCategory ||
              (r.additionalSubCategories && r.additionalSubCategories.length > 0)
            );
            let categoryId: string | null = null;
            let categoryIds: string[] = [];
            if (hasCategoryData) {
              const resolved = await resolveImportCategoryIds({
                parentCategory: r.parentCategory,
                subCategory: r.subCategory,
                additionalSubCategories: r.additionalSubCategories,
                legacyCategory: r.legacyCategory,
                autoApprove: true,
                catMap,
              });
              categoryId = resolved.primaryCategoryId;
              categoryIds = resolved.categoryIds;
              if (categoryIds.length === 0) {
                throw new Error('Sub-category required: pick a valid sub-category under the selected parent.');
              }
              await assertLeafCategory(categoryIds, tx);
            }
        // Admin path: an unknown brand is auto-created (approved + active) so it
        // reaches the Brands list and the approvals model — instead of living
        // only as denormalized text on the product.
            if (r.brand) {
              await findOrCreateBrandByName({ name: r.brand, autoApprove: true });
            }
            const existing = findExisting(r) ?? findCreated(r);
            const slug = existing ? existing.slug : uniqueSlug(r.name);

            if (existing) {
          // ── UPDATE existing product ──
          // SKU also gets written through — previously the update path
          // dropped SKU edits silently. Admin edits land everywhere.
          let composedSku: string | undefined;
          let vendorSku: string | undefined;
          if (vendorId && r.sku) {
            vendorSku = r.sku.trim();
            composedSku = await composeVendorListingSku(vendorId, vendorSku, existing.id);
          }

          const updatedProduct = await tx.product.update({
            where: { id: existing.id },
            data: {
              name: r.name,
              ...(vendorId ? {
                ...(composedSku !== undefined ? { sku: composedSku } : {}),
                ...(vendorSku !== undefined ? { vendorSku } : {}),
              } : {
                ...(r.sku !== undefined ? { sku: r.sku } : {}),
              }),
              categoryId: categoryId || existing.categoryId,
              basePrice: r.basePrice,
              taxPercent: r.taxPercent,
              promoPrice: r.promoPrice || null,
              promoStartTime: r.promoStartTime || null,
              promoEndTime: r.promoEndTime || null,
              ...(r.hsn ? { hsn: r.hsn } : {}),
              ...(r.unit ? { unit: r.unit } : {}),
              ...(r.brand ? { brand: r.brand } : {}),
              ...(r.imageUrl ? { imageUrl: r.imageUrl } : {}),
              metadata: r.metadata
                ? mergeMetadata(
                    enrichImportMetadata(
                      (existing as { metadata?: unknown }).metadata as Record<string, unknown>,
                      vendorCode,
                      existing.id,
                    ),
                    r.metadata,
                  )
                : enrichImportMetadata(
                    (existing as { metadata?: unknown }).metadata as Record<string, unknown>,
                    vendorCode,
                    existing.id,
                  ),
              ...(normalizedVegForDb(r.vegNonVeg) !== undefined
                ? { vegNonVeg: normalizedVegForDb(r.vegNonVeg) }
                : {}),
              ...(r.storageType ? { storageType: r.storageType } : {}),
              ...(r.moq !== undefined ? { minOrderQty: r.moq } : {}),
              ...(r.aliasName ? { aliasNames: [r.aliasName] } : {}),
              ...(r.upc ? { barcode: r.upc } : {}),
            },
          });

          // Stock update — for catalog-level imports (no vendor selected),
          // we update inventory IF the existing product already has an
          // Inventory row (and thus a vendorId on it). Without a vendorId
          // we can't CREATE a new Inventory row, but updating an existing
          // one is safe because the FK to vendor is preserved.
          if (r.stock !== undefined) {
            if (vendorId) {
              const outletId = await getPrimaryOutletIdForVendor(vendorId);
              await tx.inventory.upsert({
                where: { productId_outletId: { productId: existing.id, outletId } },
                update: { qtyAvailable: r.stock },
                create: {
                  productId: existing.id,
                  vendorId,
                  outletId,
                  qtyAvailable: r.stock,
                  lowStockThreshold: 10,
                },
              });
            } else {
              await tx.inventory.updateMany({
                where: { productId: existing.id },
                data: { qtyAvailable: r.stock },
              });
            }
          }

          // Replace price slabs (requires vendorId — slabs are per-vendor)
          if (vendorId) await updatePriceSlabs(existing.id, vendorId, r, tx);

          // Link category in the join table
          if (categoryIds.length > 0) {
            await syncImportProductCategories(existing.id, categoryIds, tx);
          }

          if (updatedProduct.brand) {
            syncProductToBrand(
              updatedProduct.brand,
              updatedProduct.name,
              updatedProduct.categoryId,
              updatedProduct.imageUrl,
              updatedProduct.packSize ?? undefined,
              updatedProduct.unit ?? undefined,
              updatedProduct.sku ?? undefined,
              updatedProduct.masterProductId || undefined,
              updatedProduct.id,
            ).catch(console.error);
          }

          updated++;
        } else {
          // ── CREATE new product ──
          // P0-1: link/create the Horeca1 master SKU by (name, brand) whenever a
          // leaf category resolved — keeps bulk-imported items in the central
          // item master, same invariant the single-create path enforces.
          const masterProductId = categoryId
            ? await findOrCreateMaster({ name: r.name, brand: r.brand ?? null, categoryId })
            : null;

          let composedSku: string | null = null;
          let vendorSku: string | null = null;
          if (vendorId && r.sku) {
            vendorSku = r.sku.trim();
            composedSku = await composeVendorListingSku(vendorId, vendorSku);
          }

          const productData: Record<string, unknown> = {
            vendorId: vendorId || null,
            categoryId,
            masterProductId,
            name: r.name,
            slug,
            sku: vendorId ? composedSku : (r.sku || null),
            vendorSku: vendorId ? vendorSku : null,
            hsn: r.hsn || null,
            unit: r.unit || null,
            brand: r.brand || null,
            basePrice: r.basePrice,
            taxPercent: r.taxPercent,
            promoPrice: r.promoPrice || null,
            promoStartTime: r.promoStartTime || null,
            promoEndTime: r.promoEndTime || null,
            imageUrl: r.imageUrl || null,
            approvalStatus: 'approved',
            approvedBy: ctx.userId,
            approvedAt: new Date(),
            metadata: mergeMetadata({}, r.metadata || {}),
            vegNonVeg: normalizedVegForDb(r.vegNonVeg) ?? null,
            storageType: r.storageType || null,
            minOrderQty: r.moq || 1,
            aliasNames: r.aliasName ? [r.aliasName] : [],
            barcode: r.upc || null,
          };

          // Inventory requires vendorId — seed per-outlet rows after create
          const product = await tx.product.create({ data: productData as Parameters<typeof prisma.product.create>[0]['data'] });

          if (vendorId) {
            const vendor = await tx.vendor.findUnique({
              where: { id: vendorId },
              select: { businessAccountId: true },
            });
            if (vendor) {
              await ensureInventoryForAllOutlets(
                product.id,
                vendorId,
                vendor.businessAccountId,
                { initialQty: r.stock ?? 0 },
                tx,
              );
            }
          }

          if (vendorId) {
            await tx.product.update({
              where: { id: product.id },
              data: {
                metadata: enrichImportMetadata(
                  product.metadata as Record<string, unknown>,
                  vendorCode,
                  product.id,
                ) as Prisma.InputJsonValue,
              },
            });
          }

          // Link category in the join table
          if (categoryIds.length > 0) {
            await syncImportProductCategories(product.id, categoryIds, tx);
          }

          // Create price slabs (requires vendorId)
          if (vendorId) await updatePriceSlabs(product.id, vendorId, r, tx);

          if (product.brand) {
            syncProductToBrand(
              product.brand,
              product.name,
              product.categoryId,
              product.imageUrl,
              product.packSize ?? undefined,
              product.unit ?? undefined,
              product.sku ?? undefined,
              product.masterProductId || undefined,
              product.id,
            ).catch(console.error);
          }

          // Register so a later duplicate row in the same file updates THIS
          // product instead of creating another copy.
          registerCreated(product);

              created++;
            }
          } catch (err) {
            commitErrors.push({
              row: rowNum,
              message: friendlyErrorMessage(err, 'Failed to process product'),
            });
            if (!force) {
              throw err;
            }
          }
        }
      });
    } catch {
      if (!force) {
        const strictErrorReport = buildImportErrorReportCsv(rowData, commitErrors);
        return NextResponse.json({
          success: true,
          data: {
            blocked: true,
            totalRows: rows.length,
            validRows: 0,
            created: 0,
            updated: 0,
            imported: 0,
            errors: commitErrors,
            errorReport: strictErrorReport,
            backupId,
            backup: productsToBackup,
          } satisfies CommitResponse & { backup: typeof productsToBackup },
        });
      }
    }

    const errorReport = commitErrors.length > 0 ? buildImportErrorReportCsv(rowData, commitErrors) : undefined;
    const validRows = rows.length - skipRows.size - commitErrors.length;

    return NextResponse.json({
      success: true,
      data: {
        blocked: false,
        totalRows: rows.length,
        validRows: Math.max(0, validRows),
        created,
        updated,
        imported: created + updated,
        errors: commitErrors,
        errorReport,
        backupId,
        backup: productsToBackup, // Client stores this for undo
      } satisfies CommitResponse & { backup: typeof productsToBackup },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// Helper: replace price slabs for a product from import row
async function updatePriceSlabs(
  productId: string,
  vendorId: string,
  row: ParsedProductRow,
  db: typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0] = prisma,
) {
  if (row.bulkSlabs.length === 0) return;

  // Delete existing slabs
  await db.priceSlab.deleteMany({ where: { productId, vendorId } });

  // Create new slabs
  await db.priceSlab.createMany({
    data: row.bulkSlabs.map((slab, idx) => ({
      productId,
      vendorId,
      minQty: slab.minQty,
      price: slab.taxableRate,
      promoPrice: slab.promoTaxableRate || null,
      sortOrder: idx,
    })),
  });
}
