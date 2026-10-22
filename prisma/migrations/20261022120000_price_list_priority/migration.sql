-- Zoho-style price lists: same-level overlap tie-breaker (lower wins).
ALTER TABLE "price_lists"
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
