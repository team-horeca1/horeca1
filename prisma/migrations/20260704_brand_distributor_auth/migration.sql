-- Brand-only distributor approval: promote pending rows where brand already approved
UPDATE "BrandAuthorizedDistributor"
SET status = 'approved'
WHERE status = 'pending'
  AND "brandApprovedAt" IS NOT NULL
  AND "rejectedAt" IS NULL;
