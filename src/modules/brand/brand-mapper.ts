// ============================================================
// Brand Auto-Mapping Engine — Phase 1 (Rules-based)
// ============================================================
// Strategy: deterministic matching with human review fallback
//
// Confidence thresholds:
//   >= 0.90 → pending_review (vendor must confirm before discovery)
//   >= 0.70 → pending_review (medium, queue for vendor review)
//   <  0.70 → ignored        (too uncertain)
//
// Phase 2: replace scoring with embeddings + fuzzy matching

import { ensurePendingDistributorAuth } from '@/lib/brandAuthorizedDistributor';
import { prisma } from '@/lib/prisma';
import { emitEvent } from '@/events/emitter';
import type { MatchMethod } from '@prisma/client';
import { embed, cosineSimilarity, getEmbeddingProvider } from '@/lib/embeddings';
import { getMappingAI, judgeBatch } from '@/lib/mapping-ai';

// ── Text normalisation ───────────────────────────────────────
const NOISE_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'with', 'for',
  'pack', 'box', 'bag', 'bottle', 'jar', 'pouch', 'sachet',
]);

const UNIT_ALIASES: Record<string, string> = {
  kilogram: 'kg', kilograms: 'kg', kgs: 'kg',
  gram: 'g', grams: 'g', grms: 'g', gm: 'g', gms: 'g',
  litre: 'l', litres: 'l', liter: 'l', liters: 'l', ltr: 'l', ltrs: 'l',
  millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', mls: 'ml',
};

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')          // remove punctuation
    .replace(/(\d+)\s*(kg|g|ml|l|ltr|gm|gms|kgs|gram|grams|kilogram|kilogram)/gi,
      (_, n, u) => `${n}${UNIT_ALIASES[u.toLowerCase()] ?? u.toLowerCase()}`) // "1 KG" → "1kg"
    .split(/\s+/)
    .filter(w => w.length > 0 && !NOISE_WORDS.has(w))
    .join(' ')
    .trim();
}

// ── Token overlap similarity (Jaccard) ──────────────────────
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(' '));
  const setB = new Set(b.split(' '));
  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Pack size extraction ─────────────────────────────────────
function extractPackSize(text: string): string | null {
  const m = text.match(/\d+(?:\.\d+)?\s*(?:kg|g|ml|l)/i);
  return m ? normalise(m[0]) : null;
}

// ── Score a single distributor product against brand product ─
//
// Phase 1 (rules-based) signals weights:
//   1. Brand-name token in product/brand field   +0.35
//   2. Jaccard token similarity on full name     up to +0.40
//   3. Pack size exact match                     +0.15
//   4. Distributor brand-field exact match       +0.10
//
// Phase 3 adds an OPTIONAL semantic-similarity signal:
//   5. Cosine similarity between embeddings     up to +0.30 (if both embeddings present)
//
// When the AI signal contributes, the rule-based portion is scaled to 0.70 so
// the final score still tops out at 1.0 while letting embeddings catch typos,
// abbreviations and Hindi/English variants the rules miss
// ("Knr Ketchup 1kg" ≈ "Knorr Ketchup 1kg").
//
// If embeddings aren't available (provider down, not yet computed), we fall
// back to pure rule-based — no behavior change vs Phase 1.
export function scoreMatch(
  brandProductName: string,
  brandName: string,
  distributorProductName: string,
  distributorBrandField: string | null,
  opts?: { brandEmbedding?: number[] | null; distributorEmbedding?: number[] | null },
): { score: number; usedAI: boolean; aiSimilarity: number | null } {
  const normBrand   = normalise(brandProductName);
  const normDist    = normalise(distributorProductName);
  const normBrandId = normalise(brandName);

  let ruleScore = 0;

  // 1. Brand name appears in distributor product (strong signal — 0.35)
  if (normDist.includes(normBrandId) || normalise(distributorBrandField ?? '').includes(normBrandId)) {
    ruleScore += 0.35;
  }

  // 2. Jaccard token similarity on full product name (0–0.40)
  ruleScore += jaccardSimilarity(normBrand, normDist) * 0.40;

  // 3. Pack size match (0.15)
  const psA = extractPackSize(normBrand);
  const psB = extractPackSize(normDist);
  if (psA && psB && psA === psB) ruleScore += 0.15;

  // 4. Distributor brand field exact match (0.10 bonus)
  if (distributorBrandField && normalise(distributorBrandField) === normBrandId) {
    ruleScore += 0.10;
  }

  ruleScore = Math.min(ruleScore, 1);

  const brandEmb = opts?.brandEmbedding;
  const distEmb = opts?.distributorEmbedding;
  const haveBothEmbeddings = brandEmb && distEmb && brandEmb.length > 0 && distEmb.length > 0 && brandEmb.length === distEmb.length;

  if (!haveBothEmbeddings) {
    return { score: ruleScore, usedAI: false, aiSimilarity: null };
  }

  // Embeddings available — blend signals.
  const sim = cosineSimilarity(brandEmb!, distEmb!); // -1..1, mostly 0..1 for related products
  const aiSimilarity = Math.max(0, sim);             // clamp negative noise to 0
  const blended = ruleScore * 0.70 + aiSimilarity * 0.30;
  return { score: Math.min(blended, 1), usedAI: true, aiSimilarity };
}

