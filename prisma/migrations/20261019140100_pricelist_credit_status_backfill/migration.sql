-- Backfill: segment values like "credit:active" → credit_status.
-- Split from 20261019140000 because Postgres forbids using a newly
-- added enum value in the same transaction that adds it.

UPDATE "price_list_assignments"
SET
  "type" = 'credit_status'::"price_list_assignment_type",
  "credit_status" = lower(substring("segment" from 8)),
  "segment" = NULL
WHERE "type" = 'segment'
  AND "segment" IS NOT NULL
  AND "segment" ILIKE 'credit:%';
