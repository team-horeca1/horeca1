-- Prisma generates these ids in the client. A database default makes schema drift fail CI.
ALTER TABLE "finance_settlement_batches" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "finance_settlement_events" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "supplier_commission_agreements" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "supplier_payable_events" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "supplier_payable_holds" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "supplier_payable_lines" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "supplier_settlement_claims" ALTER COLUMN "id" DROP DEFAULT;
