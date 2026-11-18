-- Local pay-breakdown fixture. Database horeca1 on the local Docker Postgres only.
-- Refuses the demo database and any other user. Does not invent a Razorpay percentage.
DO $$
BEGIN
  IF current_database() <> 'horeca1' OR current_user <> 'horeca1' THEN
    RAISE EXCEPTION 'Refusing fee example seed outside local database horeca1';
  END IF;
END $$;

-- bcrypt of the local test password vendor123. This file refuses every database except local horeca1.
INSERT INTO users (id, email, full_name, role, hcid_display, password, profile_completed_at)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'fee-example-supply@example.com', 'Fee Example Supply', 'vendor', 'HC-FEE-EX', '$2b$10$C0RzPHpXF4yR3keMhOBjouL5mBrUY4/2aeLk8w/pwH.ubD6yQk1A.', now()),
  ('a2222222-2222-4222-8222-222222222222', 'missing-fee-supply@example.com', 'Missing Fee Supply', 'vendor', 'HC-FEE-MISS', '$2b$10$C0RzPHpXF4yR3keMhOBjouL5mBrUY4/2aeLk8w/pwH.ubD6yQk1A.', now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = 'vendor', password = EXCLUDED.password, profile_completed_at = now();

INSERT INTO users (id, email, full_name, role, hcid_display)
VALUES ('a3333333-3333-4333-8333-333333333333', 'fee-example-buyer@example.com', 'Fee Example Kitchen', 'customer', 'HC-FEE-BUY')
ON CONFLICT (id) DO NOTHING;

INSERT INTO business_accounts (id, legal_name, display_name, is_vendor, is_customer)
VALUES
  ('b1111111-1111-4111-8111-111111111111', 'Fee Example Supply Pvt Ltd', 'Fee Example Supply', true, false),
  ('b2222222-2222-4222-8222-222222222222', 'Missing Fee Supply Pvt Ltd', 'Missing Fee Supply', true, false),
  ('b3333333-3333-4333-8333-333333333333', 'Fee Example Kitchen', 'Fee Example Kitchen', false, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendors (
  id, user_id, business_account_id, business_name, display_name, slug, vendor_code, platform_fee_pct, is_active, is_verified
)
VALUES
  ('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'Fee Example Supply', 'Fee Example Supply', 'fee-example-supply', 'FEE-EX', 10.00, true, true),
  ('c2222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', 'b2222222-2222-4222-8222-222222222222', 'Missing Fee Supply', 'Missing Fee Supply', 'missing-fee-supply', 'FEE-MISS', 10.00, true, true)
ON CONFLICT (id) DO UPDATE
SET platform_fee_pct = 10.00, display_name = EXCLUDED.display_name, business_name = EXCLUDED.business_name, is_active = true;

INSERT INTO business_account_members (id, user_id, business_account_id, is_primary, accepted_at)
VALUES
  ('f1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', true, now()),
  ('f2222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', 'b2222222-2222-4222-8222-222222222222', true, now())
ON CONFLICT (user_id, business_account_id) DO UPDATE
SET is_primary = true, accepted_at = now();

INSERT INTO outlets (id, business_account_id, name, address_line, city, state, pincode)
VALUES (
  'd4444444-4444-4444-8444-444444444444',
  'b3333333-3333-4333-8333-333333333333',
  'Fee Example Kitchen',
  '1 Fee Lane, Synthetic City',
  'Pune',
  'Maharashtra',
  '411001'
)
ON CONFLICT (id) DO NOTHING;

DELETE FROM audit_logs
WHERE (action = 'supplier_settlement.settle' AND after->>'utr' = 'FEELOCALUTR1')
   OR (action = 'supplier_commission.update' AND entity_id IN (
     'c1111111-1111-4111-8111-111111111111',
     'c2222222-2222-4222-8222-222222222222'
   ));

DELETE FROM supplier_settlement_claims
WHERE order_id IN ('d1111111-1111-4111-8111-111111111111', 'd2222222-2222-4222-8222-222222222222');

DELETE FROM supplier_payable_holds
WHERE line_id IN (
  SELECT id FROM supplier_payable_lines
  WHERE order_id IN ('d1111111-1111-4111-8111-111111111111', 'd2222222-2222-4222-8222-222222222222')
);

DELETE FROM supplier_payable_events
WHERE order_id IN ('d1111111-1111-4111-8111-111111111111', 'd2222222-2222-4222-8222-222222222222');

UPDATE supplier_payable_lines SET finance_batch_id = NULL
WHERE vendor_id IN ('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222');

DELETE FROM finance_settlement_batches
WHERE vendor_id IN ('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222');

DELETE FROM supplier_payable_lines
WHERE vendor_id IN ('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222');

DELETE FROM supplier_commission_agreements
WHERE vendor_id IN ('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222');

INSERT INTO supplier_commission_agreements (id, vendor_id, rate_pct, effective_from, reason)
VALUES
  ('e5555555-5555-4555-8555-555555555551', 'c1111111-1111-4111-8111-111111111111', 10.00, now() - interval '2 days', 'Local test rate. Explicit 10 percent.'),
  ('e5555555-5555-4555-8555-555555555552', 'c2222222-2222-4222-8222-222222222222', 10.00, now() - interval '2 days', 'Local test rate. Explicit 10 percent.');

INSERT INTO orders (
  id, order_number, user_id, vendor_id, business_account_id, outlet_id,
  delivery_address_snapshot, status, subtotal, total_amount,
  payment_method, payment_status, delivered_at, notes
)
VALUES
  (
    'd1111111-1111-4111-8111-111111111111',
    'PO-FEE-100',
    'a3333333-3333-4333-8333-333333333333',
    'c1111111-1111-4111-8111-111111111111',
    'b3333333-3333-4333-8333-333333333333',
    'd4444444-4444-4444-8444-444444444444',
    '{"line":"1 Fee Lane, Synthetic City","city":"Pune"}'::jsonb,
    'delivered', 100.00, 100.00, 'online', 'paid', now() - interval '1 hour',
    'Local fee example. Not a real customer.'
  ),
  (
    'd2222222-2222-4222-8222-222222222222',
    'PO-FEE-MISS',
    'a3333333-3333-4333-8333-333333333333',
    'c2222222-2222-4222-8222-222222222222',
    'b3333333-3333-4333-8333-333333333333',
    'd4444444-4444-4444-8444-444444444444',
    '{"line":"1 Fee Lane, Synthetic City","city":"Pune"}'::jsonb,
    'delivered', 100.00, 100.00, 'online', 'paid', now() - interval '1 hour',
    'Local order with no Razorpay fee. Not a real customer.'
  )
ON CONFLICT (id) DO UPDATE
SET status = 'delivered', payment_status = 'paid', payment_method = 'online',
    subtotal = 100.00, total_amount = 100.00, delivered_at = now() - interval '1 hour',
    vendor_id = EXCLUDED.vendor_id;

INSERT INTO payments (
  id, order_id, vendor_id, user_id, amount, currency, status, method,
  razorpay_payment_id, razorpay_fee_paise, razorpay_tax_paise
)
VALUES
  (
    'e1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'c1111111-1111-4111-8111-111111111111',
    'a3333333-3333-4333-8333-333333333333',
    100.00, 'INR', 'captured', 'online',
    'pay_local_fee_100', 118, 18
  ),
  (
    'e2222222-2222-4222-8222-222222222222',
    'd2222222-2222-4222-8222-222222222222',
    'c2222222-2222-4222-8222-222222222222',
    'a3333333-3333-4333-8333-333333333333',
    100.00, 'INR', 'captured', 'online',
    NULL, NULL, NULL
  )
ON CONFLICT (id) DO UPDATE
SET status = 'captured', amount = 100.00, method = 'online',
    razorpay_payment_id = EXCLUDED.razorpay_payment_id,
    razorpay_fee_paise = EXCLUDED.razorpay_fee_paise,
    razorpay_tax_paise = EXCLUDED.razorpay_tax_paise;
