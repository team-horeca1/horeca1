-- Synthetic supplier payable for demo.horeca1.com only.
-- Refuses every other database. Does not touch production.
DO $$
BEGIN
  IF current_database() <> 'horeca1_demo' OR current_user <> 'horeca1_demo' THEN
    RAISE EXCEPTION 'Refusing to seed payables outside the demo database';
  END IF;
END $$;

INSERT INTO users (id, email, full_name, role, hcid_display)
VALUES
  ('11111111-1111-4111-8111-111111111101', 'demo-pay-supplier@example.com', 'Demo Kitchen Supply', 'vendor', 'HC-DEMO-PAY-S'),
  ('11111111-1111-4111-8111-111111111102', 'demo-pay-buyer@example.com', 'Demo Test Kitchen', 'customer', 'HC-DEMO-PAY-B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO business_accounts (id, legal_name, display_name, is_vendor, is_customer)
VALUES
  ('22222222-2222-4222-8222-222222222201', 'Demo Kitchen Supply Pvt Ltd', 'Demo Kitchen Supply', true, false),
  ('22222222-2222-4222-8222-222222222202', 'Demo Test Kitchen', 'Demo Test Kitchen', false, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendors (
  id, user_id, business_account_id, business_name, display_name, slug, vendor_code, platform_fee_pct, is_active, is_verified
)
VALUES (
  '33333333-3333-4333-8333-333333333301',
  '11111111-1111-4111-8111-111111111101',
  '22222222-2222-4222-8222-222222222201',
  'Demo Kitchen Supply',
  'Demo Kitchen Supply',
  'demo-kitchen-supply',
  'DEMO-PAY',
  8.00,
  true,
  true
)
ON CONFLICT (id) DO UPDATE
SET platform_fee_pct = 8.00, display_name = 'Demo Kitchen Supply', vendor_code = 'DEMO-PAY';

INSERT INTO outlets (id, business_account_id, name, address_line, city, state, pincode)
VALUES (
  '44444444-4444-4444-8444-444444444401',
  '22222222-2222-4222-8222-222222222202',
  'Demo Test Kitchen',
  '1 Demo Lane, Synthetic City',
  'Pune',
  'Maharashtra',
  '411001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO supplier_commission_agreements (id, vendor_id, rate_pct, effective_from, reason)
SELECT
  '55555555-5555-4555-8555-555555555501',
  '33333333-3333-4333-8333-333333333301',
  8.00,
  now() - interval '2 days',
  'Demo test rate. Explicit 8 percent, not the platform default.'
WHERE NOT EXISTS (
  SELECT 1 FROM supplier_commission_agreements
  WHERE vendor_id = '33333333-3333-4333-8333-333333333301' AND effective_to IS NULL AND rate_pct = 8.00
);

INSERT INTO orders (
  id, order_number, user_id, vendor_id, business_account_id, outlet_id,
  delivery_address_snapshot, status, subtotal, total_amount,
  payment_method, payment_status, delivered_at, notes
)
VALUES (
  '66666666-6666-4666-8666-666666666601',
  'PO-DEMO-PAID-01',
  '11111111-1111-4111-8111-111111111102',
  '33333333-3333-4333-8333-333333333301',
  '22222222-2222-4222-8222-222222222202',
  '44444444-4444-4444-8444-444444444401',
  '{"line":"1 Demo Lane, Synthetic City","city":"Pune"}'::jsonb,
  'delivered',
  12500.00,
  12500.00,
  'online',
  'paid',
  now() - interval '1 hour',
  'Synthetic demo order. Not a real customer.'
)
ON CONFLICT (id) DO UPDATE
SET status = 'delivered', payment_status = 'paid', payment_method = 'online',
    subtotal = 12500.00, total_amount = 12500.00, delivered_at = now() - interval '1 hour';

INSERT INTO payments (id, order_id, vendor_id, user_id, amount, currency, status, method)
VALUES (
  '77777777-7777-4777-8777-777777777701',
  '66666666-6666-4666-8666-666666666601',
  '33333333-3333-4333-8333-333333333301',
  '11111111-1111-4111-8111-111111111102',
  12500.00,
  'INR',
  'captured',
  'online'
)
ON CONFLICT (id) DO UPDATE SET status = 'captured', amount = 12500.00, method = 'online';

INSERT INTO supplier_payable_lines (
  id, order_id, vendor_id, status,
  commercial_base, collected_amount, refunded_amount, recognised_base,
  commission_rate_pct, commission_amount, net_payable,
  rate_snapshotted_at, breakdown
)
VALUES (
  '88888888-8888-4888-8888-888888888801',
  '66666666-6666-4666-8666-666666666601',
  '33333333-3333-4333-8333-333333333301',
  'eligible',
  12500.00, 12500.00, 0, 12500.00,
  8.00, 1000.00, 11500.00,
  now(),
  '{"taxTreatment":"tax_inclusive_subtotal_pending_client_confirmation","ratePct":"8.00","supplierPromo":"0.00","supplierCoupon":"0.00","platformCoupon":"0.00","grossCollected":"12500.00"}'::jsonb
)
ON CONFLICT (order_id) DO UPDATE
SET status = 'eligible',
    commercial_base = 12500.00,
    collected_amount = 12500.00,
    recognised_base = 12500.00,
    commission_rate_pct = 8.00,
    commission_amount = 1000.00,
    net_payable = 11500.00,
    vendor_id = '33333333-3333-4333-8333-333333333301',
    finance_batch_id = NULL;
