-- At most one primary Online Store per BusinessAccount.
-- Demote extras first (keep oldest per BA), then add a partial unique index.

UPDATE vendors v
SET is_primary_store = false
WHERE v.is_primary_store = true
  AND v.id NOT IN (
    SELECT keep_id FROM (
      SELECT DISTINCT ON (business_account_id) id AS keep_id
      FROM vendors
      WHERE is_primary_store = true
      ORDER BY business_account_id, created_at ASC
    ) kept
  );

CREATE UNIQUE INDEX IF NOT EXISTS vendors_one_primary_store_per_ba
  ON vendors (business_account_id)
  WHERE is_primary_store = true;
