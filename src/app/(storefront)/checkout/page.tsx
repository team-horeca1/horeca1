'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, Clock, CheckCircle2, Shield, User, Loader2, Check, MapPin, AlertCircle, ChevronDown } from 'lucide-react';
import { Zap, CreditCard, Banknote, FileText } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useSession } from 'next-auth/react';
import { dal } from '@/lib/dal';
import { DeliverySlotPicker } from '@/components/features/checkout/DeliverySlotPicker';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { useAddress } from '@/context/AddressContext';
import type { VendorCartGroup, CartItem, VendorProduct } from '@/types';
import {
    VendorPromoBanner,
    FreeGiftLine,
    PaidLineWithBonus,
    PromoSavingsSummary,
    YourPriceChip,
    promoTotalCaption,
} from '@/components/features/promotions/PromotionBenefits';
import {
    CheckoutOffersPanel,
    type CheckoutOfferChoicesView,
} from '@/components/features/promo/CheckoutOffersPanel';
import { useSearchParams, useRouter } from 'next/navigation';

// window.Razorpay is typed in src/types/razorpay.d.ts

interface RazorpaySuccessPayload {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
}

function loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (typeof window !== 'undefined' && typeof window.Razorpay !== 'undefined') { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
        document.body.appendChild(script);
    });
}

function openRazorpayPopup(opts: {
    key: string;
    amount: number;
    currency: string;
    order_id: string;
    description: string;
}): Promise<RazorpaySuccessPayload> {
    return new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
            key: opts.key,
            amount: opts.amount,
            currency: opts.currency,
            order_id: opts.order_id,
            name: 'HoReCa Hub',
            description: opts.description,
            theme: { color: '#53B175' },
            handler: (response: RazorpaySuccessPayload) => resolve(response),
            modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
        });
        rzp.open();
    });
}

type CheckoutStep = 'review' | 'payment' | 'confirmation';

// Shape returned by GET /api/v1/orders/:id for the ?draft= flow. Decimal
// fields arrive as strings over JSON.
interface DraftOrderItem {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: string | number;
    product?: { imageUrl: string | null; images: string[] } | null;
}

interface DraftOrderDetail {
    id: string;
    orderNumber: string;
    status: string;
    vendorId: string;
    subtotal: string | number;
    totalAmount: string | number;
    paymentMethod: string | null;
    vendor?: { businessName: string; logoUrl: string | null } | null;
    items: DraftOrderItem[];
}

// Shape returned by GET /api/v1/wallet — one DiSCCO credit line per supplier
// (vendorId set) or Horeca1 platform credit (vendorId null). Not H1 Wallet cash.
interface CustomerCreditWallet {
    id: string;
    vendorId: string | null;
    vendor: { id: string; businessName: string } | null;
    status: string;
    creditLimit: string;
    availableCredit: string;
    outstandingAmount: string;
    currentDueDate: string | null;
}

// Shape returned by POST /api/v1/promotions/preview — auto vendor promos
// (post-suppression effective values) + optional coupon eval + offerChoices.
interface PromoPreviewResponse {
    subtotal: number;
    subtotalTaxable: number;
    totalGST: number;
    autoPromos: Array<{ vendorId: string; promotionId: string; promotionName: string; type: string; discount: number }>;
    totalPromoDiscount: number;
    bxgyFreeItems?: Array<{
        vendorId: string;
        productId: string;
        productName: string;
        quantity: number;
        promotionName: string;
    }>;
    coupon:
        | { valid: true; code: string; name: string; estimatedDiscount: number; stacksWithCashback: boolean; stacksWithWallet: boolean }
        | { valid: false; message: string }
        | null;
    estimatedCashback: {
        estimatedAmount: number;
        destination: 'wallet' | 'upi';
        settlesOn: 'delivery';
        campaignName: string;
    } | null;
    offerChoices?: CheckoutOfferChoicesView;
}

const EMPTY_OFFER_CHOICES: CheckoutOfferChoicesView = {
    coupons: [],
    cashbacks: [],
    storeOffers: [],
};

function normalizeOfferChoices(raw: CheckoutOfferChoicesView | undefined): CheckoutOfferChoicesView {
    if (!raw) return EMPTY_OFFER_CHOICES;
    return {
        coupons: (raw.coupons ?? []).map((c) => ({
            ...c,
            endDate: c.endDate != null ? String(c.endDate) : null,
        })),
        cashbacks: (raw.cashbacks ?? []).map((c) => ({
            ...c,
            endDate: c.endDate != null ? String(c.endDate) : null,
        })),
        storeOffers: (raw.storeOffers ?? []).map((c) => ({
            ...c,
            endDate: c.endDate != null ? String(c.endDate) : null,
        })),
    };
}

const PAYMENT_OPTIONS = [
  {
    id: 'online',
    name: 'Pay Online',
    desc: 'UPI, Cards, Netbanking',
    icon: Zap,
    badgeBg: 'bg-[#3395FF]',
    badgeText: 'text-white',
    tag: 'RECOMMENDED',
  },
  {
    id: 'credit',
    name: 'DiSCCO',
    desc: 'Buy Now, Pay Later',
    icon: CreditCard,
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-600',
  },
  {
    id: 'wallet',
    name: 'Horeca1 Credit',
    desc: 'Buy Now, Pay Later',
    icon: CreditCard,
    badgeBg: 'bg-yellow-50',
    badgeText: 'text-yellow-600',
  },
  {
    id: 'bank_transfer',
    name: 'Bank Transfer',
    desc: 'NEFT / RTGS / IMPS',
    icon: Banknote,
    badgeBg: 'bg-green-50',
    badgeText: 'text-green-600',
  },
  {
    id: 'po_number',
    name: 'PO Number',
    desc: 'Enterprise purchase order',
    icon: FileText,
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-600',
  },
];

const PAYMENT_TO_VENDOR_MODE: Record<string, string> = {
  online: 'prepaid',
  credit: 'credit',
  wallet: 'prepaid',
  bank_transfer: 'prepaid',
  po_number: 'cheque',
};

const DEFAULT_VENDOR_PAYMENT_MODES = ['cod', 'prepaid', 'credit', 'cheque', 'online'];

// ─── Inline "Delivering to" row + outlet switcher dropdown ──────────────────
// Colocated with the checkout page because it's the only consumer. Uses the
// shared `useBusinessAccountSwitcher` for switching, plus a one-off fetch of
// the active account's outlets to get the full address line (the hook only
// exposes id/name/pincode).
interface OutletDetail {
    id: string;
    name: string;
    addressLine: string;
    city: string | null;
    state: string | null;
    pincode: string | null;
    requiresAddressUpdate: boolean;
}

