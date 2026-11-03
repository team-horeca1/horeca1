-- Optional per-outlet billing name. Null keeps using the business name.
-- Existing outlet rows stay null. Addresses are not rewritten.
ALTER TABLE "outlets" ADD COLUMN "billing_name" VARCHAR(255);
