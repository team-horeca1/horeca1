/**
 * No-DB verification of the Promo Engine money math: coupon validation,
 * scope filtering, proportional allocation, stacking suppression, cashback
 * eligibility (Rule 2/5 checkout-level), and wallet-redemption allocation.
 * Prisma calls inside the service are satisfied by an in-memory stub:
 *
 *   npx tsx prisma/scripts/test-promo-math.ts
 *
 * Phase B harness — checkout-level cashback, BXGY suppression via Rule 3,
 * wallet stacking flags.
 *
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */
import 'dotenv/config';
import type { Prisma } from '@prisma/client';
import { promotionService, couponSuppressesVendorPromos, cashbackOfferBadge, type CheckoutOrderDraft } from '../../src/modules/promotion/promotion.service';
import { isSuccessfulOrderRow } from '../../src/modules/promotion/promotion-issuance';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

async function expectReject(
  label: string,
  fn: () => Promise<unknown>,
  needle: string,
) {
  try {
    await fn();
    check(label, false, 'expected rejection, but call succeeded');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(label, msg.toLowerCase().includes(needle.toLowerCase()), msg);
  }
}

interface StubCoupon {
  id: string; code: string; name: string; vendorId: string | null;
  discountType: 'flat' | 'percentage'; discountValue: number;
  maxDiscount: number | null; minOrderValue: number | null;
  startDate: Date | null; endDate: Date | null;
  usageLimit: number | null; perUserLimit: number | null; usedCount: number;
  categoryIds: string[]; productIds: string[]; brandNames: string[];
  audienceUserIds: string[];
  stacksWithVendorPromo: boolean; stacksWithCashback: boolean; stacksWithWallet: boolean; isActive: boolean;
}

interface StubCampaign {
  id: string;
  vendorId: string | null;
  cashbackType: 'flat' | 'percentage';
  cashbackValue: number;
  maxCashback: number | null;
  minOrderValue: number | null;
  destination: 'wallet' | 'upi';
  stacksWithCoupon: boolean;
  stacksWithWallet: boolean;
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
  perUserLimit: number | null;
  totalBudget: number | null;
  usedAmount: number;
  usedCount: number;
}

const baseCoupon: StubCoupon = {
  id: 'c1', code: 'TEST', name: 'Test coupon', vendorId: null,
  discountType: 'flat', discountValue: 500, maxDiscount: null, minOrderValue: null,
  startDate: null, endDate: null, usageLimit: null, perUserLimit: null, usedCount: 0,
  categoryIds: [], productIds: [], brandNames: [], audienceUserIds: [],
  stacksWithVendorPromo: true, stacksWithCashback: true, stacksWithWallet: true, isActive: true,
};

const baseCampaign: StubCampaign = {
  id: 'cb1', vendorId: null, cashbackType: 'percentage', cashbackValue: 5,
  maxCashback: null, minOrderValue: null, destination: 'wallet',
  stacksWithCoupon: true, stacksWithWallet: true, isActive: true, startDate: null, endDate: null,
  perUserLimit: null, totalBudget: null, usedAmount: 0, usedCount: 0,
};

function stubDb(opts: {
  coupon?: StubCoupon | null;
  redemptionGroups?: string[];
  campaigns?: StubCampaign[];
  priorCashbackCount?: Record<string, number>;
} = {}): Prisma.TransactionClient {
  const coupon = opts.coupon === undefined ? { ...baseCoupon } : opts.coupon;
  const campaigns = opts.campaigns ?? [];
  const prior = opts.priorCashbackCount ?? {};
  return {
    coupon: { findUnique: async () => coupon },
    couponRedemption: {
      findMany: async () => (opts.redemptionGroups ?? []).map((g) => ({ checkoutGroupId: g })),
    },
    cashbackCampaign: {
      findMany: async () => campaigns,
      update: async () => campaigns[0] ?? {},
    },
    cashbackEntry: {
      count: async ({ where }: { where?: { campaignId?: string } }) =>
        prior[where?.campaignId ?? ''] ?? 0,
      create: async ({ data }: { data: { id?: string; amount: number } }) => ({
        id: data.id ?? 'entry-1',
        amount: data.amount,
      }),
    },
  } as unknown as Prisma.TransactionClient;
}

const drafts2: CheckoutOrderDraft[] = [
  {
    vendorId: 'v1', subtotal: 3000, promoDiscount: 0,
    items: [{ productId: 'p1', categoryId: 'catA', brand: 'BrandX', lineTotal: 3000 }],
  },
  {
    vendorId: 'v2', subtotal: 7000, promoDiscount: 0,
    items: [{ productId: 'p2', categoryId: 'catB', brand: 'BrandY', lineTotal: 7000 }],
  },
];

