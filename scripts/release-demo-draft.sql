DO $$
BEGIN
  IF current_database() <> 'horeca1_demo' OR current_user <> 'horeca1_demo' THEN
    RAISE EXCEPTION 'Refusing to change anything outside the demo database';
  END IF;
END $$;

UPDATE finance_settlement_batches
SET status = 'cancelled',
    cancel_reason = 'Returned the demo order to Ready so it can be paid from the screen',
    cancelled_at = now()
WHERE id = '565e2e94-02fe-488a-8d75-4304f658868f'
  AND status = 'draft';

UPDATE supplier_payable_lines
SET status = 'eligible',
    finance_batch_id = NULL
WHERE order_id = '66666666-6666-4666-8666-666666666601'
  AND status = 'in_batch';

UPDATE supplier_settlement_claims
SET released_at = now()
WHERE order_id = '66666666-6666-4666-8666-666666666601'
  AND released_at IS NULL;
