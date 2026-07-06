-- Brand-only distributor approval: promote pending rows where brand already approved
UPDATE "brand_authorized_distributors"
SET "status" = 'approved'
WHERE "status" = 'pending'
  AND "brand_approved_at" IS NOT NULL
  AND "rejected_at" IS NULL;