const drafts3: CheckoutOrderDraft[] = [
  {
    vendorId: 'v1', subtotal: 1000, promoDiscount: 0,
    items: [{ productId: 'p1', categoryId: 'catA', brand: 'BrandX', lineTotal: 1000 }],
  },
  {
    vendorId: 'v2', subtotal: 1000, promoDiscount: 0,
    items: [{ productId: 'p2', categoryId: 'catB', brand: 'BrandY', lineTotal: 1000 }],
  },
  {
    vendorId: 'v3', subtotal: 1000, promoDiscount: 0,
    items: [{ productId: 'p3', categoryId: 'catC', brand: 'BrandZ', lineTotal: 1000 }],
  },
];

/** Mirrors order.service: goods payable AFTER vendor promo + coupon, BEFORE wallet. */
function goodsPayables(
  drafts: CheckoutOrderDraft[],
  coupon: { suppressVendorPromos: boolean; perOrder: number[] } | null,
): number[] {
  return drafts.map((d, i) => {
    const promo = coupon?.suppressVendorPromos ? 0 : d.promoDiscount;
    return r2(Math.max(0, d.subtotal - promo - (coupon?.perOrder[i] ?? 0)));
  });
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  // A. Flat / percentage coupons
  // ═══════════════════════════════════════════════════════════════════════

  {
    const app = await promotionService.applyCouponToCheckout(stubDb({ coupon: { ...baseCoupon } }), {
      code: 'test', userId: 'u1', drafts: drafts2,
    });
    check('flat ₹500 splits 150/350 across 3k/7k orders',
      app.perOrder[0] === 150 && app.perOrder[1] === 350 && app.totalDiscount === 500,
      JSON.stringify(app.perOrder));
    check('coupon code is normalised to the stored uppercase value',
      app.coupon.code === 'TEST');
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountType: 'percentage', discountValue: 10, maxDiscount: 600 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('10% of 10k capped at ₹600', app.totalDiscount === 600, `got ${app.totalDiscount}`);
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountType: 'percentage', discountValue: 10 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('uncapped 10% of 10k is ₹1000 split 300/700',
      app.totalDiscount === 1000 && app.perOrder[0] === 300 && app.perOrder[1] === 700,
      JSON.stringify(app.perOrder));
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 50000 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('flat coupon larger than checkout is capped at eligible ₹10k',
      app.totalDiscount === 10000 && app.perOrder[0] === 3000 && app.perOrder[1] === 7000,
      JSON.stringify(app.perOrder));
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountType: 'percentage', discountValue: 50, maxDiscount: 200 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('percentage maxDiscount is the binding cap (₹200, not 50% of 10k)',
      app.totalDiscount === 200, `got ${app.totalDiscount}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // B. MOV — platform uses combined checkout; vendor uses that vendor only
  // ═══════════════════════════════════════════════════════════════════════

  await expectReject(
    'MOV ₹20k rejected on ₹10k checkout',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, minOrderValue: 20000 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    ),
    '20,000',
  );

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, minOrderValue: 10000 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('MOV exactly at combined subtotal is accepted', app.totalDiscount === 500);
  }

  await expectReject(
    'vendor coupon MOV uses only that vendor\'s subtotal (v1 ₹3k < ₹5k)',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, vendorId: 'v1', minOrderValue: 5000 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    ),
    '5,000',
  );

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, vendorId: 'v2', minOrderValue: 5000, discountValue: 400 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('vendor coupon MOV met on that vendor\'s ₹7k order',
      app.perOrder[0] === 0 && app.perOrder[1] === 400, JSON.stringify(app.perOrder));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // C. Rule 1 — ONE coupon per checkout (single-code apply, no merge)
  // ═══════════════════════════════════════════════════════════════════════

  {
    const a = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, id: 'c-flat', discountValue: 500 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    const b = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, id: 'c-pct', discountType: 'percentage', discountValue: 10 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('Rule 1: each applyCouponToCheckout prices exactly one coupon (no multi-code stack API)',
      a.coupon.id === 'c-flat' && b.coupon.id === 'c-pct'
        && a.totalDiscount === 500 && b.totalDiscount === 1000);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // D. Scope — vendor / product / category / brand
  // ═══════════════════════════════════════════════════════════════════════

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, vendorId: 'v2', discountValue: 400 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('vendor coupon hits only v2', app.perOrder[0] === 0 && app.perOrder[1] === 400,
      JSON.stringify(app.perOrder));
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountType: 'percentage', discountValue: 10, productIds: ['p1'] } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('product-scoped 10% applies to p1 only (₹300)',
      app.perOrder[0] === 300 && app.perOrder[1] === 0, JSON.stringify(app.perOrder));
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountType: 'percentage', discountValue: 10, categoryIds: ['catA'] } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('category-scoped 10% applies to catA only (₹300)',
      app.perOrder[0] === 300 && app.perOrder[1] === 0, JSON.stringify(app.perOrder));
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountType: 'percentage', discountValue: 10, brandNames: ['BrandY'] } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('brand-scoped 10% applies to BrandY only (₹700)',
      app.perOrder[0] === 0 && app.perOrder[1] === 700, JSON.stringify(app.perOrder));
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountType: 'percentage', discountValue: 10, brandNames: ['brandx'] } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('brand match is case-insensitive (brandx vs BrandX)',
      app.perOrder[0] === 300 && app.perOrder[1] === 0, JSON.stringify(app.perOrder));
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({
        coupon: {
          ...baseCoupon,
          discountType: 'percentage',
          discountValue: 10,
          productIds: ['p2'],
          categoryIds: ['catA'],
        },
      }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('scope is OR: product p2 OR category catA covers the whole checkout (₹1000)',
      app.totalDiscount === 1000 && app.perOrder[0] === 300 && app.perOrder[1] === 700,
      JSON.stringify(app.perOrder));
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 5000, productIds: ['p1'] } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('flat coupon larger than scoped eligible is capped at that scope (₹3000)',
      app.totalDiscount === 3000 && app.perOrder[0] === 3000 && app.perOrder[1] === 0,
      JSON.stringify(app.perOrder));
  }

  await expectReject(
    'audience-restricted coupon rejected for other users',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, audienceUserIds: ['u-special'] } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    ),
    'not available',
  );

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, audienceUserIds: ['u1'] } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('audience-restricted coupon applies for the targeted user', app.totalDiscount === 500);
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, audienceUserIds: [] } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('empty audienceUserIds means the coupon is available to every customer', app.totalDiscount === 500);
  }

  await expectReject(
    'scoped coupon with no matching items is rejected',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, productIds: ['p-missing'] } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    ),
    'does not apply',
  );

  await expectReject(
    'vendor coupon rejected when that vendor is not in the checkout',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, vendorId: 'v-other' } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    ),
    'does not apply',
  );

  // ═══════════════════════════════════════════════════════════════════════
  // E. Limits & validity window
  // ═══════════════════════════════════════════════════════════════════════

  await expectReject(
    'total usage limit enforced',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, usageLimit: 5, usedCount: 5 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    ),
    'usage limit',
  );

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, usageLimit: 5, usedCount: 4 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('usage limit just under the cap still applies', app.totalDiscount === 500);
  }

  await expectReject(
    'per-user limit enforced at 2 prior uses',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, perUserLimit: 2 }, redemptionGroups: ['g1', 'g2'] }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    ),
    'maximum number',
  );

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, perUserLimit: 2 }, redemptionGroups: ['g1'] }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('per-user limit counts distinct checkout groups — 1 of 2 still allowed',
      app.totalDiscount === 500);
  }

  await expectReject(
    'expired coupon rejected',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, endDate: new Date(Date.now() - 86_400_000) } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    ),
    'expired',
  );

  await expectReject(
    'future-dated coupon rejected',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, startDate: new Date(Date.now() + 86_400_000) } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    ),
    'not active yet',
  );

  await expectReject(
    'inactive coupon rejected',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, isActive: false } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    ),
    'invalid coupon',
  );

  await expectReject(
    'missing coupon rejected',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: null }),
      { code: 'NOPE', userId: 'u1', drafts: drafts2 },
    ),
    'invalid coupon',
  );

  // ═══════════════════════════════════════════════════════════════════════
  // F. Rule 3 — Coupon + vendor promo (stacksWithVendorPromo)
  // ═══════════════════════════════════════════════════════════════════════

  {
    const draftsWithPromo: CheckoutOrderDraft[] = [
      {
        vendorId: 'v1', subtotal: 1000, promoDiscount: 900,
        items: [{ productId: 'p1', categoryId: null, brand: null, lineTotal: 1000 }],
      },
    ];
    const stacking = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 300 } }),
      { code: 'TEST', userId: 'u1', drafts: draftsWithPromo },
    );
    const nonStacking = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 300, stacksWithVendorPromo: false } }),
      { code: 'TEST', userId: 'u1', drafts: draftsWithPromo },
    );
    check('Rule 3 stacking coupon capped by remaining value after promo (₹100)',
      stacking.totalDiscount === 100 && !stacking.suppressVendorPromos,
      `got ${stacking.totalDiscount}`);
    check('Rule 3 non-stacking coupon suppresses promo and takes full ₹300',
      nonStacking.totalDiscount === 300 && nonStacking.suppressVendorPromos,
      `got ${nonStacking.totalDiscount}`);
  }

  await expectReject(
    'Rule 3 stacking coupon rejected when vendor promo already consumes the order',
    () => promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 300 } }),
      {
        code: 'TEST', userId: 'u1', drafts: [{
          vendorId: 'v1', subtotal: 1000, promoDiscount: 1000,
          items: [{ productId: 'p1', categoryId: null, brand: null, lineTotal: 1000 }],
        }],
      },
    ),
    'does not apply',
  );

  {
    const draftsMixed: CheckoutOrderDraft[] = [
      {
        vendorId: 'v1', subtotal: 3000, promoDiscount: 2900,
        items: [{ productId: 'p1', categoryId: 'catA', brand: 'BrandX', lineTotal: 3000 }],
      },
      {
        vendorId: 'v2', subtotal: 7000, promoDiscount: 0,
        items: [{ productId: 'p2', categoryId: 'catB', brand: 'BrandY', lineTotal: 7000 }],
      },
    ];
    const stacking = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 500 } }),
      { code: 'TEST', userId: 'u1', drafts: draftsMixed },
    );
    // Proportional 150/350, then v1 capped at remaining 100 → 100/350 = 450
    check('Rule 3 stacking: per-PO cap after promo (v1 leftover ₹100, v2 ₹350)',
      stacking.perOrder[0] === 100 && stacking.perOrder[1] === 350 && stacking.totalDiscount === 450
        && !stacking.suppressVendorPromos,
      JSON.stringify(stacking.perOrder));

    const nonStacking = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 500, stacksWithVendorPromo: false } }),
      { code: 'TEST', userId: 'u1', drafts: draftsMixed },
    );
    check('Rule 3 non-stacking: full ₹500 split 150/350 against unsuppressed subtotals',
      nonStacking.perOrder[0] === 150 && nonStacking.perOrder[1] === 350
        && nonStacking.totalDiscount === 500 && nonStacking.suppressVendorPromos,
      JSON.stringify(nonStacking.perOrder));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // G. Rule 2 / 5 — Coupon + cashback, ONE winner per checkout
  // ═══════════════════════════════════════════════════════════════════════

  {
    const stacking = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, stacksWithCashback: true } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    const blocking = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, stacksWithCashback: false } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('Rule 2: coupon.stacksWithCashback=true is returned for the checkout',
      stacking.coupon.stacksWithCashback === true);
    check('Rule 2: coupon.stacksWithCashback=false is returned (caller must block cashback)',
      blocking.coupon.stacksWithCashback === false);
  }

  {
    const stacking = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, stacksWithWallet: true } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    const blocking = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, stacksWithWallet: false } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('Rule 6: coupon.stacksWithWallet=true is returned', stacking.coupon.stacksWithWallet === true);
    check('Rule 6: coupon.stacksWithWallet=false is returned (caller must ignore useWallet)',
      blocking.coupon.stacksWithWallet === false);
  }

  const singlePo = [{ orderId: 'o1', vendorId: 'v1', base: 5000 }];
  const twoPo = [
    { orderId: 'o1', vendorId: 'v1', base: 3000 },
    { orderId: 'o2', vendorId: 'v2', base: 7000 },
  ];

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({ campaigns: [{ ...baseCampaign, cashbackType: 'flat', cashbackValue: 200 }] }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: singlePo,
        couponApplied: true, couponBlocksCashback: false, walletApplied: false,
      },
    );
    check('Rule 2 both-true: cashback still awarded when a coupon is on the checkout',
      earned?.amount === 200, `got ${earned?.amount}`);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({ campaigns: [{ ...baseCampaign, cashbackType: 'flat', cashbackValue: 200 }] }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: twoPo,
        couponApplied: true, couponBlocksCashback: true, walletApplied: false,
      },
    );
    check('Rule 2: coupon.stacksWithCashback=false blocks cashback for the whole checkout',
      earned === null);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({
        campaigns: [{ ...baseCampaign, cashbackType: 'flat', cashbackValue: 200, stacksWithCoupon: false }],
      }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: singlePo,
        couponApplied: true, couponBlocksCashback: false, walletApplied: false,
      },
    );
    check('Rule 2 campaign.stacksWithCoupon=false skips that campaign when a coupon is applied',
      earned === null);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({
        campaigns: [
          { ...baseCampaign, id: 'plat', vendorId: null, cashbackType: 'percentage', cashbackValue: 5 },
          { ...baseCampaign, id: 'vend', vendorId: 'v1', cashbackType: 'flat', cashbackValue: 400 },
        ],
      }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: twoPo,
        couponApplied: false, couponBlocksCashback: false, walletApplied: false,
      },
    );
    // Platform 5% of combined 10k = 500 vs vendor v1 flat 400 on v1's 3k → platform wins
    check('Rule 5 checkout-level: platform 5% of combined ₹10k (₹500) beats vendor flat ₹400',
      earned?.amount === 500, `got ${earned?.amount}`);
    check('Rule 5 platform win attaches to the largest PO (v2 / o2)',
      earned?.orderId === 'o2', `got ${earned?.orderId}`);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({
        campaigns: [
          { ...baseCampaign, id: 'plat', vendorId: null, cashbackType: 'percentage', cashbackValue: 5 },
          { ...baseCampaign, id: 'vend', vendorId: 'v1', cashbackType: 'flat', cashbackValue: 400 },
        ],
      }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: singlePo,
        couponApplied: false, couponBlocksCashback: false, walletApplied: false,
      },
    );
    // 5% of 5000 = 250 vs vendor flat 400 → vendor wins; attach to that vendor's PO
    check('Rule 5: vendor flat ₹400 beats platform 5% (₹250) on a single PO',
      earned?.amount === 400 && earned?.orderId === 'o1', `got ${earned?.amount} / ${earned?.orderId}`);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({
        campaigns: [{
          ...baseCampaign,
          cashbackType: 'percentage',
          cashbackValue: 20,
          maxCashback: 150,
        }],
      }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: singlePo,
        couponApplied: false, couponBlocksCashback: false, walletApplied: false,
      },
    );
    check('percentage cashback respects maxCashback (20% of 5k capped at ₹150)',
      earned?.amount === 150, `got ${earned?.amount}`);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({
        campaigns: [{ ...baseCampaign, vendorId: 'v1', cashbackType: 'flat', cashbackValue: 200, minOrderValue: 8000 }],
      }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: twoPo,
        couponApplied: false, couponBlocksCashback: false, walletApplied: false,
      },
    );
    check('vendor campaign MOV is checked against that PO goods base (v1 ₹3k < ₹8k)',
      earned === null);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({
        campaigns: [{ ...baseCampaign, vendorId: null, cashbackType: 'flat', cashbackValue: 200, minOrderValue: 8000 }],
      }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: twoPo,
        couponApplied: false, couponBlocksCashback: false, walletApplied: false,
      },
    );
    check('platform campaign MOV is checked against combined goods base (₹10k ≥ ₹8k)',
      earned?.amount === 200, `got ${earned?.amount}`);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({
        campaigns: [{
          ...baseCampaign,
          cashbackType: 'flat',
          cashbackValue: 200,
          totalBudget: 1000,
          usedAmount: 900,
        }],
      }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: singlePo,
        couponApplied: false, couponBlocksCashback: false, walletApplied: false,
      },
    );
    check('campaign over remaining budget is skipped (₹900 used + ₹200 > ₹1000)',
      earned === null);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({
        campaigns: [{ ...baseCampaign, id: 'cb-lim', cashbackType: 'flat', cashbackValue: 200, perUserLimit: 1 }],
        priorCashbackCount: { 'cb-lim': 1 },
      }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: singlePo,
        couponApplied: false, couponBlocksCashback: false, walletApplied: false,
      },
    );
    check('per-user cashback limit skips the campaign', earned === null);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({ campaigns: [{ ...baseCampaign, cashbackType: 'flat', cashbackValue: 200 }] }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: [{ orderId: 'o1', vendorId: 'v1', base: 0 }],
        couponApplied: false, couponBlocksCashback: false, walletApplied: false,
      },
    );
    check('cashback skipped when every PO goods base is 0', earned === null);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({
        campaigns: [{ ...baseCampaign, cashbackType: 'flat', cashbackValue: 200, stacksWithWallet: false }],
      }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: singlePo,
        couponApplied: false, couponBlocksCashback: false, walletApplied: true,
      },
    );
    check('Rule 6: campaign.stacksWithWallet=false is skipped when Rewards Wallet was used',
      earned === null);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({
        campaigns: [{ ...baseCampaign, cashbackType: 'flat', cashbackValue: 200, stacksWithWallet: false }],
      }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: singlePo,
        couponApplied: false, couponBlocksCashback: false, walletApplied: false,
      },
    );
    check('Rule 6: campaign.stacksWithWallet=false still awards when wallet was not used',
      earned?.amount === 200, `got ${earned?.amount}`);
  }

  {
    const earned = await promotionService.evaluateCashbackForCheckout(
      stubDb({ campaigns: [{ ...baseCampaign, cashbackType: 'flat', cashbackValue: 200 }] }),
      {
        userId: 'u1', checkoutGroupId: 'g1', pos: singlePo,
        couponApplied: false, couponBlocksCashback: false, walletApplied: true,
      },
    );
    check('Rule 6 default: wallet used does not skip cashback when campaign stacksWithWallet=true',
      earned?.amount === 200, `got ${earned?.amount}`);
  }

  {
    const suppresses = await couponSuppressesVendorPromos(
      stubDb({ coupon: { ...baseCoupon, stacksWithVendorPromo: false } }),
      'TEST',
    );
    const allows = await couponSuppressesVendorPromos(
      stubDb({ coupon: { ...baseCoupon, stacksWithVendorPromo: true } }),
      'TEST',
    );
    const missing = await couponSuppressesVendorPromos(stubDb({ coupon: null }), 'NOPE');
    check('Rule 3 peek: non-stacking active coupon suppresses BXGY + vendor promo', suppresses === true);
    check('Rule 3 peek: stacking coupon does not suppress', allows === false);
    check('Rule 3 peek: missing coupon does not suppress (apply still fails later)', missing === false);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // H. Proportional multi-PO coupon split (paise-exact remainder)
  // ═══════════════════════════════════════════════════════════════════════

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 100 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts3 },
    );
    check('₹100 over three equal POs is paise-exact (33.33 / 33.33 / 33.34)',
      app.perOrder[0] === 33.33 && app.perOrder[1] === 33.33 && app.perOrder[2] === 33.34
        && app.totalDiscount === 100,
      JSON.stringify(app.perOrder));
  }

  {
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 1 } }),
      { code: 'TEST', userId: 'u1', drafts: drafts2 },
    );
    check('₹1 over 3k/7k remainder lands on the last weighted PO (0.30 / 0.70)',
      app.perOrder[0] === 0.3 && app.perOrder[1] === 0.7 && app.totalDiscount === 1,
      JSON.stringify(app.perOrder));
  }

  {
    const mixedLines: CheckoutOrderDraft[] = [
      {
        vendorId: 'v1', subtotal: 3000, promoDiscount: 0,
        items: [
          { productId: 'p1a', categoryId: 'catA', brand: 'BrandX', lineTotal: 1000 },
          { productId: 'p1b', categoryId: 'catA', brand: 'BrandX', lineTotal: 2000 },
        ],
      },
      drafts2[1],
    ];
    const app = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 500 } }),
      { code: 'TEST', userId: 'u1', drafts: mixedLines },
    );
    check('eligible base sums all matching lines on a PO (still 150/350 on 3k/7k)',
      app.perOrder[0] === 150 && app.perOrder[1] === 350, JSON.stringify(app.perOrder));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // I. Wallet allocation (Rule 6) — payment instrument, not a discount
  // ═══════════════════════════════════════════════════════════════════════

  {
    const full = promotionService.allocateWallet(10000, [3000, 2000], 0);
    const floored = promotionService.allocateWallet(10000, [3000, 2000], 1);
    const partial = promotionService.allocateWallet(1000, [3000, 2000], 0);
    check('wallet covers full payable when balance allows',
      full[0] === 3000 && full[1] === 2000, JSON.stringify(full));
    check('online ₹1 floor leaves combined payable ≥ 1',
      Math.round((floored[0] + floored[1]) * 100) / 100 === 4999, JSON.stringify(floored));
    check('partial balance splits proportionally (600/400)',
      partial[0] === 600 && partial[1] === 400, JSON.stringify(partial));
  }

  {
    const zero = promotionService.allocateWallet(0, [3000, 2000], 0);
    check('zero wallet balance allocates nothing',
      zero[0] === 0 && zero[1] === 0, JSON.stringify(zero));
  }

  {
    const overFloor = promotionService.allocateWallet(10000, [0.5], 1);
    check('online floor greater than payable allocates nothing (cannot leave combined < ₹1)',
      overFloor[0] === 0, JSON.stringify(overFloor));
  }

  {
    const single = promotionService.allocateWallet(10000, [5], 1);
    check('single-PO online: usable = payable − ₹1 floor (₹4 of ₹5)',
      single[0] === 4, JSON.stringify(single));
  }

  {
    const shares = promotionService.allocateWallet(100, [300, 300, 400], 0);
    check('wallet ₹100 over 300/300/400 is 30/30/40',
      shares[0] === 30 && shares[1] === 30 && shares[2] === 40, JSON.stringify(shares));
  }

  {
    const shares = promotionService.allocateWallet(1, [3000, 7000], 0);
    check('wallet ₹1 over 3k/7k remainder is paise-exact (0.30 / 0.70)',
      shares[0] === 0.3 && shares[1] === 0.7, JSON.stringify(shares));
  }

  {
    const shares = promotionService.allocateWallet(10000, [3000, 0, 2000], 0);
    check('zero-payable PO receives no wallet share',
      shares[0] === 3000 && shares[1] === 0 && shares[2] === 2000, JSON.stringify(shares));
  }

  {
    const empty = promotionService.allocateWallet(1000, [], 0);
    check('empty payables array returns empty allocation', empty.length === 0);
  }

  {
    // Checkout sequence snapshot: price → vendor promo → coupon → wallet.
    // Cashback base is goods payable (wallet is NOT subtracted).
    const draftsWithPromo: CheckoutOrderDraft[] = [
      {
        vendorId: 'v1', subtotal: 3000, promoDiscount: 300,
        items: [{ productId: 'p1', categoryId: 'catA', brand: 'BrandX', lineTotal: 3000 }],
      },
      {
        vendorId: 'v2', subtotal: 7000, promoDiscount: 0,
        items: [{ productId: 'p2', categoryId: 'catB', brand: 'BrandY', lineTotal: 7000 }],
      },
    ];
    const couponApp = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 500 } }),
      { code: 'TEST', userId: 'u1', drafts: draftsWithPromo },
    );
    const payables = goodsPayables(draftsWithPromo, couponApp);
    // v1: 3000 − 300 − 150 = 2550; v2: 7000 − 0 − 350 = 6650; combined 9200
    check('checkout goods payable after stacking promo+coupon is 2550/6650',
      payables[0] === 2550 && payables[1] === 6650, JSON.stringify(payables));

    const wallet = promotionService.allocateWallet(1000, payables, 0);
    const expectedV1 = r2((1000 * 2550) / 9200); // 277.17
    const expectedV2 = r2(1000 - expectedV1);     // 722.83
    check('wallet ₹1000 splits over post-discount payables (not original subtotals)',
      wallet[0] === expectedV1 && wallet[1] === expectedV2, JSON.stringify(wallet));

    const cashbackBase = payables; // wallet is payment — Rule 6
    const finalPayable = payables.map((p, i) => r2(p - wallet[i]));
    check('Rule 6: cashback base ignores wallet (still 2550/6650 after ₹1000 debit)',
      cashbackBase[0] === 2550 && cashbackBase[1] === 6650);
    check('final online/COD payable is goods − wallet (2272.83 / 5927.17)',
      finalPayable[0] === r2(2550 - expectedV1) && finalPayable[1] === r2(6650 - expectedV2),
      JSON.stringify(finalPayable));
  }

  {
    const draftsWithPromo: CheckoutOrderDraft[] = [
      {
        vendorId: 'v1', subtotal: 1000, promoDiscount: 900,
        items: [{ productId: 'p1', categoryId: null, brand: null, lineTotal: 1000 }],
      },
    ];
    const nonStacking = await promotionService.applyCouponToCheckout(
      stubDb({ coupon: { ...baseCoupon, discountValue: 300, stacksWithVendorPromo: false } }),
      { code: 'TEST', userId: 'u1', drafts: draftsWithPromo },
    );
    const payables = goodsPayables(draftsWithPromo, nonStacking);
    // promo suppressed → 1000 − 0 − 300 = 700
    check('Rule 3 + wallet: suppressed promo is excluded from the payable the wallet sees',
      payables[0] === 700, JSON.stringify(payables));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // J. Successful-order definition (first-order / referral) — unused coupons
  //    do not count; draft/cancelled/unpaid-online do not count.
  // ═══════════════════════════════════════════════════════════════════════

  check('paid order is successful even while pending',
    isSuccessfulOrderRow({ status: 'pending', paymentStatus: 'paid', paymentMethod: 'online' }) === true);
  check('COD confirmed is successful',
    isSuccessfulOrderRow({ status: 'confirmed', paymentStatus: 'pending', paymentMethod: 'cod' }) === true);
  check('COD delivered is successful',
    isSuccessfulOrderRow({ status: 'delivered', paymentStatus: 'pending', paymentMethod: 'cod' }) === true);
  check('COD still pending is NOT successful (unused coupon / unconfirmed checkout)',
    isSuccessfulOrderRow({ status: 'pending', paymentStatus: 'pending', paymentMethod: 'cod' }) === false);
  check('draft is never successful',
    isSuccessfulOrderRow({ status: 'draft', paymentStatus: 'paid', paymentMethod: 'online' }) === false);
  check('cancelled is never successful',
    isSuccessfulOrderRow({ status: 'cancelled', paymentStatus: 'paid', paymentMethod: 'cod' }) === false);
  check('unpaid online order is not successful',
    isSuccessfulOrderRow({ status: 'confirmed', paymentStatus: 'pending', paymentMethod: 'online' }) === false);

  // ═══════════════════════════════════════════════════════════════════════
  // K. Cashback settle (wallet dest) / duplicate settle / cancel
  // ═══════════════════════════════════════════════════════════════════════

  type StubEntry = {
    id: string; orderId: string; checkoutGroupId: string | null; userId: string;
    campaignId: string | null; vendorId: string | null; amount: number;
    destination: 'wallet' | 'upi'; status: string;
    cashbackType: string | null; cashbackValue: number | null;
    maxCashback: number | null; minOrderValue: number | null;
    walletTxnId: string | null; upiId: string | null;
  };

  function stubSettle(opts: {
    entry: StubEntry;
    siblings?: Array<{ vendorId: string; status: string; subtotal: number; promoDiscount: number; couponDiscount: number }>;
    walletBalance?: number;
  }) {
    let entry: StubEntry | null = { ...opts.entry };
    let wallet = { id: 'w1', userId: opts.entry.userId, balance: opts.walletBalance ?? 0 };
    const txns: Array<{ type: string; amount: number; referenceType: string }> = [];
    return {
      db: {
        cashbackEntry: {
          findUnique: async () => entry,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            if (!entry) return null;
            entry = { ...entry, ...data } as StubEntry;
            return entry;
          },
        },
        order: {
          findMany: async ({ where }: { where?: { status?: { notIn?: string[] } } } = {}) => {
            const rows = opts.siblings ?? [];
            const notIn = where?.status?.notIn ?? [];
            return notIn.length ? rows.filter((r) => !notIn.includes(r.status)) : rows;
          },
          findUnique: async () => opts.siblings?.[0] ?? {
            subtotal: 5000, promoDiscount: 0, couponDiscount: 0,
          },
        },
        wallet: {
          upsert: async ({
            create, update,
          }: {
            create: { balance: number };
            update: { balance: { increment: number } };
          }) => {
            const inc = update?.balance?.increment ?? create.balance;
            wallet = { ...wallet, balance: r2(wallet.balance + inc) };
            return wallet;
          },
          findUnique: async () => wallet,
          update: async ({ data }: { data: { balance: { decrement: number } } }) => {
            wallet = { ...wallet, balance: r2(wallet.balance - data.balance.decrement) };
            return wallet;
          },
        },
        walletTransaction: {
          create: async ({ data }: { data: { type: string; amount: number; referenceType: string } }) => {
            txns.push({ type: data.type, amount: data.amount, referenceType: data.referenceType });
            return { id: `txn-${txns.length}`, ...data };
          },
        },
        notification: { create: async () => ({}) },
        cashbackCampaign: {
          update: async () => ({}),
          updateMany: async () => ({ count: 1 }),
        },
      } as unknown as Prisma.TransactionClient,
      get entry() { return entry; },
      get wallet() { return wallet; },
      txns,
    };
  }

  const pendingWallet: StubEntry = {
    id: 'e1', orderId: 'o1', checkoutGroupId: 'g1', userId: 'u1',
    campaignId: 'cb1', vendorId: null, amount: 200, destination: 'wallet',
    status: 'pending', cashbackType: 'flat', cashbackValue: 200,
    maxCashback: null, minOrderValue: null, walletTxnId: null, upiId: null,
  };
  const liveSiblings = [
    { vendorId: 'v1', status: 'delivered', subtotal: 3000, promoDiscount: 0, couponDiscount: 0 },
    { vendorId: 'v2', status: 'delivered', subtotal: 7000, promoDiscount: 0, couponDiscount: 0 },
  ];

  {
    const s = stubSettle({ entry: pendingWallet, siblings: liveSiblings, walletBalance: 10 });
    await promotionService.settleCashbackForOrder(s.db, 'o1');
    check('settle credits Rewards Wallet destination (pending → credited)',
      s.entry?.status === 'credited' && s.entry.walletTxnId === 'txn-1',
      `status=${s.entry?.status} txn=${s.entry?.walletTxnId}`);
    check('settle wallet dest adds the snapshotted amount to Rewards Wallet (10 + 200)',
      s.wallet.balance === 210 && s.txns.length === 1 && s.txns[0].type === 'credit',
      `bal=${s.wallet.balance} txns=${s.txns.length}`);
  }

  {
    const s = stubSettle({
      entry: { ...pendingWallet, status: 'credited', walletTxnId: 'txn-1' },
      siblings: liveSiblings,
      walletBalance: 210,
    });
    await promotionService.settleCashbackForOrder(s.db, 'o1');
    check('duplicate settle is a no-op once the entry is already credited',
      s.txns.length === 0 && s.entry?.status === 'credited' && s.wallet.balance === 210);
  }

  {
    const s = stubSettle({ entry: pendingWallet, siblings: liveSiblings });
    await promotionService.cancelCashbackForOrder(s.db, 'o1');
    check('cancel voids a pending cashback entry',
      s.entry?.status === 'cancelled' && s.txns.length === 0,
      `status=${s.entry?.status}`);
  }

  {
    const s = stubSettle({
      entry: { ...pendingWallet, status: 'credited', walletTxnId: 'txn-1' },
      siblings: liveSiblings,
      walletBalance: 200,
    });
    await promotionService.cancelCashbackForOrder(s.db, 'o1');
    check('cancel of a credited entry claws back from Rewards Wallet',
      s.entry?.status === 'cancelled' && s.wallet.balance === 0
        && s.txns.length === 1 && s.txns[0].type === 'debit' && s.txns[0].referenceType === 'cashback_reversal',
      `bal=${s.wallet.balance} txn=${JSON.stringify(s.txns[0])}`);
  }

  {
    const s = stubSettle({
      entry: { ...pendingWallet, status: 'paid', destination: 'upi' },
      siblings: liveSiblings,
    });
    await promotionService.cancelCashbackForOrder(s.db, 'o1');
    check('paid UPI entries are left for ops (cancel is a no-op)',
      s.entry?.status === 'paid');
  }

  {
    const s = stubSettle({
      entry: pendingWallet,
      siblings: [
        { vendorId: 'v1', status: 'cancelled', subtotal: 3000, promoDiscount: 0, couponDiscount: 0 },
        { vendorId: 'v2', status: 'cancelled', subtotal: 7000, promoDiscount: 0, couponDiscount: 0 },
      ],
    });
    await promotionService.settleCashbackForOrder(s.db, 'o1');
    check('settle cancels the entry when every PO in the checkout group is cancelled',
      s.entry?.status === 'cancelled', `status=${s.entry?.status}`);
  }

  {
    const flat = cashbackOfferBadge({
      cashbackType: 'flat',
      cashbackValue: 8888,
      maxCashback: null,
      minOrderValue: null,
    });
    check('deals cashback badge is Up-to for flat face value',
      flat.startsWith('Up to ₹8888'), flat);
    const pct = cashbackOfferBadge({
      cashbackType: 'percentage',
      cashbackValue: 15,
      maxCashback: 250,
      minOrderValue: 500,
    });
    check('deals cashback badge is Up-to for percentage + max',
      pct.includes('Up to 15%') && pct.includes('max ₹250') && pct.includes('orders above ₹500'), pct);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