/** Build the canonical text we embed for a product (used by both sides). */
function buildEmbeddingText(name: string, brand?: string | null, packSize?: string | null, unit?: string | null, category?: string | null): string {
  const parts = [
    brand?.trim(),
    name?.trim(),
    [packSize?.trim(), unit?.trim()].filter(Boolean).join(' '),
    category?.trim(),
  ].filter(Boolean);
  return parts.join(' ');
}

/** Embed and persist the embedding for ONE BrandMasterProduct. Fire-and-forget safe. */
export async function embedBrandMasterProduct(brandMasterProductId: string): Promise<void> {
  const mp = await prisma.brandMasterProduct.findUnique({
    where: { id: brandMasterProductId },
    include: { brand: { select: { name: true } }, categoryRel: { select: { name: true } } },
  });
  if (!mp) return;
  const text = buildEmbeddingText(mp.name, mp.brand?.name, mp.packSize, mp.unit, mp.categoryRel?.name ?? mp.category);
  const vector = await embed(text);
  if (!vector) return; // provider failed — leave existing embedding untouched
  let modelTag = 'unknown';
  try { modelTag = getEmbeddingProvider().name; } catch { /* env not set */ }
  await prisma.brandMasterProduct.update({
    where: { id: brandMasterProductId },
    data: { embedding: vector, embeddingModel: modelTag, embeddingUpdatedAt: new Date() },
  });
}

/** Embed and persist the embedding for ONE distributor Product. Fire-and-forget safe. */
export async function embedDistributorProduct(productId: string): Promise<void> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: { select: { name: true } } },
  });
  if (!p) return;
  const text = buildEmbeddingText(p.name, p.brand, p.packSize, p.unit, p.category?.name);
  const vector = await embed(text);
  if (!vector) return;
  let modelTag = 'unknown';
  try { modelTag = getEmbeddingProvider().name; } catch { /* env not set */ }
  await prisma.product.update({
    where: { id: productId },
    data: { embedding: vector, embeddingModel: modelTag, embeddingUpdatedAt: new Date() },
  });
}

// ── Run mapping for one BrandMasterProduct ───────────────────
//
// AI hybrid pre-filter: when the brand master has an embedding, we first
// fetch ALL approved distributor products with their embeddings and rank by
// cosine similarity. Then we run the full scoreMatch on the top candidates
// + anyone the brand-name pre-filter would have caught (so we don't miss
// products with the brand name in the title but no embedding yet).
export async function runMappingForProduct(_brandMasterProductId: string): Promise<void> {
  // Automated mapping is disabled per client specification. Mappings must be 100% manually curated.
  return;
}

// ── Run mapping for ALL products of a brand ──────────────────
export async function runMappingForBrand(_brandId: string): Promise<void> {
  // Automated mapping is disabled per client specification. Mappings must be 100% manually curated.
  return;
}

// ── Run mapping for ONE distributor product (inverse direction) ─
export async function runMappingForVendorProduct(_distributorProductId: string): Promise<void> {
  // Automated mapping is disabled per client specification. Mappings must be 100% manually curated.
  return;
}