function DeliveringToRow() {
    const {
        currentAccount,
        currentOutlet,
        activeBusinessAccountId,
        activeOutletId,
        switchOutlet,
        switching,
    } = useBusinessAccountSwitcher();
    const { savedAddresses, setSelectedAddress } = useAddress();
    const [outletDetails, setOutletDetails] = useState<OutletDetail[]>([]);
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fetch the full outlet records (with addressLine) for the active account.
    useEffect(() => {
        if (!activeBusinessAccountId) return;
        let cancelled = false;
        fetch(`/api/v1/account/${activeBusinessAccountId}/outlets`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                if (json?.success && Array.isArray(json.data)) {
                    setOutletDetails(json.data as OutletDetail[]);
                }
            })
            .catch(() => { /* silent — falls back to currentOutlet name only */ });
        return () => { cancelled = true; };
    }, [activeBusinessAccountId]);

    // Close on outside click.
    useEffect(() => {
        if (!open) return;
        const onMouseDown = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [open]);

    if (!currentOutlet || !activeBusinessAccountId) return null;

    const activeDetail = outletDetails.find((o) => o.id === currentOutlet.id);
    const addressLine = [
        activeDetail?.addressLine,
        activeDetail?.city,
        activeDetail?.state,
        activeDetail?.pincode ?? currentOutlet.pincode ?? null,
    ].filter(Boolean).join(', ');
    const otherOutlets = outletDetails.filter((o) => o.id !== currentOutlet.id);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 relative" ref={dropdownRef}>
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 shrink-0 rounded-xl bg-green-50 flex items-center justify-center">
                    <MapPin size={16} className="text-[#53B175]" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Delivering to</p>
                    <p className="text-[14px] font-bold text-[#181725] truncate mt-0.5">
                        {currentOutlet.name}
                        {currentAccount?.displayName && (
                            <span className="text-gray-400 font-medium"> · {currentAccount.displayName}</span>
                        )}
                    </p>
                    {addressLine ? (
                        <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">{addressLine}</p>
                    ) : (
                        <p className="text-[11px] text-amber-600 font-semibold mt-0.5">No address on this outlet</p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-[#53B175] hover:bg-green-50/50 text-[12px] font-bold text-gray-700 hover:text-[#53B175] transition-colors cursor-pointer"
                >
                    Change
                    <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
            </div>

            {currentOutlet.requiresAddressUpdate && (
                <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-orange-50 border border-orange-100 rounded-xl">
                    <AlertCircle size={14} className="text-orange-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-orange-700">This outlet has no delivery address yet</p>
                        <p className="text-[11px] text-orange-600 mt-0.5">Add one before placing the order.</p>
                    </div>
                    <Link
                        href={`/account/${activeBusinessAccountId}/outlets`}
                        className="shrink-0 px-3 py-1.5 bg-orange-600 text-white text-[11px] font-bold rounded-lg hover:bg-orange-700 transition-colors"
                    >
                        Edit Outlet
                    </Link>
                </div>
            )}

            {open && (
                <div className="absolute right-4 top-full mt-2 w-[280px] bg-white rounded-xl border border-gray-100 shadow-xl z-[10010] overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-100">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Switch outlet</p>
                    </div>
                    <ul className="max-h-[260px] overflow-y-auto">
                        {otherOutlets.length === 0 && (
                            <li className="px-3 py-3 text-[12px] text-gray-400 text-center">
                                No other outlets in this account
                            </li>
                        )}
                        {otherOutlets.map((o) => (
                            <li key={o.id}>
                                <button
                                    type="button"
                                    disabled={switching || o.id === activeOutletId}
                                    onClick={async () => {
                                        await switchOutlet(o.id);
                                        // Keep h1_addr in sync with the chosen outlet so
                                        // place-order stamps the deliver-to store, not a stale primary.
                                        // No match → clear cookie so resolveStorefrontContext falls through to JWT.
                                        const match = savedAddresses.find((a) => a.outletId === o.id);
                                        if (match) setSelectedAddress(match);
                                        else setSelectedAddress(null);
                                        setOpen(false);
                                    }}
                                    className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-left transition-colors"
                                >
                                    <MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-bold text-[#181725] truncate">{o.name}</p>
                                        <p className="text-[10px] text-gray-400 truncate">
                                            {[o.addressLine, o.city, o.pincode].filter(Boolean).join(', ') || 'No address'}
                                        </p>
                                        {o.requiresAddressUpdate && (
                                            <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Address needed</p>
                                        )}
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="px-3 py-2 border-t border-gray-100">
                        <Link
                            href={`/account/${activeBusinessAccountId}/outlets`}
                            className="text-[11px] font-bold text-[#53B175] hover:underline"
                            onClick={() => setOpen(false)}
                        >
                            Manage outlets →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

function CheckoutPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { groups, clearCart, removeFromCart, isCartLoading } = useCart();
    const { status: sessionStatus } = useSession();

    useEffect(() => {
        if (sessionStatus === 'unauthenticated') {
            const qs = searchParams?.toString();
            const returnTo = qs ? `/checkout?${qs}` : '/checkout';
            router.replace(`/login?redirect=${encodeURIComponent(returnTo)}`);
        }
    }, [sessionStatus, router, searchParams]);
    const { currentOutlet, activeBusinessAccountId, activeOutletId } = useBusinessAccountSwitcher();
    const { selectedAddress } = useAddress();
    // Outlet on JWT is optional — saved "Deliver to" address is enough (server resolves at order time).
    const hasDeliverableAddress = Boolean(
        activeOutletId ||
        (selectedAddress?.pincode && /^\d{6}$/.test(selectedAddress.pincode)) ||
        (selectedAddress?.fullAddress && selectedAddress.fullAddress.trim().length > 5),
    );
    const needsDeliveryAddress = !hasDeliverableAddress;
    const checkoutBlocked =
        needsDeliveryAddress || (!!currentOutlet && currentOutlet.requiresAddressUpdate);
    const [step, setStep] = useState<CheckoutStep>('review');
    const [selectedPayment, setSelectedPayment] = useState('');
    const [orderSnapshot, setOrderSnapshot] = useState<{ groups: VendorCartGroup[], total: number, count: number } | null>(null);
    // Vendor credit lines (DiSCCO), keyed by vendorId — fetched once from
    // GET /api/v1/wallet and used to show available credit / block placement
    // per vendor group when "Pay via Credit" is selected.
    const [creditWalletsByVendor, setCreditWalletsByVendor] = useState<Record<string, CustomerCreditWallet>>({});
    const [creditWalletsLoaded, setCreditWalletsLoaded] = useState(false);
    const [walletBalance, setWalletBalance] = useState<number | null>(null);
    const [platformWallet, setPlatformWallet] = useState<CustomerCreditWallet | null>(null);
    const [bankTransferInput, setBankTransferInput] = useState('');
    const [poNumberInput, setPoNumberInput] = useState('');
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [orderError, setOrderError] = useState<string | null>(null);
    const [placedOrderIds, setPlacedOrderIds] = useState<string[]>([]);
    const [excludedVendorIds, setExcludedVendorIds] = useState<Set<string>>(new Set());
    const [slotByVendor, setSlotByVendor] = useState<Record<string, string | null>>({});
    // Per-vendor order notes / delivery instructions (Req 7).
    const [notesByVendor, setNotesByVendor] = useState<Record<string, string>>({});
    // Promo Engine Phase 1 — coupon + Rewards Wallet (prepaid cashback balance,
    // distinct from DiSCCO / Horeca1 platform credit lines).
    const [couponInput, setCouponInput] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; name: string; estimatedDiscount: number; stacksWithWallet: boolean } | null>(null);
    const [couponError, setCouponError] = useState<string | null>(null);
    const [couponValidating, setCouponValidating] = useState(false);
    const [rewardsBalance, setRewardsBalance] = useState(0);
    const [useRewardsWallet, setUseRewardsWallet] = useState(false);
    // Auto-applied vendor "Store Offer" promotions (Promotion model) — previewed
    // server-side so the summary shows the discount the order will deduct. These
    // are the EFFECTIVE values: a non-stacking coupon suppresses them server-side.
    const [autoPromoDiscount, setAutoPromoDiscount] = useState(0);
    const [autoPromos, setAutoPromos] = useState<PromoPreviewResponse['autoPromos']>([]);
    const [bxgyFreeItems, setBxgyFreeItems] = useState<NonNullable<PromoPreviewResponse['bxgyFreeItems']>>([]);
    // Server-authoritative subtotal from the preview — the price the order will
    // actually use (a pricelist can differ from the optimistic client cart).
    const [previewSubtotal, setPreviewSubtotal] = useState<number | null>(null);
    const [estimatedCashback, setEstimatedCashback] = useState<PromoPreviewResponse['estimatedCashback']>(null);
    const [offerChoices, setOfferChoices] = useState<CheckoutOfferChoicesView>(EMPTY_OFFER_CHOICES);
    // Soften totals while a preview refetch is in flight; keep prior values
    // instead of clearing to null (which snaps the bill to client totals).
    const [promoPreviewUpdating, setPromoPreviewUpdating] = useState(false);
    // Collapsible vendor cards — collapsed by default for compact checkout.
    const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
    const [allowedModesByVendor, setAllowedModesByVendor] = useState<Record<string, string[]>>({});
    const toggleVendorExpand = (vendorId: string) => {
        setExpandedVendors(prev => { const next = new Set(prev); if (next.has(vendorId)) next.delete(vendorId); else next.add(vendorId); return next; });
    };

    const draftId = searchParams.get('draft');
    const [draftOrder, setDraftOrder] = useState<DraftOrderDetail | null>(null);
    const [draftLoading, setDraftLoading] = useState(false);

    useEffect(() => {
        if (!draftId) return;
        setDraftLoading(true);
        dal.orders.getById(draftId)
            .then((res) => {
                const payload = res as { data?: DraftOrderDetail } | DraftOrderDetail;
                const orderData = (payload && 'data' in payload ? payload.data : payload) as DraftOrderDetail | undefined;
                if (orderData?.id && orderData.status === 'draft') {
                    setDraftOrder(orderData);
                    // Skip review step and go straight to payment step
                    setStep('payment');
                } else if (orderData?.id) {
                    setOrderError('This order has already been submitted.');
                } else {
                    setOrderError('Could not load draft order details.');
                }
            })
            .catch(err => {
                setOrderError(err instanceof Error ? err.message : 'Could not load draft order details.');
            })
            .finally(() => setDraftLoading(false));
    }, [draftId]);

    const mappedDraftGroup = useMemo<VendorCartGroup | null>(() => {
        if (!draftOrder) return null;

        const cartItems: CartItem[] = draftOrder.items.map((item: DraftOrderItem) => {
            const product: VendorProduct = {
                id: item.productId,
                name: item.productName,
                displayName: item.productName,
                description: '',
                price: Number(item.unitPrice),
                images: item.product?.imageUrl ? [item.product.imageUrl] : (item.product?.images && item.product.images.length > 0 ? item.product.images : ['/images/recom-product/product-img10.png']),
                category: '',
                packSize: '',
                unit: '',
                stock: 9999,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                vendorId: draftOrder.vendorId,
                vendorName: draftOrder.vendor?.businessName || 'Vendor',
                bulkPrices: [],
                creditBadge: true,
                minOrderQuantity: 1
            };
            
            return {
                productId: item.productId,
                product,
                quantity: item.quantity
            };
        });

        return {
            vendorId: draftOrder.vendorId,
            vendorName: draftOrder.vendor?.businessName || 'Vendor',
            vendorLogo: draftOrder.vendor?.logoUrl || undefined,
            subtotal: Number(draftOrder.totalAmount),
            subtotalTaxable: Number(draftOrder.subtotal),
            totalGST: Number(draftOrder.totalAmount) - Number(draftOrder.subtotal),
            minOrderValue: 0,
            meetsMinOrder: true,
            items: cartItems
        };
    }, [draftOrder]);

    const activeGroups = useMemo(() => {
        if (draftOrder && mappedDraftGroup) {
            return [mappedDraftGroup];
        }
        return groups;
    }, [draftOrder, mappedDraftGroup, groups]);

    const selectedGroups = useMemo(
        () => activeGroups.filter(g => !excludedVendorIds.has(g.vendorId) && g.meetsMinOrder),
        [activeGroups, excludedVendorIds]
    );
    /** Included vendors regardless of MOV — for cart totals when payment is still locked. */
    const includedGroups = useMemo(
        () => activeGroups.filter(g => !excludedVendorIds.has(g.vendorId)),
        [activeGroups, excludedVendorIds]
    );
    const selectedTotal = useMemo(
        () => selectedGroups.reduce((sum, g) => sum + g.subtotal, 0),
        [selectedGroups]
    );
    const includedTotal = useMemo(
        () => includedGroups.reduce((sum, g) => sum + g.subtotal, 0),
        [includedGroups]
    );
    const selectedItemCount = useMemo(
        () => selectedGroups.reduce((sum, g) => sum + g.items.reduce((a: number, i: CartItem) => a + i.quantity, 0), 0),
        [selectedGroups]
    );
    const includedItemCount = useMemo(
        () => includedGroups.reduce((sum, g) => sum + g.items.reduce((a: number, i: CartItem) => a + i.quantity, 0), 0),
        [includedGroups]
    );
    const selectedVendorCount = selectedGroups.length;
    const paymentLockedByMov = selectedGroups.length === 0 && includedGroups.some(g => !g.meetsMinOrder);

    const availablePaymentOptions = useMemo(() => {
        const vendorIds = selectedGroups.map((g) => g.vendorId);
        let modes: Set<string>;
        if (!vendorIds.length) {
            modes = new Set(DEFAULT_VENDOR_PAYMENT_MODES);
        } else {
            modes = new Set(allowedModesByVendor[vendorIds[0]] ?? DEFAULT_VENDOR_PAYMENT_MODES);
            for (const vid of vendorIds.slice(1)) {
                const next = new Set(allowedModesByVendor[vid] ?? DEFAULT_VENDOR_PAYMENT_MODES);
                modes = new Set([...modes].filter((m) => next.has(m)));
            }
        }

        return PAYMENT_OPTIONS.filter((opt) => {
            if (!modes.has(PAYMENT_TO_VENDOR_MODE[opt.id] ?? opt.id)) return false;
            // Hide DiSCCO unless at least one selected PO has that supplier's line
            if (opt.id === 'credit') {
                if (!creditWalletsLoaded) return false;
                return selectedGroups.some((g) => !!creditWalletsByVendor[g.vendorId]);
            }
            // Hide Horeca1 Credit unless a platform credit line exists
            if (opt.id === 'wallet') {
                if (!creditWalletsLoaded) return false;
                return !!platformWallet;
            }
            return true;
        });
    }, [selectedGroups, allowedModesByVendor, creditWalletsLoaded, creditWalletsByVendor, platformWallet]);

    const toggleVendor = (vendorId: string) => {
        setExcludedVendorIds(prev => {
            const next = new Set(prev);
            if (next.has(vendorId)) next.delete(vendorId);
            else next.add(vendorId);
            return next;
        });
    };

    // Scroll to top when step changes so payment options are not scrolled out of view
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [step]);

    React.useEffect(() => {
        if (step !== 'payment' || sessionStatus !== 'authenticated') return;
        const vendorIds = selectedGroups.map((g) => g.vendorId);
        if (!vendorIds.length) return;
        fetch(`/api/v1/checkout/payment-modes?vendorIds=${vendorIds.join(',')}`)
            .then((r) => r.json())
            .then((j) => { if (j.success) setAllowedModesByVendor(j.data as Record<string, string[]>); })
            .catch(() => {});
    }, [step, sessionStatus, selectedGroups]);

    React.useEffect(() => {
        if (availablePaymentOptions.length > 0 && !availablePaymentOptions.some((o) => o.id === selectedPayment)) {
            setSelectedPayment(availablePaymentOptions[0].id);
        }
    }, [availablePaymentOptions, selectedPayment]);

    // Load the customer's credit wallets
    React.useEffect(() => {
        if (step !== 'payment' || sessionStatus !== 'authenticated' || creditWalletsLoaded) return;
        fetch('/api/v1/wallet')
            .then(r => r.json())
            .then((d: { data?: CustomerCreditWallet[] }) => {
                const wallets = d.data ?? [];
                const byVendor: Record<string, CustomerCreditWallet> = {};
                let pWallet: CustomerCreditWallet | null = null;
                for (const w of wallets) {
                    if (w.vendorId) {
                        byVendor[w.vendorId] = w;
                    } else if (pWallet === null) {
                        pWallet = w;
                    }
                }
                setCreditWalletsByVendor(byVendor);
                setPlatformWallet(pWallet);
                setWalletBalance(pWallet ? Number(pWallet.availableCredit) || 0 : null);
            })
            .catch(() => {})
            .finally(() => setCreditWalletsLoaded(true));
    }, [step, sessionStatus, creditWalletsLoaded]);

    // For each selected vendor group, resolve its credit line (vendor-specific
    // wallet, falling back to the H1 platform wallet) and whether placing the
    // order via credit is allowed for that group.
    const creditEligibility = useMemo(() => {
        return selectedGroups.map(group => {
            const wallet = creditWalletsByVendor[group.vendorId] ?? null;
            const available = wallet ? Number(wallet.availableCredit) || 0 : 0;
            const blocked = wallet
                ? wallet.status === 'BLACKLISTED' || wallet.status === 'BLOCKED'
                    || wallet.status === 'FROZEN' || wallet.status === 'SUSPENDED'
                    || wallet.status === 'EXPIRED' || wallet.status === 'CANCELLED'
                : false;
            const insufficient = !wallet || available < group.subtotal;
            return {
                group,
                wallet,
                available,
                remaining: available - group.subtotal,
                blocked,
                ok: !!wallet && !blocked && available >= group.subtotal,
                reason: !wallet
                    ? 'No DiSCCO credit with this supplier.'
                    : blocked
                        ? `This credit line is ${wallet.status.toLowerCase()}.`
                        : insufficient
                            ? 'Available credit is less than this order amount.'
                            : null,
            };
        });
    }, [selectedGroups, creditWalletsByVendor]);

    const creditAllSelectionsValid = creditEligibility.length > 0 && creditEligibility.every(c => c.ok);

    // Rewards Wallet balance (cashback earnings) — loaded at the payment step.
    useEffect(() => {
        if (step !== 'payment' || sessionStatus !== 'authenticated') return;
        fetch('/api/v1/promotions/rewards')
            .then(r => r.json())
            .then((d: { success?: boolean; data?: { walletBalance?: number } }) => {
                if (d?.success) setRewardsBalance(Number(d.data?.walletBalance ?? 0));
            })
            .catch(() => {});
    }, [step, sessionStatus]);

    // The items the checkout will actually order — the same source the order is
    // placed from, so the promo/coupon preview matches the order exactly.
    const buildItemsPayload = () =>
        selectedGroups.flatMap(g => g.items
            .filter((i: CartItem) => !i.isPromoFree)
            .map((i: CartItem) => ({
                productId: i.productId,
                vendorId: g.vendorId,
                quantity: i.quantity,
            })));

    // Preview auto promos (+ optional coupon) against the cart items. Returns the
    // effective post-suppression values. Throws on transport/HTTP error.
    const fetchPromoPreview = async (code?: string): Promise<PromoPreviewResponse> => {
        const items = buildItemsPayload();
        if (items.length === 0) {
            return {
                subtotal: 0,
                subtotalTaxable: 0,
                totalGST: 0,
                autoPromos: [],
                totalPromoDiscount: 0,
                coupon: null,
                estimatedCashback: null,
                offerChoices: EMPTY_OFFER_CHOICES,
            };
        }
        const res = await fetch('/api/v1/promotions/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items,
                ...(code ? { code } : {}),
                useWallet: useRewardsWallet,
            }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || 'Could not load offers');
        return json.data as PromoPreviewResponse;
    };

    const applyPreviewPayload = (data: PromoPreviewResponse) => {
        setPreviewSubtotal(Number(data.subtotal) || 0);
        setAutoPromoDiscount(Number(data.totalPromoDiscount) || 0);
        setAutoPromos(data.autoPromos || []);
        setBxgyFreeItems(data.bxgyFreeItems || []);
        setEstimatedCashback(data.estimatedCashback ?? null);
        setOfferChoices(normalizeOfferChoices(data.offerChoices));
    };

    // Auto-applied vendor promos — previewed on BOTH the review and payment
    // steps and refreshed whenever the selected vendors/quantities change, so
    // the Store Offer + payable are consistent from the first step. Coupon-aware
    // fetches are handled separately by applyCoupon/removeCoupon.
    const selectedItemsSig = useMemo(
        () => selectedGroups.map(g => `${g.vendorId}:${g.items.map((i: CartItem) => `${i.productId}x${i.quantity}`).join(',')}`).join('|'),
        [selectedGroups],
    );
    useEffect(() => {
        if (sessionStatus !== 'authenticated' || draftId) return;
        if (selectedGroups.length === 0) {
            // Cart reload blips briefly empty selection — keep the last preview
            // so payable does not snap to client/₹0 then jump back.
            if (!isCartLoading) {
                setPreviewSubtotal(null);
                setAutoPromoDiscount(0);
                setAutoPromos([]);
                setBxgyFreeItems([]);
                setEstimatedCashback(null);
                setOfferChoices(EMPTY_OFFER_CHOICES);
                setPromoPreviewUpdating(false);
            }
            return;
        }
        let cancelled = false;
        setPromoPreviewUpdating(true);
        const t = setTimeout(() => {
            fetchPromoPreview(appliedCoupon?.code)
                .then(data => {
                    if (cancelled) return;
                    applyPreviewPayload(data);
                })
                .catch(() => {})
                .finally(() => { if (!cancelled) setPromoPreviewUpdating(false); });
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedItemsSig, sessionStatus, draftId, isCartLoading, useRewardsWallet]);

    const applyCouponCode = async (rawCode: string) => {
        const code = rawCode.trim().toUpperCase();
        if (!code) return;
        setCouponValidating(true);
        setCouponError(null);
        try {
            const data = await fetchPromoPreview(code);
            applyPreviewPayload(data);
            const c = data.coupon;
            if (c && c.valid) {
                setAppliedCoupon({
                    code: c.code,
                    name: c.name,
                    estimatedDiscount: Number(c.estimatedDiscount) || 0,
                    stacksWithWallet: c.stacksWithWallet !== false,
                });
                setCouponInput(c.code);
                if (c.stacksWithWallet === false) setUseRewardsWallet(false);
            } else {
                setAppliedCoupon(null);
                setCouponError((c && !c.valid ? c.message : null) || 'Invalid coupon code');
            }
        } catch (err) {
            setAppliedCoupon(null);
            setCouponError(err instanceof Error ? err.message : 'Could not validate coupon');
        } finally {
            setCouponValidating(false);
        }
    };

    const applyCoupon = async () => {
        await applyCouponCode(couponInput);
    };

    // Removing a coupon restores any auto promos it had suppressed.
    const removeCoupon = async () => {
        setAppliedCoupon(null);
        setCouponInput('');
        setCouponError(null);
        if (draftId) return;
        try {
            const data = await fetchPromoPreview();
            applyPreviewPayload(data);
        } catch { /* keep the prior estimate on failure */ }
    };

    // Display estimates — the order transaction recomputes everything
    // server-side; these only drive the summary card. Sequence mirrors the
    // server: subtotal → vendor promo → coupon → wallet. Use the server-priced
    // subtotal (from the preview) once loaded so the line, discounts and total
    // all match what the order charges; fall back to the client cart total.
    // When MOV blocks every vendor, still show cart line totals (not ₹0 / 0 items).
    const summarySubtotal = selectedGroups.length > 0
        ? (previewSubtotal != null ? previewSubtotal : selectedTotal)
        : includedTotal;
    const promoDiscountEst = selectedGroups.length > 0 ? Math.min(autoPromoDiscount, summarySubtotal) : 0;
    const afterPromo = selectedGroups.length > 0 ? Math.max(0, summarySubtotal - promoDiscountEst) : 0;
    const couponDiscountEst = selectedGroups.length > 0 && appliedCoupon
        ? Math.min(appliedCoupon.estimatedDiscount, afterPromo)
        : 0;
    const payableAfterCoupon = Math.max(0, afterPromo - couponDiscountEst);
    // Online payments keep a ₹1 floor (Razorpay can't charge ₹0) — mirrors the server rule.
    const couponBlocksWallet = appliedCoupon?.stacksWithWallet === false;
    const walletUseEst = useRewardsWallet && !couponBlocksWallet
        ? Math.min(rewardsBalance, Math.max(0, payableAfterCoupon - (selectedPayment === 'online' ? 1 : 0)))
        : 0;
    const estimatedPayable = Math.max(0, Math.round((payableAfterCoupon - walletUseEst) * 100) / 100);
    const billAmountClass = promoPreviewUpdating || couponValidating
        ? 'opacity-50 transition-opacity duration-200'
        : 'transition-opacity duration-200';

    const paidItemCount = useMemo(
        () => selectedGroups.reduce((sum, g) => sum + g.items.filter((i) => !i.isPromoFree).reduce((a, i) => a + i.quantity, 0), 0),
        [selectedGroups],
    );
    const freeItemCount = useMemo(
        () => (selectedGroups.length > 0 ? bxgyFreeItems.reduce((sum, item) => sum + item.quantity, 0) : 0),
        [bxgyFreeItems, selectedGroups.length],
    );
    const checkoutCaption = paymentLockedByMov
        ? `Cart ₹${includedTotal.toLocaleString('en-IN')} · ${includedItemCount} item${includedItemCount !== 1 ? 's' : ''} — meet vendor minimums to pay`
        : promoTotalCaption({
            paidItemCount: paidItemCount || includedItemCount,
            freeItemCount,
            totalPay: estimatedPayable || afterPromo,
        });
    const freeItemsValue = useMemo(
        () => bxgyFreeItems.reduce((sum, item) => {
            const cartItem = selectedGroups.flatMap((g) => g.items).find((c) => c.productId === item.productId);
            const unit = cartItem?.product?.price ?? 0;
            return sum + unit * item.quantity;
        }, 0),
        [bxgyFreeItems, selectedGroups],
    );
    const hasContractPricing = selectedGroups.some((g) =>
        g.items.some((i) => i.product.customerPriceApplied),
    );
    const promoLabel = autoPromos.length === 1 ? autoPromos[0].promotionName : undefined;

    const walletEligibility = useMemo(() => {
        if (!creditWalletsLoaded) return { ok: false, loading: true, reason: 'Loading Horeca1 platform credit…' };
        if (!platformWallet) {
            return { ok: false, reason: 'Horeca1 Credit is not available for this account.' };
        }
        const available = Number(platformWallet.availableCredit) || 0;
        const blocked = platformWallet.status === 'BLACKLISTED' || platformWallet.status === 'BLOCKED'
            || platformWallet.status === 'FROZEN' || platformWallet.status === 'SUSPENDED'
            || platformWallet.status === 'EXPIRED' || platformWallet.status === 'CANCELLED';
        const insufficient = available < selectedTotal;
        return {
            wallet: platformWallet,
            available,
            remaining: available - selectedTotal,
            blocked,
            ok: !blocked && available >= selectedTotal,
            reason: blocked
                ? `Horeca1 platform credit is ${platformWallet.status.toLowerCase()}.`
                : insufficient
                    ? 'Available platform credit is less than the total order amount.'
                    : null,
        };
    }, [platformWallet, selectedTotal, creditWalletsLoaded]);

    const handlePlaceOrder = async () => {
        if (selectedGroups.length === 0) {
            setOrderError('Select at least one vendor PO to place.');
            return;
        }
        if (needsDeliveryAddress) {
            setOrderError('Select a delivery address before placing orders. Use Deliver to in the navbar.');
            return;
        }
        // V2.2: an outlet without an address cannot receive deliveries. Block the
        // order here as well, even though the button is disabled below — defence
        // in depth in case state changes between render and click.
        if (currentOutlet?.requiresAddressUpdate) {
            setOrderError('Add a delivery address to this outlet before placing the order.');
            return;
        }
        setIsPlacingOrder(true);
        setOrderError(null);
        try {
            const vendorOrders = selectedGroups.map(group => ({
                vendorId: group.vendorId,
                items: group.items.map((item: CartItem) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                })),
                ...(slotByVendor[group.vendorId] ? { deliverySlotId: slotByVendor[group.vendorId] as string } : {}),
                ...(notesByVendor[group.vendorId]?.trim() ? { notes: notesByVendor[group.vendorId].trim() } : {}),
            }));

            // 1. Create or submit order (draft vs new order)
            let createdOrders: Array<{ id: string; orderNumber: string }> = [];
            if (draftId) {
                const submitRes = await dal.orders.submitDraft(draftId, selectedPayment) as {
                    id: string;
                    orderNumber: string;
                };
                if (!submitRes || !submitRes.id || !submitRes.orderNumber) {
                    throw new Error('Failed to submit draft order.');
                }
                createdOrders = [submitRes];
            } else {
                const result = await dal.orders.create(vendorOrders, selectedPayment, false, {
                    ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
                    ...(useRewardsWallet && walletUseEst > 0 ? { useWallet: true } : {}),
                }) as {
                    orders: Array<{ id: string; orderNumber: string }>;
                };
                createdOrders = result.orders || [];
            }

            // 2. For online payment: open ONE combined Razorpay popup for all selected POs
            if (selectedPayment === 'online') {
                await loadRazorpayScript();

                const initiateRes = await fetch('/api/v1/payments/initiate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderIds: createdOrders.map(o => o.id) }),
                });
                const initiateData = await initiateRes.json();
                if (!initiateRes.ok) throw new Error(initiateData.error?.message || 'Payment initiation failed');

                const { razorpay_order_id, amount, currency, key_id } = initiateData.data;

                const description = createdOrders.length === 1
                    ? `Order ${createdOrders[0].orderNumber}`
                    : `${createdOrders.length} orders · ${createdOrders[0].orderNumber} +${createdOrders.length - 1}`;

                let payment: RazorpaySuccessPayload;
                try {
                    payment = await openRazorpayPopup({
                        key: key_id,
                        amount,
                        currency,
                        order_id: razorpay_order_id,
                        description,
                    });
                } catch (popupErr) {
                    // Dismiss / cancel — roll back pending orders + reserved stock.
                    await fetch('/api/v1/payments/abandon', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ razorpay_order_id }),
                    }).catch(() => { /* best-effort; reconciliation is the safety net */ });
                    throw popupErr;
                }

                // Single verify call covers all linked Payment rows on the backend.
                const verifyRes = await fetch('/api/v1/payments/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        razorpay_order_id: payment.razorpay_order_id,
                        razorpay_payment_id: payment.razorpay_payment_id,
                        razorpay_signature: payment.razorpay_signature,
                    }),
                });
                const verifyData = await verifyRes.json();
                if (!verifyRes.ok) {
                    await fetch('/api/v1/payments/abandon', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ razorpay_order_id }),
                    }).catch(() => { /* best-effort */ });
                    throw new Error(verifyData.error?.message || 'Payment verification failed');
                }
            }

            // 3. Show confirmation
            setPlacedOrderIds(createdOrders.map(o => o.orderNumber || o.id));
            setOrderSnapshot({ groups: [...selectedGroups], total: selectedTotal, count: selectedVendorCount });
            
            // Remove only the placed vendor groups from cart; leave unselected ones intact.
            if (!draftId) {
                const placedAllGroups = selectedGroups.length === groups.length;
                if (placedAllGroups) {
                    clearCart();
                } else {
                    selectedGroups.forEach(g => g.items.forEach((i: CartItem) => removeFromCart(i.productId)));
                }
            } else {
                clearCart();
            }

            // Redirect to dedicated order-success page
            const ids = createdOrders.map((o: { id: string }) => o.id).join(',');
            const lastVendor = selectedGroups[selectedGroups.length - 1]?.vendorId || '';
            window.location.href = `/order-success?ids=${ids}&vendor=${lastVendor}`;
            return;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to place order. Please try again.';
            setOrderError(msg);
        } finally {
            setIsPlacingOrder(false);
        }
    };

    // Draft PO (Req 7): persist the selected vendor POs without reserving stock /
    // charging / clearing the cart. Submitted later from My Orders.
    const handleSaveDraft = async () => {
        if (selectedGroups.length === 0) { setOrderError('Select at least one vendor PO to save.'); return; }
        if (needsDeliveryAddress) {
            setOrderError('Select a delivery address before saving a draft. Use Deliver to in the navbar.');
            return;
        }
        setIsPlacingOrder(true);
        setOrderError(null);
        try {
            const vendorOrders = selectedGroups.map(group => ({
                vendorId: group.vendorId,
                items: group.items.map((item: CartItem) => ({ productId: item.productId, quantity: item.quantity })),
                ...(slotByVendor[group.vendorId] ? { deliverySlotId: slotByVendor[group.vendorId] as string } : {}),
                ...(notesByVendor[group.vendorId]?.trim() ? { notes: notesByVendor[group.vendorId].trim() } : {}),
            }));
            await dal.orders.create(vendorOrders, selectedPayment || 'cod', true);
            clearCart();
            window.location.href = '/orders?status=draft';
        } catch (err: unknown) {
            setOrderError(err instanceof Error ? err.message : 'Failed to save draft.');
        } finally {
            setIsPlacingOrder(false);
        }
    };

    if (draftLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50">
                <Loader2 size={36} className="text-[#53B175] animate-spin mb-4" />
                <p className="text-[14px] text-gray-400 font-medium">Loading draft order details...</p>
            </div>
        );
    }

    if (!draftId && groups.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
                <div className="text-center">
                    <p className="text-[48px] mb-3">🛒</p>
                    <p className="text-[18px] font-bold text-gray-800 mb-2">Your cart is empty</p>
                    <Link href="/" className="text-[14px] text-[#53B175] font-semibold hover:underline">
                        Browse vendors
                    </Link>
                </div>
            </div>
        );
    }

    // Redirect to login if unauthenticated
    if (sessionStatus === 'unauthenticated') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50">
                <Loader2 size={36} className="text-[#53B175] animate-spin mb-4" />
                <p className="text-[14px] text-gray-400 font-medium">Redirecting to login...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50 pb-24">
            {/* Header */}
            <div className="bg-white border-b border-gray-100">
                <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-4">
                    <Link href={draftId ? "/orders" : "/cart"} className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-700 mb-2">
                        <ChevronLeft size={16} />
                        {draftId ? "Back to orders" : "Back to cart"}
                    </Link>
                    <h1 className="text-[20px] md:text-[24px] font-bold text-[#181725]">Checkout</h1>

                    {/* Steps */}
                    <div className="flex items-center gap-2 mt-3">
                        {[
                            { key: 'review', label: 'Review PO' },
                            { key: 'payment', label: 'Payment' },
                            { key: 'confirmation', label: 'Confirmed' },
                        ].map((s, idx) => (
                            <React.Fragment key={s.key}>
                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                                    step === s.key
                                        ? 'bg-[#53B175] text-white shadow-md shadow-green-200'
                                        : (idx < ['review', 'payment', 'confirmation'].indexOf(step))
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-gray-100 text-gray-400'
                                }`}>
                                    <span>{idx + 1}</span>
                                    <span className="hidden sm:inline">{s.label}</span>
                                </div>
                                {idx < 2 && <div className="w-6 h-px bg-gray-200" />}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-4">
                {/* === STEP 1: REVIEW === */}
                {step === 'review' && (
                    <div className="space-y-4">
                        {/* V2.2: Delivering-to row — the active outlet is the single source of
                           truth for delivery address. Includes inline switcher + blocking
                           warning if the outlet still needs an address. */}
                        <DeliveringToRow />

                        <div className="flex items-end justify-between gap-3 flex-wrap">
                            <h2 className="text-[15px] font-bold text-[#181725]">
                                Purchase Order{groups.length > 1 ? 's' : ''} — {groups.length} vendor{groups.length > 1 ? 's' : ''}
                            </h2>
                            {groups.length > 1 && (
                                <p className="text-[11px] font-medium text-gray-500">
                                    Uncheck any vendor to place their PO later
                                </p>
                            )}
                        </div>

                        {groups.map((group) => {
                            const belowMov = !group.meetsMinOrder;
                            const isSelected = !excludedVendorIds.has(group.vendorId) && !belowMov;
                            const movGap = Math.max(0, (group.minOrderValue || 0) - group.subtotal);
                            return (
                            <div
                                key={group.vendorId}
                                className={`bg-white rounded-2xl border overflow-hidden transition-all ${
                                    isSelected ? 'border-gray-100' : 'border-gray-100 opacity-80'
                                }`}
                            >
                                {/* Vendor Header */}
                                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/80 border-b border-gray-100">
                                    {groups.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => !belowMov && toggleVendor(group.vendorId)}
                                            disabled={belowMov}
                                            aria-label={isSelected ? `Deselect ${group.vendorName}` : `Select ${group.vendorName}`}
                                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                                                belowMov
                                                    ? 'bg-gray-100 border-gray-200 cursor-not-allowed'
                                                    : isSelected ? 'bg-[#53B175] border-[#53B175]' : 'bg-white border-gray-300'
                                            }`}
                                        >
                                            {isSelected && <Check size={13} className="text-white" strokeWidth={4} />}
                                        </button>
                                    )}
                                    {group.vendorLogo && (
                                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1 border border-gray-100 relative overflow-hidden">
                                            <Image src={group.vendorLogo} alt={group.vendorName} fill className="object-contain" />
                                        </div>
                                    )}
                                    <div className="flex-1 cursor-pointer" onClick={() => toggleVendorExpand(group.vendorId)}>
                                        <p className="text-[13px] font-bold text-[#181725]">{group.vendorName}</p>
                                        <p className="text-[10px] text-gray-400 font-medium flex items-center gap-1 flex-wrap">
                                            <Clock size={10} />
                                            {(() => {
                                                const paid = group.items.filter((i) => !i.isPromoFree).reduce((a, i) => a + i.quantity, 0);
                                                const free = group.promoSummary
                                                    ? group.promoSummary.freeLines.reduce((s, l) => s + l.quantity, 0)
                                                    : group.items.filter((i) => i.isPromoFree).reduce((a, i) => a + i.quantity, 0)
                                                      + group.items.reduce(
                                                          (a, i) => a + ((i.bxgyFreeQty ?? 0) || (i.schemeFreeQty ?? 0)),
                                                          0,
                                                        );
                                                if (free > 0) {
                                                    return `${paid} paid + ${free} free · ${group.promoSummary?.promotionName ?? 'Offer applied'}`;
                                                }
                                                return `${group.items.length} item${group.items.length > 1 ? 's' : ''} · Min ₹${(group.minOrderValue || 0).toLocaleString('en-IN')}`;
                                            })()}
                                        </p>
                                    </div>
                                    <span className="text-[14px] font-bold text-[#181725] mr-1">₹{group.subtotal.toLocaleString('en-IN')}</span>
                                    <button type="button" onClick={() => toggleVendorExpand(group.vendorId)} className="shrink-0 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                                        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${expandedVendors.has(group.vendorId) ? 'rotate-180' : ''}`} />
                                    </button>
                                </div>

                                {/* MOV banner */}
                                {belowMov && (
                                    <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 text-[12px] font-semibold text-red-700 flex items-center justify-between gap-3">
                                        <span>Add ₹{movGap.toLocaleString('en-IN')} more to meet minimum order</span>
                                        <Link href={`/vendor/${group.vendorId}`} className="shrink-0 text-[11px] underline font-bold">
                                            Shop more
                                        </Link>
                                    </div>
                                )}

                                {group.promoSummary && (
                                    <div className="px-4 py-2 border-b border-purple-100/60">
                                        <VendorPromoBanner summary={group.promoSummary} />
                                    </div>
                                )}

                                {/* Collapsible item list + slot/notes */}
                                {expandedVendors.has(group.vendorId) ? (
                                    <>
                                    {/* Items */}
                                    {group.items.map((item) => {
                                        if (item.isPromoFree) {
                                            const freeLabel = item.product.displayName ?? item.product.name;
                                            return (
                                                <div key={item.productId} className="px-4 py-2 border-b border-gray-50">
                                                    <FreeGiftLine
                                                        name={freeLabel}
                                                        quantity={item.quantity}
                                                        image={item.product.images[0]}
                                                        packSize={item.product.packSize}
                                                        unitValueSaved={item.product.price}
                                                        compact
                                                    />
                                                </div>
                                            );
                                        }
                                        const itemLabel = item.product.displayName ?? item.product.name;
                                        return (
                                        <div key={item.productId} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50">
                                            <div className="w-8 h-8 bg-gray-50 rounded-md flex items-center justify-center p-0.5 shrink-0 relative overflow-hidden">
                                                <Image src={item.product.images[0] || '/images/recom-product/product-img10.png'} alt={itemLabel} fill className="object-contain" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {item.product.customerPriceApplied && <YourPriceChip />}
                                                    <p className="text-[12px] font-bold text-[#181725] line-clamp-1">{itemLabel}</p>
                                                </div>
                                                <p className="text-[10px] text-gray-400">
                                                    {item.product.packSize} × {item.quantity}
                                                    {item.product.customerPriceApplied && item.product.originalPrice != null && item.product.originalPrice > item.product.price && (
                                                        <span className="ml-1 line-through">₹{item.product.originalPrice}</span>
                                                    )}
                                                </p>
                                                <PaidLineWithBonus freeQty={(item.bxgyFreeQty ?? 0) || (item.schemeFreeQty ?? 0)} />
                                            </div>
                                            <span className="text-[12px] font-bold text-[#181725]">₹{(item.product.price * Math.max(0, item.quantity - (item.schemeFreeQty ?? 0))).toLocaleString('en-IN')}</span>
                                        </div>
                                        );
                                    })}

                                    {/* Delivery slot picker + order notes */}
                                    {isSelected && (
                                        <>
                                        <div className="px-4 py-3 bg-gray-50/50 border-t border-gray-100">
                                            <DeliverySlotPicker
                                                vendorId={group.vendorId}
                                                selectedSlotId={slotByVendor[group.vendorId] ?? null}
                                                onChange={(slotId) => setSlotByVendor(prev => ({ ...prev, [group.vendorId]: slotId }))}
                                            />
                                        </div>
                                        <div className="px-4 py-2.5 bg-gray-50/50 border-t border-gray-100">
                                            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Order notes (optional)</label>
                                            <textarea
                                                value={notesByVendor[group.vendorId] ?? ''}
                                                onChange={(e) => setNotesByVendor(prev => ({ ...prev, [group.vendorId]: e.target.value }))}
                                                rows={2}
                                                maxLength={1000}
                                                placeholder="e.g. deliver before noon, call on arrival…"
                                                className="w-full text-[12px] rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#53B175] resize-none"
                                            />
                                        </div>
                                        </>
                                    )}
                                    </>
                                ) : (
                                    /* Collapsed compact summary */
                                    <button
                                        type="button"
                                        onClick={() => toggleVendorExpand(group.vendorId)}
                                        className="w-full px-4 py-2 text-left text-[11px] text-gray-400 font-medium border-t border-gray-50 hover:bg-gray-50/50 transition-colors"
                                    >
                                        {group.items.slice(0, 3).map(i => i.product.displayName ?? i.product.name).join(', ')}{group.items.length > 3 ? ` +${group.items.length - 3} more` : ''}
                                        <span className="text-[#53B175] ml-1 font-bold">↓ expand</span>
                                    </button>
                                )}
                            </div>
                            );
                        })}

                        {/* Total */}
                        <div className="bg-white rounded-2xl border border-gray-100 p-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[13px]">
                                    <span className="text-gray-500 font-medium">Subtotal</span>
                                    <span className={`font-bold text-[#181725] ${billAmountClass}`}>₹{summarySubtotal.toLocaleString('en-IN')}</span>
                                </div>
                                <PromoSavingsSummary
                                    bxgyFreeItems={bxgyFreeItems}
                                    freeItemsValue={freeItemsValue}
                                    promoDiscount={promoDiscountEst}
                                    promoLabel={promoLabel}
                                    contractPricing={hasContractPricing}
                                />
                                {estimatedCashback && estimatedCashback.estimatedAmount > 0 && (
                                    <div className="flex items-center justify-between text-[13px]">
                                        <span className="text-amber-700 font-medium">Estimated cashback</span>
                                        <span className={`font-bold text-amber-600 ${billAmountClass}`}>+₹{estimatedCashback.estimatedAmount.toLocaleString('en-IN')}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between border-t border-dashed border-gray-200 pt-2">
                                    <span className="text-[14px] font-bold text-[#181725]">Total Payable</span>
                                    <span className={`text-[18px] font-bold text-[#53B175] ${billAmountClass}`}>₹{afterPromo.toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-2">
                                {checkoutCaption}
                                {!paymentLockedByMov && (promoDiscountEst > 0 || bxgyFreeItems.length > 0) ? ' · promotions applied' : ''}
                                {estimatedCashback && estimatedCashback.estimatedAmount > 0 ? ' Estimated cashback — credited after delivery.' : ''}
                            </p>
                        </div>

                        {needsDeliveryAddress && (
                            <div className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 font-medium flex items-start gap-2">
                                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    Select a delivery address before placing orders. Use <strong>Deliver to</strong> in the navbar to pick where your order should go.
                                </div>
                            </div>
                        )}

                        {currentOutlet?.requiresAddressUpdate && (
                            <div className="text-[13px] text-orange-700 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 font-medium flex items-start gap-2">
                                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    Your active outlet has no delivery address. {activeBusinessAccountId && (
                                        <Link
                                            href={`/account/${activeBusinessAccountId}/outlets`}
                                            className="underline font-bold hover:text-orange-800"
                                        >
                                            Add one now
                                        </Link>
                                    )} to continue.
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => setStep('payment')}
                            disabled={selectedVendorCount === 0 || checkoutBlocked}
                            className={`w-full py-3.5 text-[14px] font-bold rounded-xl shadow-lg transition-all ${
                                selectedVendorCount === 0 || checkoutBlocked
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                    : 'bg-[#53B175] text-white shadow-green-200/50 hover:bg-[#48a068] active:scale-[0.99]'
                            }`}
                        >
                            Continue to Payment →
                        </button>
                        {!draftId && (
                            <>
                                <button
                                    onClick={handleSaveDraft}
                                    disabled={selectedVendorCount === 0 || isPlacingOrder || checkoutBlocked}
                                    className="w-full mt-2 py-2.5 text-[13px] font-bold rounded-xl border border-gray-200 text-gray-500 hover:border-[#53B175] hover:text-[#53B175] hover:bg-[#53B175]/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                                >
                                    <FileText size={14} />
                                    Save as Draft
                                </button>
                                <p className="text-[10px] text-gray-400 text-center mt-1.5">Save without paying — submit later from My Orders</p>
                            </>
                        )}
                    </div>
                )}

                {/* === STEP 2: PAYMENT === */}
                {step === 'payment' && (
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 items-start">
                        {/* Left Column — Payment Options */}
                        <div className="space-y-4">
                            <div className="bg-white rounded-2xl border border-[#E2E2E2] overflow-hidden shadow-sm">
                                <div className="px-5 md:px-7 py-5 border-b border-[#F0F0F0] bg-[#FAFAFA] text-left">
                                    <h3 className="text-[17px] md:text-[19px] font-bold text-[#181725]">Select Payment Method</h3>
                                    <p className="text-[13px] text-gray-400 font-medium mt-0.5">Choose how you&apos;d like to pay</p>
                                </div>
                                <div className="divide-y divide-[#F5F5F5]">
                                    {availablePaymentOptions.length === 0 ? (
                                        <p className="px-5 py-6 text-[13px] text-amber-700 font-medium">No shared payment methods are enabled for all vendors in this order. Contact your suppliers.</p>
                                    ) : availablePaymentOptions.map((opt) => {
                                        const isSelected = selectedPayment === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setSelectedPayment(opt.id)}
                                                className={`w-full px-5 md:px-7 py-4 md:py-5 flex items-center gap-4 text-left transition-all ${isSelected ? 'bg-[#53B175]/5' : 'hover:bg-gray-50/60'}`}
                                            >
                                                {/* Icon badge */}
                                                <div className={`w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0 ${opt.badgeBg} ${opt.badgeText} border border-black/5`}>
                                                    <opt.icon size={20} />
                                                </div>
                                                
                                                {/* Label */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[15px] md:text-[16px] font-bold text-[#181725]">
                                                            {opt.name}
                                                        </span>
                                                        {('tag' in opt && opt.tag) && (
                                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${opt.id === 'online' ? 'bg-[#3395FF]/10 text-[#3395FF]' : 'bg-purple-100 text-purple-600'}`}>
                                                                {opt.tag}
                                                            </span>
                                                        )}

                                                        {/* Inline Balance badges */}
                                                        {opt.id === 'wallet' && creditWalletsLoaded && platformWallet && walletBalance !== null && (
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${walletBalance < selectedTotal ? 'bg-rose-50 text-rose-600' : 'bg-green-50 text-[#53B175]'}`}>
                                                                ₹{walletBalance.toLocaleString('en-IN')} available
                                                            </span>
                                                        )}

                                                        {opt.id === 'credit' && creditWalletsLoaded && selectedGroups.length === 1 && (() => {
                                                            const wallet = creditWalletsByVendor[selectedGroups[0].vendorId];
                                                            if (!wallet) return null;
                                                            const avail = Number(wallet.availableCredit) || 0;
                                                            const name = wallet.vendor?.businessName ?? selectedGroups[0].vendorName;
                                                            return (
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${avail < selectedGroups[0].subtotal ? 'bg-rose-50 text-rose-600' : 'bg-green-50 text-[#53B175]'}`}>
                                                                    {name} · ₹{avail.toLocaleString('en-IN')}
                                                                </span>
                                                            );
                                                        })()}
                                                        {opt.id === 'credit' && creditWalletsLoaded && selectedGroups.length > 1 && (
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${creditEligibility.every(c => c.ok) ? 'bg-green-50 text-[#53B175]' : 'bg-rose-50 text-rose-600'}`}>
                                                                {creditEligibility.every(c => c.ok) ? 'Per supplier' : 'Not available for all POs'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[12px] md:text-[13px] text-gray-400 font-medium block mt-0.5">{opt.desc}</span>
                                                </div>

                                                {/* Radio indicator */}
                                                <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'border-[#53B175]' : 'border-gray-300'}`}>
                                                    {isSelected && <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#53B175]" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Additional configuration panels (Bank Transfer input, PO number, etc.) on the left */}
                            {selectedPayment === 'bank_transfer' && (
                                <div className="bg-green-50 rounded-2xl p-5 border border-green-100 shadow-sm text-left">
                                    <p className="text-[13px] font-bold text-green-700 mb-2">Bank Account Details</p>
                                    <p className="text-[12px] text-green-600 mb-3 leading-relaxed">
                                        Transfer to: <strong className="text-green-800">Horeca1 Pvt Ltd</strong><br />
                                        A/C Number: <strong className="text-green-800">1234567890</strong><br />
                                        IFSC Code: <strong className="text-green-800">HDFC0001234</strong>
                                    </p>
                                    <input 
                                        type="text" 
                                        placeholder="Enter UTR / Transaction Ref Number..." 
                                        value={bankTransferInput} 
                                        onChange={(e) => setBankTransferInput(e.target.value)}
                                        className="w-full border border-green-200 bg-white rounded-xl px-4 py-3 text-[13px] font-bold outline-none focus:ring-1 focus:ring-[#53B175] placeholder:text-gray-400" 
                                    />
                                </div>
                            )}

                            {selectedPayment === 'po_number' && (
                                <div className="bg-orange-50 rounded-2xl p-5 border border-orange-100 shadow-sm text-left">
                                    <p className="text-[13px] font-bold text-orange-700 mb-2">Enter Purchase Order Number</p>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. PO-2024-001" 
                                        value={poNumberInput} 
                                        onChange={(e) => setPoNumberInput(e.target.value)}
                                        className="w-full border border-orange-200 bg-white rounded-xl px-4 py-3 text-[13px] font-bold outline-none focus:ring-1 focus:ring-[#53B175] placeholder:text-gray-400" 
                                    />
                                </div>
                            )}
                        </div>

                        {/* Right Column — Summary card & Actions (desktop sticky, mobile/tablet bottom) */}
                        <div className="space-y-4 lg:sticky lg:top-[80px]">
                            {/* Paying via widget */}
                            {selectedPayment && (
                                <div className="bg-white rounded-2xl border border-[#E2E2E2] px-5 py-4 flex items-center gap-3 shadow-sm text-left animate-in fade-in slide-in-from-top-1 duration-200">
                                    {(() => {
                                        const opt = PAYMENT_OPTIONS.find(o => o.id === selectedPayment);
                                        if (!opt) return null;
                                        return (
                                            <>
                                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${opt.badgeBg} ${opt.badgeText} border border-black/5`}>
                                                    <opt.icon size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-[12px] text-gray-400 font-medium">Paying via</p>
                                                    <p className="text-[14px] font-bold text-[#181725]">{opt.name}</p>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Credit Eligibility Cards */}
                            {selectedPayment === 'credit' && creditWalletsLoaded && (
                                <div className="space-y-3">
                                    {creditEligibility.map(({ group, wallet, available, remaining, ok, reason }) => (
                                        <div key={group.vendorId} className="bg-purple-50 rounded-2xl p-4 border border-purple-100 text-left shadow-sm">
                                            <div className="flex items-center gap-2 mb-2">
                                                <CreditCard size={15} className="text-purple-600" />
                                                <span className="text-[13px] font-bold text-purple-800 truncate">
                                                    {wallet?.vendor?.businessName ?? group.vendorName}
                                                </span>
                                            </div>
                                            <div className="space-y-1 text-[12px]">
                                                <div className="flex justify-between">
                                                    <span className="text-purple-600">Available</span>
                                                    <span className="font-bold text-purple-800">{wallet ? `₹${available.toLocaleString('en-IN')}` : '—'}</span>
                                                </div>
                                                {wallet && Number(wallet.outstandingAmount) > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="text-purple-600">Outstanding</span>
                                                        <span className="font-bold text-rose-600">₹{Number(wallet.outstandingAmount).toLocaleString('en-IN')}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between">
                                                    <span className="text-purple-600">This order</span>
                                                    <span className="font-bold text-purple-800">₹{group.subtotal.toLocaleString('en-IN')}</span>
                                                </div>
                                                <div className="flex justify-between border-t border-purple-100/50 pt-1 mt-1">
                                                    <span className="text-purple-600">After this order</span>
                                                    <span className={`font-bold ${remaining < 0 ? 'text-red-600' : 'text-purple-800'}`}>
                                                        {wallet ? `₹${remaining.toLocaleString('en-IN')}` : '—'}
                                                    </span>
                                                </div>
                                            </div>
                                            {!ok && reason && (
                                                <div className="mt-2.5 flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-lg p-2">
                                                    <AlertCircle size={13} className="text-red-500 shrink-0 mt-0.5" />
                                                    <p className="text-[10px] font-bold text-red-600">{reason}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {!creditAllSelectionsValid && (
                                        <div className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl p-3 text-left">
                                            DiSCCO requires a credit line with each supplier in this order.
                                        </div>
                                    )}
                                </div>
                            )}

                            {selectedPayment === 'wallet' && creditWalletsLoaded && platformWallet && (
                                <div className="bg-yellow-50 rounded-2xl p-4 border border-yellow-100 text-left shadow-sm">
                                    <div className="flex items-center gap-2 mb-2">
                                        <CreditCard size={15} className="text-yellow-600" />
                                        <span className="text-[13px] font-bold text-yellow-800">Horeca1 Credit</span>
                                    </div>
                                    <div className="space-y-1 text-[12px]">
                                        <div className="flex justify-between">
                                            <span className="text-yellow-600">Available</span>
                                            <span className="font-bold text-yellow-800">₹{walletBalance?.toLocaleString('en-IN') ?? '—'}</span>
                                        </div>
                                        {Number(platformWallet.outstandingAmount) > 0 && (
                                            <div className="flex justify-between">
                                                <span className="text-yellow-600">Outstanding</span>
                                                <span className="font-bold text-rose-600">₹{Number(platformWallet.outstandingAmount).toLocaleString('en-IN')}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between border-t border-yellow-200/50 pt-1 mt-1">
                                            <span className="text-yellow-600">This order</span>
                                            <span className="font-bold text-yellow-800">₹{selectedTotal.toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                    {!walletEligibility.ok && walletEligibility.reason && (
                                        <div className="mt-2.5 flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-lg p-2">
                                            <AlertCircle size={13} className="text-red-500 shrink-0 mt-0.5" />
                                            <p className="text-[10px] font-bold text-red-600">{walletEligibility.reason}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Coupon + Rewards Wallet (Promo Engine Phase 1) — drafts don't support promos */}
                            {!draftId && (
                                <CheckoutOffersPanel
                                    offerChoices={offerChoices}
                                    appliedCode={appliedCoupon?.code ?? null}
                                    appliedName={appliedCoupon?.name ?? null}
                                    appliedSavings={appliedCoupon?.estimatedDiscount ?? null}
                                    couponInput={couponInput}
                                    couponError={couponError}
                                    couponValidating={couponValidating}
                                    onCouponInputChange={(v) => { setCouponInput(v); setCouponError(null); }}
                                    onApplyInput={applyCoupon}
                                    onSelectCoupon={(code) => { void applyCouponCode(code); }}
                                    onRemoveCoupon={() => { void removeCoupon(); }}
                                    rewardsBalance={rewardsBalance}
                                    useRewardsWallet={useRewardsWallet}
                                    walletUseEst={walletUseEst}
                                    couponBlocksWallet={couponBlocksWallet}
                                    onToggleWallet={setUseRewardsWallet}
                                />
                            )}

                            {/* Summary card */}
                            <div className="bg-white rounded-2xl border border-[#E2E2E2] overflow-hidden shadow-sm text-left">
                                <div className="px-5 py-4 flex items-center gap-3 border-b border-[#F0F0F0] bg-gray-50/50">
                                    <div className="w-[30px] h-[30px] rounded-lg border border-[#E2E2E2] flex items-center justify-center shrink-0 bg-white">
                                        <FileText size={15} className="text-[#181725]" />
                                    </div>
                                    <span className="text-[14px] font-bold text-[#181725]">Final Summary</span>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div className="flex justify-between items-center text-[13px]">
                                        <span className="text-gray-500 font-medium">Subtotal</span>
                                        <span className={`font-bold text-[#181725] ${billAmountClass}`}>₹{summarySubtotal.toLocaleString('en-IN')}</span>
                                    </div>
                                    <PromoSavingsSummary
                                        bxgyFreeItems={bxgyFreeItems}
                                        freeItemsValue={freeItemsValue}
                                        promoDiscount={promoDiscountEst}
                                        promoLabel={promoLabel}
                                        contractPricing={hasContractPricing}
                                    />
                                    {couponDiscountEst > 0 && (
                                        <div className="flex justify-between items-center text-[13px]">
                                            <span className="text-gray-500 font-medium">Coupon ({appliedCoupon?.code})</span>
                                            <span className={`font-bold text-[#53B175] ${billAmountClass}`}>−₹{couponDiscountEst.toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    {walletUseEst > 0 && (
                                        <div className="flex justify-between items-center text-[13px]">
                                            <span className="text-gray-500 font-medium">H1 Wallet</span>
                                            <span className={`font-bold text-[#53B175] ${billAmountClass}`}>−₹{walletUseEst.toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    {estimatedCashback && estimatedCashback.estimatedAmount > 0 && (
                                        <div>
                                            <div className="flex justify-between items-center text-[13px]">
                                                <span className="text-amber-700 font-medium">Estimated cashback</span>
                                                <span className={`font-bold text-amber-600 ${billAmountClass}`}>+₹{estimatedCashback.estimatedAmount.toLocaleString('en-IN')}</span>
                                            </div>
                                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                                                Estimated cashback — credited after delivery{estimatedCashback.campaignName ? ` · ${estimatedCashback.campaignName}` : ''}
                                            </p>
                                        </div>
                                    )}
                                    <div className="border-t border-dashed border-[#D0D0D0] pt-4 flex justify-between items-baseline">
                                        <span className="text-[15px] font-bold text-[#181725]">Total Payable</span>
                                        <span className={`text-[22px] font-black text-[#53B175] ${billAmountClass}`}>₹{estimatedPayable.toLocaleString('en-IN')}</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 leading-normal">
                                        {checkoutCaption}
                                        {!paymentLockedByMov && (promoDiscountEst > 0 || couponDiscountEst > 0 || walletUseEst > 0) ? ' Discounts shown are estimates — exact amounts are confirmed at order placement.' : ''}
                                    </p>
                                </div>
                            </div>

                            {/* Errors */}
                            {needsDeliveryAddress && (
                                <div className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 font-semibold text-left flex items-start gap-2">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                    <span>
                                        No delivery address selected. Use <strong>Deliver to</strong> in the navbar.
                                    </span>
                                </div>
                            )}
                            {orderError && (
                                <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 font-semibold text-left">
                                    {orderError}
                                </div>
                            )}

                            {/* Action Button */}
                            <button
                                onClick={handlePlaceOrder}
                                disabled={
                                    checkoutBlocked ||
                                    !selectedPayment || 
                                    isPlacingOrder || 
                                    (selectedPayment === 'credit' && (!creditWalletsLoaded || !creditAllSelectionsValid)) ||
                                    (selectedPayment === 'wallet' && (!creditWalletsLoaded || !walletEligibility.ok))
                                }
                                className={`w-full py-4 text-[15px] font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                                    !checkoutBlocked &&
                                    selectedPayment && 
                                    !isPlacingOrder && 
                                    !(selectedPayment === 'credit' && (!creditWalletsLoaded || !creditAllSelectionsValid)) &&
                                    !(selectedPayment === 'wallet' && (!creditWalletsLoaded || !walletEligibility.ok))
                                        ? 'bg-[#53B175] hover:bg-[#48a068] text-white shadow-green-100/50 active:scale-[0.99]'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                }`}
                            >
                                {isPlacingOrder ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        {selectedPayment === 'online' ? 'Opening Payment...' : 'Placing Order...'}
                                    </>
                                ) : selectedPayment === 'online' ? 'Pay Online →' : 'Place Order →'}
                            </button>
                        </div>
                    </div>
                )}

                {/* === STEP 3: CONFIRMATION === */}
                {/* (kept for completeness — the success path hard-redirects to /order-success) */}
                {step === 'confirmation' && (
                    <div className="text-center py-8">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 size={40} className="text-[#53B175]" />
                        </div>
                        <h2 className="text-[22px] font-bold text-[#181725] mb-1">Order Placed!</h2>
                        <p className="text-[14px] text-gray-500 mb-6">
                            Your purchase order{(orderSnapshot?.count || 0) > 1 ? 's have' : ' has'} been sent to the vendor{(orderSnapshot?.count || 0) > 1 ? 's' : ''}.
                        </p>

                        {/* PO Summaries */}
                        <div className="space-y-3 text-left max-w-md mx-auto mb-6">
                            {(orderSnapshot?.groups || []).map((group, idx) => (
                                <div key={group.vendorId} className="bg-white rounded-2xl border border-gray-100 p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[12px] font-bold text-gray-400">{placedOrderIds[idx] || `PO-${idx + 1}`}</span>
                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pending Confirmation</span>
                                    </div>
                                    <p className="text-[14px] font-bold text-[#181725]">{group.vendorName}</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{group.items.length} items • ₹{group.subtotal.toLocaleString('en-IN')}</p>
                                    <div className="flex items-center gap-1 mt-1.5 text-[11px] text-blue-600 font-medium">
                                        <Clock size={10} />
                                        Delivery: Tomorrow morning
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                            <Link
                                href="/orders"
                                className="px-6 py-2.5 bg-[#53B175] text-white text-[13px] font-bold rounded-xl shadow-md shadow-green-200/50 hover:bg-[#48a068] transition-all"
                            >
                                View Orders
                            </Link>
                            <Link
                                href="/"
                                className="px-6 py-2.5 bg-gray-100 text-gray-700 text-[13px] font-bold rounded-xl hover:bg-gray-200 transition-all"
                            >
                                Continue Shopping
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// useSearchParams() requires a Suspense boundary in the App Router — without
// it `next build` fails prerendering this page.
export default function CheckoutPage() {
    return (
        <React.Suspense fallback={
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50">
                <Loader2 size={36} className="text-[#53B175] animate-spin mb-4" />
                <p className="text-[14px] text-gray-400 font-medium">Loading checkout...</p>
            </div>
        }>
            <CheckoutPageContent />
        </React.Suspense>
    );
}
