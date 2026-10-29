# Razorpay Offers Engine vs Horeca1 promotions

## Why `offers: []` / `display.offers: false` exist

On demo Test Mode (2026-10-29), Razorpay Checkout auto-attached **partner**
cashback offers (Cred UPI, Amazon Pay, etc.) from Razorpay’s Offers Engine.
Paying with those offers failed with:

`Offers-engine external offer not found`

Merchant Offers API (`GET /v1/offers`) returned **0** rows for the Test key —
these were not Horeca1-created dashboard offers.

## What we disable

| Layer | Behaviour |
|-------|-----------|
| Orders API `offers: []` | Suppresses Offers Engine default partner offers on new Razorpay orders |
| Checkout `display.offers: false` | Hides the partner-offers UI in Standard Checkout |

## What we do **not** disable

- Horeca1 coupons / cashback campaigns / store promotions (`/api/v1/promotions/*`)
- DiSCCO credit
- Vendor price lists / slabs

Those systems are independent of Razorpay Offers.

## Product decision (required before Live rollout)

**Keep** the suppression until Razorpay partner offers work reliably in Live Mode,
**or** product explicitly opts into Offers Engine and validates Test + Live.

Do not remove `razorpayOrderOfferFields()` without a signed-off retest of
partner offers on both modes.
