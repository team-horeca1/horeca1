-- Zoho-style price lists: same-level overlap tie-breaker (lower wins).
ALTER TABLE "price_lists"
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "price_lists_vendor_priority_idx"
  ON "price_lists"("vendor_id", "priority");
