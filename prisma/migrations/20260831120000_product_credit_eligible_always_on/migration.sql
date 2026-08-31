-- DiSCCO credit stays on for every product. Existing off rows are flipped on.
UPDATE "products" SET "credit_eligible" = true WHERE "credit_eligible" IS DISTINCT FROM true;
ALTER TABLE "products" ALTER COLUMN "credit_eligible" SET DEFAULT true;
